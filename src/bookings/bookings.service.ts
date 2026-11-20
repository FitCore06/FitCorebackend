import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Role, type AuthUserPayload } from '../auth/auth.types.js';
import { gymRole } from '../auth/guards/roles.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  BookingStatus,
  type BookingDto,
  type BookingStatusValue,
} from './booking.types.js';
import type { CreateBookingDto } from './dto/create-booking.dto.js';

const includeHistory = {
  member: true,
  trainer: true,
  history: { orderBy: { createdAt: 'asc' as const } },
};

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(row: Awaited<ReturnType<typeof this.fetchOne>>): BookingDto {
    if (!row) throw new NotFoundException('Booking not found');
    return {
      id: row.id,
      memberEmail: row.member.email,
      memberName: row.member.name,
      trainerName: row.trainer.name,
      startAt: row.startAtLabel,
      status: row.status as BookingStatusValue,
      history: row.history.map((h) => ({
        at: h.createdAt.toISOString(),
        status: h.status as BookingStatusValue,
        note: h.note ?? undefined,
      })),
    };
  }

  private async fetchOne(id: string) {
    return this.prisma.sessionBooking.findUnique({
      where: { id },
      include: includeHistory,
    });
  }

  private async assertBranchAccess(
    tx: Prisma.TransactionClient,
    userId: string,
    branchId: string,
  ) {
    const [grantCount, grant] = await Promise.all([
      tx.userBranchAccess.count({ where: { userId } }),
      tx.userBranchAccess.findFirst({ where: { userId, branchId } }),
    ]);
    if (grantCount > 0 && !grant) {
      throw new ForbiddenException('User is not authorized for this branch');
    }
  }

  async listForMember(user: AuthUserPayload): Promise<BookingDto[]> {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) return [];

    const rows = await this.prisma.sessionBooking.findMany({
      where: { gymId: memberRole.gymId, memberUserId: user.id },
      include: includeHistory,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async listForTrainer(user: AuthUserPayload): Promise<BookingDto[]> {
    const trainerRole = user.roles.find((r) => r.role === Role.TRAINER);
    if (!trainerRole) return [];

    const rows = await this.prisma.sessionBooking.findMany({
      where: { gymId: trainerRole.gymId, trainerUserId: user.id },
      include: includeHistory,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async listForGym(user: AuthUserPayload, gymSlug: string): Promise<BookingDto[]> {
    const admin = gymRole(user, Role.GYM_ADMIN, gymSlug);
    if (!admin) throw new ForbiddenException('Gym admin only');

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: gymSlug.toLowerCase() },
    });
    if (!tenant) throw new NotFoundException('Gym not found');

    const rows = await this.prisma.sessionBooking.findMany({
      where: { gymId: tenant.id },
      include: includeHistory,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async create(user: AuthUserPayload, dto: CreateBookingDto): Promise<BookingDto> {
    const memberRole =
      user.roles.find(
        (r) =>
          r.role === Role.MEMBER &&
          (!dto.gymSlug || r.gymSlug === dto.gymSlug.toLowerCase()),
      ) ?? user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Members only');

    const assignment = await this.prisma.memberTrainerAssignment.findFirst({
      where: {
        gymId: memberRole.gymId,
        memberUserId: user.id,
        active: true,
      },
    });
    if (!assignment) {
      throw new BadRequestException(
        'No assigned trainer — owner must assign a trainer first',
      );
    }

    const row = await this.prisma.sessionBooking.create({
      data: {
        gymId: memberRole.gymId,
        memberUserId: user.id,
        trainerUserId: assignment.trainerUserId,
        startAtLabel: dto.startAtLabel.trim(),
        status: BookingStatus.REQUESTED,
        history: {
          create: {
            status: BookingStatus.REQUESTED,
            note: 'Member request',
          },
        },
      },
      include: includeHistory,
    });

    return this.toDto(row);
  }

  async adminCreate(
    user: AuthUserPayload,
    dto: {
      memberEmail: string;
      trainerEmail: string;
      startAtLabel: string;
      gymSlug?: string;
      branchId?: string;
    },
  ): Promise<BookingDto> {
    const slug =
      dto.gymSlug?.trim() ||
      user.roles.find((r) => r.role === Role.GYM_ADMIN)?.gymSlug;
    if (!slug) throw new BadRequestException('gymSlug required');
    const admin = gymRole(user, Role.GYM_ADMIN, slug);
    if (!admin) throw new ForbiddenException('Gym admin only');

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { slug: slug.toLowerCase() },
      });
      if (!tenant) throw new NotFoundException('Gym not found');

      const branch = await tx.branch.findFirst({
        where: dto.branchId
          ? { id: dto.branchId, gymId: tenant.id, status: 'active' }
          : { gymId: tenant.id, name: 'Main branch', status: 'active' },
      });
      if (!branch) throw new NotFoundException('Branch not found');

      const [memberRole, trainerRole] = await Promise.all([
        tx.userTenantRole.findFirst({
        where: {
          gymId: tenant.id,
          role: Role.MEMBER,
          user: { email: dto.memberEmail.toLowerCase() },
        },
        }),
        tx.userTenantRole.findFirst({
        where: {
          gymId: tenant.id,
          role: Role.TRAINER,
          user: { email: dto.trainerEmail.toLowerCase() },
        },
        }),
      ]);
      if (!memberRole || !trainerRole) {
        throw new NotFoundException('Member or trainer not found');
      }

      await Promise.all([
        this.assertBranchAccess(tx, memberRole.userId, branch.id),
        this.assertBranchAccess(tx, trainerRole.userId, branch.id),
      ]);

      const assignment = await tx.memberTrainerAssignment.findFirst({
      where: {
        gymId: tenant.id,
        memberUserId: memberRole.userId,
        trainerUserId: trainerRole.userId,
        active: true,
      },
      });
      const structuredMembership = await tx.memberMembership.findFirst({
        where: { gymId: tenant.id, memberUserId: memberRole.userId },
        orderBy: { createdAt: 'desc' },
      });
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const membershipAllowed = structuredMembership
        ? ['active', 'trial'].includes(structuredMembership.status) && structuredMembership.endsAt >= today
        : Boolean(assignment && ['active', 'trial'].includes(assignment.membershipStatus));
      if (!assignment || !membershipAllowed) {
        throw new BadRequestException(
          'Member does not have an active assignment with this trainer',
        );
      }

      const conflict = await tx.sessionBooking.findFirst({
      where: {
        gymId: tenant.id,
        trainerUserId: trainerRole.userId,
        startAtLabel: dto.startAtLabel.trim(),
        status: { notIn: [BookingStatus.CANCELLED, BookingStatus.COMPLETED] },
      },
      });
      if (conflict) {
        throw new BadRequestException('Trainer is unavailable at this time');
      }

      const row = await tx.sessionBooking.create({
      data: {
        gymId: tenant.id,
        memberUserId: memberRole.userId,
        trainerUserId: trainerRole.userId,
        startAtLabel: dto.startAtLabel.trim(),
        status: BookingStatus.CONFIRMED,
        history: {
          create: {
            status: BookingStatus.CONFIRMED,
            note: 'Booked by gym admin',
          },
        },
      },
      include: includeHistory,
      });
      return this.toDto(row);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async updateStatus(
    user: AuthUserPayload,
    id: string,
    status: BookingStatusValue,
    note?: string,
  ): Promise<BookingDto> {
    const row = await this.fetchOne(id);
    if (!row) throw new NotFoundException('Booking not found');
    await this.assertCanMutate(user, row);

    const updated = await this.prisma.sessionBooking.update({
      where: { id },
      data: {
        status,
        history: {
          create: { status, note },
        },
      },
      include: includeHistory,
    });
    return this.toDto(updated);
  }

  async reschedule(
    user: AuthUserPayload,
    id: string,
    startAtLabel: string,
  ): Promise<BookingDto> {
    const row = await this.fetchOne(id);
    if (!row) throw new NotFoundException('Booking not found');
    await this.assertCanMutate(user, row);

    const updated = await this.prisma.sessionBooking.update({
      where: { id },
      data: {
        startAtLabel: startAtLabel.trim(),
        status: BookingStatus.RESCHEDULED,
        history: {
          create: {
            status: BookingStatus.RESCHEDULED,
            note: `New time: ${startAtLabel.trim()}`,
          },
        },
      },
      include: includeHistory,
    });
    return this.toDto(updated);
  }

  private async assertCanMutate(
    user: AuthUserPayload,
    row: NonNullable<Awaited<ReturnType<typeof this.fetchOne>>>,
  ) {
    const isMember =
      user.id === row.memberUserId &&
      user.roles.some((r) => r.role === Role.MEMBER && r.gymId === row.gymId);
    const isTrainer =
      user.id === row.trainerUserId &&
      user.roles.some((r) => r.role === Role.TRAINER && r.gymId === row.gymId);
    const isAdmin = user.roles.some(
      (r) => r.role === Role.GYM_ADMIN && r.gymId === row.gymId,
    );

    if (!isMember && !isTrainer && !isAdmin) {
      throw new ForbiddenException('Not allowed to change this booking');
    }

    if (isMember && user.id !== row.memberUserId) {
      throw new ForbiddenException('Members can only change own bookings');
    }
  }
}
