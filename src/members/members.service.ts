import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Role, type AuthUserPayload } from '../auth/auth.types.js';
import { gymRole } from '../auth/guards/roles.guard.js';
import { validateBase64Image } from '../common/image-upload.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  REGISTRATION_INVITE_KIND,
  RegistrationInviteService,
} from '../auth/registration-invite.service.js';
import type { UpdateMemberProfileDto } from './dto/update-member-profile.dto.js';
import type { CreateGymMemberDto } from './dto/create-gym-member.dto.js';
import type { GymMemberDto } from './members.types.js';

const STATUS_VALUES = ['active', 'trial', 'frozen', 'expired'] as const;
const MAX_PHOTO_BYTES = 2_500_000;

function normalizeStatus(
  raw: string | undefined,
): GymMemberDto['status'] {
  if (raw && (STATUS_VALUES as readonly string[]).includes(raw)) {
    return raw as GymMemberDto['status'];
  }
  return 'unassigned';
}

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registrationInvites: RegistrationInviteService,
  ) {}

  private async tenantForSlug(gymSlug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: gymSlug.toLowerCase() },
    });
    if (!tenant) throw new NotFoundException('Gym not found');
    return tenant;
  }

  private async assertMemberInGym(gymId: string, memberUserId: string) {
    const role = await this.prisma.userTenantRole.findFirst({
      where: { gymId, userId: memberUserId, role: Role.MEMBER },
    });
    if (!role) throw new NotFoundException('Member not found in this gym');
  }

  async listForGym(
    user: AuthUserPayload,
    gymSlug: string,
  ): Promise<GymMemberDto[]> {
    const admin = gymRole(user, Role.GYM_ADMIN, gymSlug);
    if (!admin) throw new ForbiddenException('Gym admin only');

    const tenant = await this.tenantForSlug(gymSlug);

    const roles = await this.prisma.userTenantRole.findMany({
      where: { gymId: tenant.id, role: Role.MEMBER },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });

    const assignments = await this.prisma.memberTrainerAssignment.findMany({
      where: { gymId: tenant.id, active: true },
      include: { trainer: true },
    });

    const byMemberId = new Map(
      assignments.map((a) => [a.memberUserId, a]),
    );

    return roles.map((r) => {
      const assignment = byMemberId.get(r.userId);
      return {
        userId: r.user.id,
        name: r.user.name,
        email: r.user.email,
        phone: r.user.phone,
        hasProfilePhoto: Boolean(r.user.profilePhotoData),
        status: assignment
          ? normalizeStatus(assignment.membershipStatus)
          : 'unassigned',
        plan: assignment?.planLabel ?? '—',
        trainerName: assignment?.trainer.name ?? null,
        assignmentId: assignment?.id ?? null,
      };
    });
  }

  async createForGym(
    user: AuthUserPayload,
    gymSlug: string,
    dto: CreateGymMemberDto,
  ) {
    const admin = gymRole(user, Role.GYM_ADMIN, gymSlug);
    if (!admin) throw new ForbiddenException('Gym admin only');
    const tenant = await this.tenantForSlug(gymSlug);
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const created = await this.prisma.$transaction(async (tx) => {
      const member = await tx.user.create({
        data: {
          email,
          name: dto.name.trim(),
          phone: dto.phone?.trim() || null,
          passwordHash,
        },
      });
      await tx.userTenantRole.create({
        data: { userId: member.id, gymId: tenant.id, role: Role.MEMBER },
      });
      return member;
    });
    return { userId: created.id, name: created.name, email: created.email };
  }

  async createMemberRegistrationInvite(
    user: AuthUserPayload,
    gymSlug: string,
    email?: string,
  ) {
    const admin = gymRole(user, Role.GYM_ADMIN, gymSlug);
    if (!admin) throw new ForbiddenException('Gym admin only');
    const tenant = await this.tenantForSlug(gymSlug);
    return this.registrationInvites.issueInvite({
      kind: REGISTRATION_INVITE_KIND.GYM_MEMBER,
      gymId: tenant.id,
      email: email?.trim().toLowerCase(),
    });
  }

  async getMyProfile(user: AuthUserPayload, gymSlug: string) {
    const member = gymRole(user, Role.MEMBER, gymSlug);
    if (!member) throw new ForbiddenException('Members only');
    const tenant = await this.tenantForSlug(gymSlug);
    await this.assertMemberInGym(tenant.id, user.id);
    return this.buildMemberProfile(tenant.id, user.id);
  }

  async getMemberProfile(
    user: AuthUserPayload,
    gymSlug: string,
    memberUserId: string,
  ) {
    const admin = gymRole(user, Role.GYM_ADMIN, gymSlug);
    if (!admin) throw new ForbiddenException('Gym admin only');
    const tenant = await this.tenantForSlug(gymSlug);
    await this.assertMemberInGym(tenant.id, memberUserId);
    return this.buildMemberProfile(tenant.id, memberUserId);
  }

  async getMyPhoto(user: AuthUserPayload, gymSlug: string) {
    const member = gymRole(user, Role.MEMBER, gymSlug);
    if (!member) throw new ForbiddenException('Members only');
    return this.memberPhotoPayload(user.id);
  }

  async getMemberPhoto(
    user: AuthUserPayload,
    gymSlug: string,
    memberUserId: string,
  ) {
    const admin = gymRole(user, Role.GYM_ADMIN, gymSlug);
    if (!admin) throw new ForbiddenException('Gym admin only');
    const tenant = await this.tenantForSlug(gymSlug);
    await this.assertMemberInGym(tenant.id, memberUserId);
    return this.memberPhotoPayload(memberUserId);
  }

  async getGymPeerPhoto(user: AuthUserPayload, peerUserId: string) {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Members only');
    await this.assertMemberInGym(memberRole.gymId, peerUserId);
    return this.memberPhotoPayload(peerUserId);
  }

  async updateMyProfile(user: AuthUserPayload, dto: UpdateMemberProfileDto) {
    const data: {
      name?: string;
      phone?: string | null;
      memberNotes?: string | null;
      profilePhotoMimeType?: string | null;
      profilePhotoData?: string | null;
    } = {};

    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.phone !== undefined) {
      const phone = dto.phone.trim();
      data.phone = phone.length ? phone : null;
    }
    if (dto.notes !== undefined) {
      data.memberNotes = dto.notes.trim().length ? dto.notes.trim() : null;
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

  private async memberPhotoPayload(userId: string) {
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

  private async buildMemberProfile(gymId: string, memberUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: memberUserId },
    });
    if (!user) throw new NotFoundException('User not found');

    const [tenant, adminRole, assignment] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: gymId } }),
      this.prisma.userTenantRole.findFirst({
        where: { gymId, role: Role.GYM_ADMIN },
        include: { user: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.memberTrainerAssignment.findFirst({
        where: { gymId, memberUserId, active: true },
        include: { trainer: true },
      }),
    ]);

    const [paidAgg, supplementAgg, lastCheckIn, payments, supplements, checkIns] =
      await Promise.all([
        this.prisma.gymPayment.aggregate({
          where: { gymId, memberUserId, status: 'paid' },
          _sum: { amountInr: true },
        }),
        this.prisma.gymSupplementSale.aggregate({
          where: { gymId, memberUserId },
          _sum: { amountInr: true },
        }),
        this.prisma.memberCheckIn.findFirst({
          where: { gymId, memberUserId },
          orderBy: { checkInAt: 'desc' },
        }),
        this.prisma.gymPayment.findMany({
          where: { gymId, memberUserId },
          orderBy: { createdAt: 'desc' },
          take: 8,
        }),
        this.prisma.gymSupplementSale.findMany({
          where: { gymId, memberUserId },
          orderBy: { createdAt: 'desc' },
          take: 8,
        }),
        this.prisma.memberCheckIn.findMany({
          where: { gymId, memberUserId },
          orderBy: { checkInAt: 'desc' },
          take: 8,
        }),
      ]);

    const totalSpentInr =
      (paidAgg._sum.amountInr ?? 0) + (supplementAgg._sum.amountInr ?? 0);

    type Activity = {
      id: string;
      kind: 'payment' | 'supplement' | 'check_in';
      title: string;
      subtitle: string;
      amountInr: number | null;
      at: string;
    };

    const activity: Activity[] = [
      ...payments.map((p) => ({
        id: p.id,
        kind: 'payment' as const,
        title: p.title,
        subtitle: `${p.status} · ${p.method}`,
        amountInr: p.status === 'paid' ? p.amountInr : null,
        at: p.createdAt.toISOString(),
      })),
      ...supplements.map((s) => ({
        id: s.id,
        kind: 'supplement' as const,
        title: s.billNumber,
        subtitle: 'Supplement purchase',
        amountInr: s.amountInr,
        at: s.createdAt.toISOString(),
      })),
      ...checkIns.map((c) => ({
        id: c.id,
        kind: 'check_in' as const,
        title: 'Gym check-in',
        subtitle: c.branchName,
        amountInr: null,
        at: c.checkInAt.toISOString(),
      })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 12);

    let lastVisitLabel: string | null = null;
    if (lastCheckIn) {
      const d = lastCheckIn.checkInAt;
      const days = Math.floor(
        (Date.now() - d.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (days <= 0) lastVisitLabel = 'Today';
      else if (days === 1) lastVisitLabel = '1 day ago';
      else if (days < 14) lastVisitLabel = `${days} days ago`;
      else {
        lastVisitLabel = d.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
        });
      }
    }

    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      notes: user.memberNotes,
      hasProfilePhoto: Boolean(user.profilePhotoData),
      plan: assignment?.planLabel ?? '—',
      status: assignment
        ? normalizeStatus(assignment.membershipStatus)
        : 'unassigned',
      trainerName: assignment?.trainer.name ?? null,
      branchLabel: lastCheckIn?.branchName ?? 'Main branch',
      totalSpentInr,
      lastVisitLabel,
      recentActivity: activity,
      gymContact: {
        gymName: tenant?.name ?? 'Gym',
        ownerName: adminRole?.user.name ?? 'Gym owner',
        ownerEmail: adminRole?.user.email ?? null,
        ownerPhone: adminRole?.user.phone ?? null,
      },
    };
  }

  async listMyBodyWeight(
    user: AuthUserPayload,
    from?: string,
    to?: string,
  ) {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Members only');

    const toDate = to?.trim() || new Date().toISOString().slice(0, 10);
    const start = new Date();
    start.setDate(start.getDate() - 365);
    const fromDate = from?.trim() || start.toISOString().slice(0, 10);

    const rows = await this.prisma.memberBodyWeightLog.findMany({
      where: {
        memberUserId: user.id,
        gymId: memberRole.gymId,
        logDate: { gte: fromDate, lte: toDate },
      },
      orderBy: { logDate: 'asc' },
    });

    return rows.map((r) => ({
      id: r.id,
      logDate: r.logDate,
      weightKg: r.weightKg,
      targetKg: r.targetKg,
    }));
  }

  async upsertMyBodyWeight(
    user: AuthUserPayload,
    input: { logDate: string; weightKg: number; targetKg?: number },
  ) {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Members only');
    const logDate = input.logDate?.trim();
    if (!logDate || !/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
      throw new BadRequestException('Invalid logDate');
    }
    const weightKg = Number(input.weightKg);
    if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 300) {
      throw new BadRequestException('weightKg must be between 30 and 300');
    }
    const targetKg =
      input.targetKg === undefined || input.targetKg === null
        ? undefined
        : Number(input.targetKg);

    const row = await this.prisma.memberBodyWeightLog.upsert({
      where: {
        memberUserId_gymId_logDate: {
          memberUserId: user.id,
          gymId: memberRole.gymId,
          logDate,
        },
      },
      create: {
        gymId: memberRole.gymId,
        memberUserId: user.id,
        logDate,
        weightKg,
        targetKg: targetKg ?? null,
      },
      update: {
        weightKg,
        ...(targetKg !== undefined ? { targetKg } : {}),
      },
    });

    return {
      id: row.id,
      logDate: row.logDate,
      weightKg: row.weightKg,
      targetKg: row.targetKg,
    };
  }
}
