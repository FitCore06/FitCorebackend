import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { Role, type AuthUserPayload } from '../auth/auth.types.js';
import { gymRole } from '../auth/guards/roles.guard.js';
import { validateBase64Image } from '../common/image-upload.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpdateMemberProfileDto } from '../members/dto/update-member-profile.dto.js';
import type { CreateTrainerLeaveRequestDto } from './dto/create-trainer-leave-request.dto.js';
import type { ReviewTrainerLeaveRequestDto } from './dto/review-trainer-leave-request.dto.js';
import type { CreateGymTrainerDto } from './dto/create-gym-trainer.dto.js';

const MAX_PHOTO_BYTES = 2_500_000;

@Injectable()
export class TrainersService {
  constructor(private readonly prisma: PrismaService) {}

  async createForGym(
    user: AuthUserPayload,
    gymSlug: string,
    dto: CreateGymTrainerDto,
  ) {
    const gymId = await this.adminGymId(user, gymSlug);
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const created = await this.prisma.$transaction(async (tx) => {
      const trainer = await tx.user.create({
        data: {
          email,
          name: dto.name.trim(),
          phone: dto.phone?.trim() || null,
          passwordHash,
        },
      });
      await tx.userTenantRole.create({
        data: { userId: trainer.id, gymId, role: Role.TRAINER },
      });
      await tx.trainerProfile.create({
        data: {
          userId: trainer.id,
          gymId,
          specialty: dto.specialty?.trim() || 'General fitness',
        },
      });
      return trainer;
    });
    return { userId: created.id, name: created.name, email: created.email };
  }

