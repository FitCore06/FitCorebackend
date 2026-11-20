import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Role, type AuthUserPayload } from '../auth/auth.types.js';
import { gymRole } from '../auth/guards/roles.guard.js';
import type { UpsertAssignmentDto } from './dto/upsert-assignment.dto.js';

export type AssignmentDto = {
  id: string;
  gymId: string;
  gymSlug: string;
  active: boolean;
  planLabel: string;
  membershipStatus: string;
  membershipNote: string | null;
  nextSessionNote: string | null;
  member: { userId: string; name: string; email: string };
  trainer: {
    userId: string;
    name: string;
    email: string;
    specialty: string | null;
    hasProfilePhoto: boolean;
  };
};

@Injectable()
export class AssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async trainerSpecialty(gymId: string, trainerUserId: string) {
    const profile = await this.prisma.trainerProfile.findUnique({
      where: { gymId_userId: { gymId, userId: trainerUserId } },
    });
    return profile?.specialty ?? 'General fitness';
  }

  private async withSpecialty<T extends { gymId: string; trainerUserId: string }>(
    row: T,
  ) {
    return {
      ...row,
      trainerSpecialty: await this.trainerSpecialty(row.gymId, row.trainerUserId),
    };
  }

  private toDto(
    row: Awaited<ReturnType<typeof this.loadAssignment>>,
  ): AssignmentDto {
    if (!row) throw new NotFoundException('Assignment not found');
    return {
      id: row.id,
      gymId: row.gymId,
      gymSlug: row.tenant.slug,
      active: row.active,
      planLabel: row.planLabel,
      membershipStatus: row.membershipStatus,
      membershipNote: row.membershipNote,
      nextSessionNote: row.nextSessionNote,
      member: {
        userId: row.member.id,
        name: row.member.name,
        email: row.member.email,
      },
      trainer: {
        userId: row.trainer.id,
        name: row.trainer.name,
        email: row.trainer.email,
        specialty: row.trainerSpecialty,
        hasProfilePhoto: Boolean(row.trainer.profilePhotoData),
      },
    };
  }

  private async loadAssignment(id: string) {
    const row = await this.prisma.memberTrainerAssignment.findUnique({
      where: { id },
      include: {
        tenant: true,
        member: true,
        trainer: true,
      },
    });
    if (!row) return null;
    return this.withSpecialty(row);
  }

  async listForGym(user: AuthUserPayload, gymSlug: string) {
    const admin = gymRole(user, Role.GYM_ADMIN, gymSlug);
    if (!admin) throw new BadRequestException('No admin access for this gym');

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: gymSlug.toLowerCase() },
    });
    if (!tenant) throw new NotFoundException('Gym not found');

    const rows = await this.prisma.memberTrainerAssignment.findMany({
      where: { gymId: tenant.id, active: true },
      include: { tenant: true, member: true, trainer: true },
      orderBy: { assignedAt: 'desc' },
    });

    return Promise.all(
      rows.map(async (row) => this.toDto(await this.withSpecialty(row))),
    );
  }

  async getMyAssignment(user: AuthUserPayload): Promise<AssignmentDto | null> {
    const memberRole =
      user.roles.find((r) => r.role === Role.MEMBER) ?? user.roles[0];
    if (!memberRole) return null;

    const row = await this.prisma.memberTrainerAssignment.findFirst({
      where: {
        gymId: memberRole.gymId,
        memberUserId: user.id,
        active: true,
      },
      include: { tenant: true, member: true, trainer: true },
    });
    if (!row) return null;
    return this.toDto(await this.withSpecialty(row));
  }

  async upsert(user: AuthUserPayload, dto: UpsertAssignmentDto) {
    const admin = gymRole(user, Role.GYM_ADMIN, dto.gymSlug);
    if (!admin) throw new BadRequestException('No admin access for this gym');

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.gymSlug.toLowerCase() },
    });
    if (!tenant) throw new NotFoundException('Gym not found');

    const member = await this.prisma.user.findUnique({
      where: { email: dto.memberEmail.toLowerCase() },
    });
    const trainer = await this.prisma.user.findUnique({
      where: { email: dto.trainerEmail.toLowerCase() },
    });
    if (!member || !trainer) {
      throw new NotFoundException('Member or trainer user not found');
    }

    const memberOk = await this.prisma.userTenantRole.findFirst({
      where: {
        userId: member.id,
        gymId: tenant.id,
        role: Role.MEMBER,
      },
    });
    const trainerOk = await this.prisma.userTenantRole.findFirst({
      where: {
        userId: trainer.id,
        gymId: tenant.id,
        role: Role.TRAINER,
      },
    });
    if (!memberOk || !trainerOk) {
      throw new BadRequestException('Member and trainer must belong to this gym');
    }

    const row = await this.prisma.memberTrainerAssignment.upsert({
      where: {
        gymId_memberUserId: {
          gymId: tenant.id,
          memberUserId: member.id,
        },
      },
      create: {
        gymId: tenant.id,
        memberUserId: member.id,
        trainerUserId: trainer.id,
        planLabel: dto.planLabel,
        membershipStatus: dto.membershipStatus,
        membershipNote: dto.membershipNote,
        nextSessionNote: dto.nextSessionNote,
        active: true,
      },
      update: {
        trainerUserId: trainer.id,
        planLabel: dto.planLabel,
        membershipStatus: dto.membershipStatus,
        membershipNote: dto.membershipNote,
        nextSessionNote: dto.nextSessionNote,
        active: true,
      },
      include: { tenant: true, member: true, trainer: true },
    });

    return this.toDto(await this.withSpecialty(row));
  }

  async listTrainerClients(user: AuthUserPayload) {
    const trainerRole = user.roles.find((r) => r.role === Role.TRAINER);
    if (!trainerRole) return [];

    const rows = await this.prisma.memberTrainerAssignment.findMany({
      where: {
        gymId: trainerRole.gymId,
        trainerUserId: user.id,
        active: true,
      },
      include: { member: true },
      orderBy: { assignedAt: 'desc' },
    });

    return rows.map((r) => ({
      email: r.member.email,
      name: r.member.name,
    }));
  }

  async deactivate(user: AuthUserPayload, id: string) {
    const row = await this.prisma.memberTrainerAssignment.findUnique({
      where: { id },
      include: { tenant: true },
    });
    if (!row) throw new NotFoundException('Assignment not found');
    const admin = gymRole(user, Role.GYM_ADMIN, row.tenant.slug);
    if (!admin) throw new ForbiddenException('Gym admin only');
    await this.prisma.memberTrainerAssignment.update({
      where: { id },
      data: { active: false },
    });
    return { ok: true };
  }
}