  async listForGym(user: AuthUserPayload, gymSlug: string) {
    const admin = gymRole(user, Role.GYM_ADMIN, gymSlug);
    if (!admin) throw new ForbiddenException('Gym admin only');
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: gymSlug.toLowerCase() },
    });
    if (!tenant) throw new NotFoundException('Gym not found');

    const roles = await this.prisma.userTenantRole.findMany({
      where: { gymId: tenant.id, role: Role.TRAINER },
      include: { user: true },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const trainers = await Promise.all(
      roles.map(async (r) => {
        const profile = await this.prisma.trainerProfile.findUnique({
          where: {
            gymId_userId: { gymId: tenant.id, userId: r.userId },
          },
        });
        const clients = await this.prisma.memberTrainerAssignment.count({
          where: { gymId: tenant.id, trainerUserId: r.userId, active: true },
        });
        const sessionsToday = await this.prisma.sessionBooking.count({
          where: {
            gymId: tenant.id,
            trainerUserId: r.userId,
            createdAt: { gte: today },
            status: { not: 'cancelled' },
          },
        });
        const feedback = await this.prisma.trainerFeedback.aggregate({
          where: { gymId: tenant.id, trainerUserId: r.userId },
          _avg: { rating: true },
        });
        const floorStatus = profile?.floorStatus ?? 'off';
        return {
          id: r.userId,
          name: r.user.name,
          email: r.user.email,
          hasProfilePhoto: Boolean(r.user.profilePhotoData),
          specialty: profile?.specialty ?? 'General fitness',
          status: floorStatus as 'on-floor' | 'leave' | 'off',
          clients,
          sessionsToday,
          rating: Number((feedback._avg.rating ?? 4.8).toFixed(1)),
          liveStatus: profile?.liveStatus ?? 'off-duty',
          liveDetail: profile?.liveDetail ?? undefined,
          liveUpdatedAt: profile?.liveUpdatedAt.toISOString() ?? new Date().toISOString(),
        };
      }),
    );
    return trainers;
  }

  async getLiveForTrainer(user: AuthUserPayload) {
    const trainerRole = user.roles.find((r) => r.role === Role.TRAINER);
    if (!trainerRole) throw new ForbiddenException('Trainer only');
    const profile = await this.prisma.trainerProfile.findUnique({
      where: {
        gymId_userId: { gymId: trainerRole.gymId, userId: user.id },
      },
    });
    if (!profile) {
      return {
        status: 'in-session' as const,
        detail: 'PT with another client',
        updatedAt: new Date().toISOString(),
      };
    }
    return {
      status: profile.liveStatus,
      detail: profile.liveDetail ?? undefined,
      updatedAt: profile.liveUpdatedAt.toISOString(),
    };
  }

  async getLiveByTrainerId(user: AuthUserPayload, trainerUserId: string) {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Member only');
    const profile = await this.prisma.trainerProfile.findUnique({
      where: {
        gymId_userId: { gymId: memberRole.gymId, userId: trainerUserId },
      },
    });
    if (!profile) throw new NotFoundException('Trainer not found');
    return {
      status: profile.liveStatus,
      detail: profile.liveDetail ?? undefined,
      updatedAt: profile.liveUpdatedAt.toISOString(),
    };
  }

  async patchLive(
    user: AuthUserPayload,
    body: { status: string; detail?: string },
  ) {
    const trainerRole = user.roles.find((r) => r.role === Role.TRAINER);
    if (!trainerRole) throw new ForbiddenException('Trainer only');
    if (body.status === 'leave') {
      throw new BadRequestException('Leave status requires owner approval');
    }
    const profile = await this.prisma.trainerProfile.upsert({
      where: {
        gymId_userId: { gymId: trainerRole.gymId, userId: user.id },
      },
      create: {
        gymId: trainerRole.gymId,
        userId: user.id,
        liveStatus: body.status,
        liveDetail: body.detail,
        liveUpdatedAt: new Date(),
      },
      update: {
        liveStatus: body.status,
        liveDetail: body.detail,
        liveUpdatedAt: new Date(),
      },
    });
    return {
      status: profile.liveStatus,
      detail: profile.liveDetail ?? undefined,
      updatedAt: profile.liveUpdatedAt.toISOString(),
    };
  }

  async createLeaveRequest(
    user: AuthUserPayload,
    dto: CreateTrainerLeaveRequestDto,
  ) {
    const trainerRole = user.roles.find((r) => r.role === Role.TRAINER);
    if (!trainerRole) throw new ForbiddenException('Trainer only');
    const fromDate = this.parseDate(dto.fromDate);
    const toDate = this.parseDate(dto.toDate);
    if (toDate < fromDate) {
      throw new BadRequestException('Leave end date must be on or after start date');
    }
    const overlap = await this.prisma.trainerLeaveRequest.findFirst({
      where: {
        gymId: trainerRole.gymId,
        trainerUserId: user.id,
        status: { in: ['pending', 'approved'] },
        fromDate: { lte: toDate },
        toDate: { gte: fromDate },
      },
    });
    if (overlap) throw new BadRequestException('Overlapping leave request exists');
    return this.prisma.trainerLeaveRequest.create({
      data: {
        gymId: trainerRole.gymId,
        trainerUserId: user.id,
        fromDate,
        toDate,
        note: dto.note?.trim() || null,
      },
      include: { trainer: { select: { id: true, name: true, email: true } } },
    });
  }

  async listMyLeaveRequests(user: AuthUserPayload) {
    const trainerRole = user.roles.find((r) => r.role === Role.TRAINER);
    if (!trainerRole) throw new ForbiddenException('Trainer only');
    return this.prisma.trainerLeaveRequest.findMany({
      where: { gymId: trainerRole.gymId, trainerUserId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listLeaveRequests(user: AuthUserPayload, gymSlug: string) {
    const gymId = await this.adminGymId(user, gymSlug);
    return this.prisma.trainerLeaveRequest.findMany({
      where: { gymId },
      include: { trainer: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviewLeaveRequest(
    user: AuthUserPayload,
    gymSlug: string,
    requestId: string,
    dto: ReviewTrainerLeaveRequestDto,
  ) {
    const gymId = await this.adminGymId(user, gymSlug);
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.trainerLeaveRequest.findFirst({
        where: { id: requestId, gymId },
        include: { trainer: { select: { name: true } } },
      });
      if (!request) throw new ForbiddenException('Leave request not accessible');
      if (request.status !== 'pending') return request;

      const updated = await tx.trainerLeaveRequest.update({
        where: { id: request.id },
        data: {
          status: dto.status,
          reviewedByUserId: user.id,
          reviewedAt: new Date(),
        },
        include: { trainer: { select: { id: true, name: true, email: true } } },
      });

      if (dto.status === 'approved') {
        const detail = `Approved leave until ${request.toDate.toISOString().slice(0, 10)}`;
        await tx.trainerProfile.upsert({
          where: { gymId_userId: { gymId, userId: request.trainerUserId } },
          create: {
            gymId,
            userId: request.trainerUserId,
            floorStatus: 'leave',
            liveStatus: 'leave',
            liveDetail: detail,
            liveUpdatedAt: new Date(),
          },
          update: {
            floorStatus: 'leave',
            liveStatus: 'leave',
            liveDetail: detail,
            liveUpdatedAt: new Date(),
          },
        });
        const members = await tx.userTenantRole.findMany({
          where: { gymId, role: Role.MEMBER },
          select: { userId: true },
        });
        if (members.length) {
          await tx.gymNotification.createMany({
            data: members.map(({ userId }) => ({
              gymId,
              userId,
              title: 'Trainer leave approved',
              body: `${request.trainer.name} is on approved leave from ${request.fromDate.toISOString().slice(0, 10)} to ${request.toDate.toISOString().slice(0, 10)}.`,
            })),
          });
        }
      }
      return updated;
    });
  }

  private parseDate(value: string) {
    const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid leave date');
    return date;
  }

  private async adminGymId(user: AuthUserPayload, gymSlug: string) {
    const slug = gymSlug?.trim().toLowerCase();
    if (!slug || !gymRole(user, Role.GYM_ADMIN, slug)) {
      throw new ForbiddenException('Gym admin only');
    }
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new NotFoundException('Gym not found');
    return tenant.id;
  }

  async feedForTrainer(user: AuthUserPayload) {
    const trainerRole = user.roles.find((r) => r.role === Role.TRAINER);
    if (!trainerRole) return [];
    const rows = await this.prisma.memberTrainerAssignment.findMany({
      where: { gymId: trainerRole.gymId, trainerUserId: user.id, active: true },
      include: { member: true },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });
    return rows.map((r) => ({
      id: r.id,
      memberName: r.member.name,
      plan: r.planLabel,
      status: r.membershipStatus,
      note: r.membershipNote ?? '',
      at: r.updatedAt.toISOString(),
    }));
  }

  async getMyProfile(user: AuthUserPayload) {
    const trainerRole = user.roles.find((r) => r.role === Role.TRAINER);
    if (!trainerRole) throw new ForbiddenException('Trainer only');
    const [tenant, userRow, profile] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: trainerRole.gymId } }),
      this.prisma.user.findUnique({ where: { id: user.id } }),
      this.prisma.trainerProfile.findUnique({
        where: {
          gymId_userId: { gymId: trainerRole.gymId, userId: user.id },
        },
      }),
    ]);
    if (!userRow) throw new NotFoundException('User not found');
    return {
      userId: userRow.id,
      name: userRow.name,
      email: userRow.email,
      phone: userRow.phone,
      specialty: profile?.specialty ?? 'General fitness',
      hasProfilePhoto: Boolean(userRow.profilePhotoData),
      gymSlug: tenant?.slug ?? trainerRole.gymSlug,
      gymName: tenant?.name ?? 'Gym',
    };
  }

  async updateMyProfile(user: AuthUserPayload, dto: UpdateMemberProfileDto) {
    const trainerRole = user.roles.find((r) => r.role === Role.TRAINER);
    if (!trainerRole) throw new ForbiddenException('Trainer only');

    const data: {
      name?: string;
      phone?: string | null;
      profilePhotoMimeType?: string | null;
      profilePhotoData?: string | null;
    } = {};

    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.phone !== undefined) {
      const phone = dto.phone.trim();
      data.phone = phone.length ? phone : null;
    }

    if (dto.clearProfilePhoto) {
      data.profilePhotoMimeType = null;
      data.profilePhotoData = null;
    } else if (dto.profilePhotoBase64) {
      const photo = validateBase64Image({
        base64: dto.profilePhotoBase64,
        mimeType: dto.profilePhotoMimeType,
        maxBytes: MAX_PHOTO_BYTES,
        label: 'Profile photo',
      });
      data.profilePhotoMimeType = photo.mimeType;
      data.profilePhotoData = photo.base64;
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data,
      select: {
        id: true,
        name: true,
        profilePhotoData: true,
      },
    });

    return {
      userId: updated.id,
      name: updated.name,
      hasProfilePhoto: Boolean(updated.profilePhotoData),
    };
  }

  async getMyPhoto(user: AuthUserPayload) {
    const trainerRole = user.roles.find((r) => r.role === Role.TRAINER);
    if (!trainerRole) throw new ForbiddenException('Trainer only');
    return this.trainerPhotoPayload(user.id);
  }

  async getProfileForAssignedMember(
    user: AuthUserPayload,
    trainerUserId: string,
  ) {
    await this.assertMemberAssignedToTrainer(user, trainerUserId);
    return this.buildTrainerPublicProfile(trainerUserId, user);
  }

  async getPhotoForAssignedMember(
    user: AuthUserPayload,
    trainerUserId: string,
  ) {
    await this.assertMemberAssignedToTrainer(user, trainerUserId);
    return this.trainerPhotoPayload(trainerUserId);
  }

  private async assertMemberAssignedToTrainer(
    user: AuthUserPayload,
    trainerUserId: string,
  ) {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Member only');
    const assignment = await this.prisma.memberTrainerAssignment.findFirst({
      where: {
        gymId: memberRole.gymId,
        memberUserId: user.id,
        trainerUserId,
        active: true,
      },
    });
    if (!assignment) {
      throw new ForbiddenException('No active assignment with this trainer');
    }
  }

  private async buildTrainerPublicProfile(
    trainerUserId: string,
    memberUser: AuthUserPayload,
  ) {
    const memberRole = memberUser.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Member only');

    const [userRow, profile, tenant] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: trainerUserId } }),
      this.prisma.trainerProfile.findUnique({
        where: {
          gymId_userId: { gymId: memberRole.gymId, userId: trainerUserId },
        },
      }),
      this.prisma.tenant.findUnique({ where: { id: memberRole.gymId } }),
    ]);
    if (!userRow) throw new NotFoundException('Trainer not found');

    return {
      userId: userRow.id,
      name: userRow.name,
      email: userRow.email,
      phone: userRow.phone,
      specialty: profile?.specialty ?? 'General fitness',
      hasProfilePhoto: Boolean(userRow.profilePhotoData),
      gymSlug: tenant?.slug ?? memberRole.gymSlug,
      gymName: tenant?.name ?? 'Gym',
    };
  }

  private async trainerPhotoPayload(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { profilePhotoData: true, profilePhotoMimeType: true },
    });
    if (!user?.profilePhotoData) {
      throw new NotFoundException('No profile photo');
    }
    const mime = user.profilePhotoMimeType ?? 'image/jpeg';
    return {
      mimeType: mime,
      dataUrl: `data:${mime};base64,${user.profilePhotoData}`,
    };
  }
}
