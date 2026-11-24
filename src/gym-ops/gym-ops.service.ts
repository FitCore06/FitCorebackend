import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, type AuthUserPayload } from '../auth/auth.types.js';
import { gymRole } from '../auth/guards/roles.guard.js';
import { validateBase64Image } from '../common/image-upload.js';
import { membershipDayStats } from '../common/membership-day-stats.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { textReportToPdf } from './report-pdf.js';
import {
  CRM_STAGES,
  type CreateCrmLeadDto,
} from './dto/create-crm-lead.dto.js';
import type { UpdateCrmLeadDto } from './dto/update-crm-lead.dto.js';
import type { CreateEquipmentDto } from './dto/create-equipment.dto.js';
import type { UpdateEquipmentDto } from './dto/update-equipment.dto.js';
import {
  OTHER_EXPENSE_CATEGORIES,
  type CreateOtherExpenseDto,
} from './dto/create-other-expense.dto.js';
import type { CreateSupplementSaleDto } from './dto/create-supplement-sale.dto.js';
import type { UpdatePaymentCollectionDto } from './dto/update-payment-collection.dto.js';
import { paymentCollectionFromTenant } from './payment-collection.util.js';
import { AutomationService } from '../automation/automation.service.js';
import { resolveMembershipExpiryRunParams } from '../automation/automation-run-params.js';
import { expiryDedupeKey } from '../automation/membership-expiry-dedupe.js';
import {
  formatSupplementBillMessage,
  sendSupplementBillPhoneStub,
} from './supplement-bill.messaging.js';
import type { AssignMembershipDto, RenewMembershipDto } from './dto/assign-membership.dto.js';

@Injectable()
export class GymOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly automationService: AutomationService,
  ) {}

  private async tenantForAdmin(user: AuthUserPayload, gymSlug: string) {
    const admin = gymRole(user, Role.GYM_ADMIN, gymSlug);
    if (!admin) throw new ForbiddenException('Gym admin only');
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: gymSlug.toLowerCase() },
    });
    if (!tenant) throw new NotFoundException('Gym not found');
    return tenant;
  }

  /** Every plan the owner created under Memberships → Gym access (member does not need an assignment). */
  async membershipPlanCatalogForMember(user: AuthUserPayload, gymSlug: string) {
    const slug = gymSlug?.trim().toLowerCase();
    if (!slug) throw new BadRequestException('gymSlug is required');
    const member = gymRole(user, Role.MEMBER, slug);
    if (!member) throw new ForbiddenException('Members only');
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new NotFoundException('Gym not found');
    const role = await this.prisma.userTenantRole.findFirst({
      where: {
        gymId: tenant.id,
        userId: user.id,
        role: Role.MEMBER,
      },
    });
    if (!role) throw new ForbiddenException('Not a member of this gym');

    const plans = await this.prisma.gymMembershipPlan.findMany({
      where: { gymId: tenant.id },
      orderBy: [{ priceInr: 'asc' }, { name: 'asc' }],
    });

    return plans.map((p) => ({
      id: p.id,
      name: p.name,
      durationLabel: p.durationLabel,
      durationDays: p.durationDays,
      priceInr: p.priceInr,
    }));
  }

  async membershipPlans(user: AuthUserPayload, gymSlug: string) {
    const slug = gymSlug?.trim().toLowerCase();
    if (!slug) throw new BadRequestException('gymSlug is required');
    const admin = gymRole(user, Role.GYM_ADMIN, slug);
    const member = gymRole(user, Role.MEMBER, slug);
    if (!admin && !member) throw new ForbiddenException('Not allowed for this gym');
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new NotFoundException('Gym not found');
    if (member && !admin) {
      const role = await this.prisma.userTenantRole.findFirst({
        where: { gymId: tenant.id, userId: user.id, role: Role.MEMBER },
      });
      if (!role) throw new ForbiddenException('Not a member of this gym');
    }

    const plans = await this.prisma.gymMembershipPlan.findMany({
      where: { gymId: tenant.id },
      orderBy: { priceInr: 'asc' },
    });

    if (member && !admin) {
      return plans.map((p) => ({
        id: p.id,
        name: p.name,
        durationLabel: p.durationLabel,
        durationDays: p.durationDays,
        priceInr: p.priceInr,
      }));
    }

    const counts = await this.prisma.memberMembership.groupBy({
      by: ['planId'],
      where: {
        gymId: tenant.id,
        status: { in: ['active', 'trial', 'frozen'] },
      },
      _count: true,
    });
    const countByPlan = new Map(counts.map((c) => [c.planId, c._count]));
    return plans.map((p) => ({
      id: p.id,
      name: p.name,
      duration: p.durationLabel,
      priceInr: p.priceInr,
      durationDays: p.durationDays,
      activeCount: countByPlan.get(p.id) ?? 0,
    }));
  }

  async updateMembershipPlan(
    user: AuthUserPayload,
    gymSlug: string,
    planId: string,
    input: { name: string; durationLabel: string; priceInr: number; durationDays?: number },
  ) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const existing = await this.prisma.gymMembershipPlan.findFirst({
      where: { id: planId, gymId: tenant.id },
    });
    if (!existing) throw new NotFoundException('Plan not found');
    const durationDays =
      input.durationDays ?? this.durationDaysFromLabel(input.durationLabel) ?? existing.durationDays;
    if (!durationDays) {
      throw new BadRequestException('Set duration days or a label like "3 months"');
    }
    return this.prisma.gymMembershipPlan.update({
      where: { id: planId },
      data: {
        name: input.name.trim(),
        durationLabel: input.durationLabel.trim(),
        priceInr: input.priceInr,
        durationDays,
      },
    });
  }

  async deleteMembershipPlan(user: AuthUserPayload, gymSlug: string, planId: string) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const existing = await this.prisma.gymMembershipPlan.findFirst({
      where: { id: planId, gymId: tenant.id },
    });
    if (!existing) throw new NotFoundException('Plan not found');
    const linked = await this.prisma.memberMembership.count({
      where: { gymId: tenant.id, planId },
    });
    if (linked > 0) {
      throw new BadRequestException(
        'Members are linked to this plan. Edit instead, or delete only when no member has used this plan.',
      );
    }
    await this.prisma.gymMembershipPlan.delete({ where: { id: planId } });
    return { deleted: true };
  }

  async activeMemberships(user: AuthUserPayload, gymSlug: string) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const structured = await this.prisma.memberMembership.findMany({
      where: { gymId: tenant.id, status: { in: ['active', 'trial', 'frozen'] } },
      include: { member: true, plan: true },
      orderBy: { createdAt: 'desc' },
    });
    const structuredMemberIds = structured.map((row) => row.memberUserId);
    const legacyRows = await this.prisma.memberTrainerAssignment.findMany({
      where: { gymId: tenant.id, active: true },
      include: { member: true },
      orderBy: { assignedAt: 'desc' },
    });
    const now = new Date();
    const normalized = structured.map((row) => {
      const endsOn = row.endsAt.toISOString().slice(0, 10);
      const startsOn = row.startsAt.toISOString().slice(0, 10);
      return {
        id: row.id,
        memberUserId: row.memberUserId,
        memberName: row.member.name,
        plan: row.plan.name,
        planId: row.planId,
        status: row.endsAt < now && row.status !== 'frozen' ? 'expired' : row.status,
        endsOn,
        startsOn,
        planPriceInr: row.plan.priceInr,
        ...membershipDayStats(row.startsAt, row.endsAt),
        structured: true,
      };
    });
    const legacy = legacyRows.filter((row) => !structuredMemberIds.includes(row.memberUserId)).map((r) => ({
      id: r.id,
      memberUserId: r.memberUserId,
      memberName: r.member.name,
      plan: r.planLabel,
      status: mapMembershipStatus(r.membershipStatus),
      endsOn: r.membershipNote ?? '—',
      structured: false,
    }));
    return [...normalized, ...legacy];
  }

  async assignMembership(
    user: AuthUserPayload,
    gymSlug: string,
    dto: AssignMembershipDto,
  ) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const [memberRole, plan] = await Promise.all([
      this.prisma.userTenantRole.findFirst({
        where: { gymId: tenant.id, userId: dto.memberUserId, role: Role.MEMBER },
      }),
      this.prisma.gymMembershipPlan.findFirst({
        where: { id: dto.planId, gymId: tenant.id },
      }),
    ]);
    if (!memberRole || !plan) throw new ForbiddenException('Member or plan not accessible');
    if (!plan.durationDays) throw new BadRequestException('Plan requires duration in days');
    const startsAt = this.membershipDate(dto.startDate);
    const endsAt = this.addMembershipDays(startsAt, plan.durationDays);
    return this.prisma.$transaction(async (tx) => {
      await tx.memberMembership.updateMany({
        where: { gymId: tenant.id, memberUserId: dto.memberUserId, status: { in: ['active', 'trial', 'frozen'] } },
        data: { status: 'replaced' },
      });
      const membership = await tx.memberMembership.create({
        data: {
          gymId: tenant.id, memberUserId: dto.memberUserId, planId: plan.id,
          status: dto.status, startsAt, endsAt,
        },
        include: { member: true, plan: true },
      });
      await tx.memberTrainerAssignment.updateMany({
        where: { gymId: tenant.id, memberUserId: dto.memberUserId },
        data: {
          membershipStatus: dto.status,
          planLabel: plan.name,
          membershipNote: endsAt.toISOString().slice(0, 10),
        },
      });
      return membership;
    });
  }

  async renewMembership(
    user: AuthUserPayload,
    gymSlug: string,
    membershipId: string,
    dto: RenewMembershipDto,
  ) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const current = await this.prisma.memberMembership.findFirst({
      where: { id: membershipId, gymId: tenant.id },
    });
    if (!current) throw new ForbiddenException('Membership not accessible');
    const plan = await this.prisma.gymMembershipPlan.findFirst({
      where: { id: dto.planId ?? current.planId, gymId: tenant.id },
    });
    if (!plan?.durationDays) throw new BadRequestException('Plan requires duration in days');
    const startsAt = this.membershipDate(dto.startDate);
    const endsAt = this.addMembershipDays(startsAt, plan.durationDays);
    return this.prisma.$transaction(async (tx) => {
      await tx.memberMembership.updateMany({
        where: { gymId: tenant.id, memberUserId: current.memberUserId, status: { in: ['active', 'trial', 'frozen'] } },
        data: { status: 'renewed' },
      });
      const membership = await tx.memberMembership.create({
        data: {
          gymId: tenant.id, memberUserId: current.memberUserId, planId: plan.id,
          status: 'active', startsAt, endsAt, renewedFromId: current.id,
        },
        include: { member: true, plan: true },
      });
      await tx.memberTrainerAssignment.updateMany({
        where: { gymId: tenant.id, memberUserId: current.memberUserId },
        data: {
          membershipStatus: 'active', planLabel: plan.name,
          membershipNote: endsAt.toISOString().slice(0, 10),
        },
      });
      return membership;
    });
  }

  async runMembershipExpiryAutomation(
    user: AuthUserPayload,
    gymSlug: string,
    days?: string,
  ) {
    await this.tenantForAdmin(user, gymSlug);
    const { slug, daysBefore } = resolveMembershipExpiryRunParams(
      this.config,
      gymSlug,
      days,
    );
    return this.automationService.runMembershipExpiryReminders(slug, daysBefore);
  }

  async runMembershipReminders(user: AuthUserPayload, gymSlug: string) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const horizon = new Date(today);
    horizon.setUTCDate(horizon.getUTCDate() + 7);
    const expiring = await this.prisma.memberMembership.findMany({
      where: {
        gymId: tenant.id,
        status: { in: ['active', 'trial'] },
        endsAt: { gte: today, lte: horizon },
      },
      include: { plan: true },
    });
    if (!expiring.length) return { candidates: 0, created: 0 };
    const result = await this.prisma.gymNotification.createMany({
      data: expiring.map((membership) => ({
        gymId: tenant.id,
        userId: membership.memberUserId,
        title: 'Membership renewal reminder',
        body: `${membership.plan.name} expires on ${membership.endsAt.toISOString().slice(0, 10)}. Contact your gym to renew.`,
        dedupeKey: expiryDedupeKey(membership.id, membership.endsAt, today),
      })),
      skipDuplicates: true,
    });
    return { candidates: expiring.length, created: result.count };
  }

  private membershipDate(value?: string) {
    const date = value ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`) : new Date();
    date.setUTCHours(0, 0, 0, 0);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid membership date');
    return date;
  }

  private addMembershipDays(start: Date, durationDays: number) {
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + durationDays - 1);
    return end;
  }

  async trials(user: AuthUserPayload, gymSlug: string) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    return this.prisma.trialLead.findMany({
      where: { gymId: tenant.id },
      orderBy: { name: 'asc' },
    });
  }

  async createTrial(
    user: AuthUserPayload,
    gymSlug: string,
    input: { name: string; phone: string; source: string },
  ) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    return this.prisma.trialLead.create({
      data: {
        gymId: tenant.id,
        name: input.name.trim(),
        phone: input.phone.trim(),
        source: input.source.trim(),
        trialEndsLabel: 'In 7 days',
        followUpLabel: 'Today',
        status: 'active',
        assignedTrainerName: 'Unassigned',
      },
    });
  }

  async createMembershipPlan(
    user: AuthUserPayload,
    gymSlug: string,
    input: { name: string; durationLabel: string; priceInr: number; durationDays?: number },
  ) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    return this.prisma.gymMembershipPlan.create({
      data: {
        gymId: tenant.id,
        name: input.name.trim(),
        durationLabel: input.durationLabel.trim(),
        priceInr: input.priceInr,
        durationDays: input.durationDays ?? this.durationDaysFromLabel(input.durationLabel),
      },
    });
  }

  async trainerMembershipPlans(user: AuthUserPayload, gymSlug: string) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const plans = await this.prisma.trainerMembershipPlan.findMany({
      where: { gymId: tenant.id },
      orderBy: { priceInr: 'asc' },
    });
    const counts = await this.prisma.memberTrainerAssignment.groupBy({
      by: ['trainerPlanId'],
      where: { gymId: tenant.id, active: true, trainerPlanId: { not: null } },
      _count: true,
    });
    const countByPlan = new Map(
      counts.map((c) => [c.trainerPlanId!, c._count]),
    );
    return plans.map((p) => ({
      id: p.id,
      name: p.name,
      duration: p.durationLabel,
      priceInr: p.priceInr,
      durationDays: p.durationDays,
      activeCount: countByPlan.get(p.id) ?? 0,
    }));
  }

  async createTrainerMembershipPlan(
    user: AuthUserPayload,
    gymSlug: string,
    input: { name: string; durationLabel: string; priceInr: number; durationDays?: number },
  ) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const durationDays =
      input.durationDays ?? this.durationDaysFromLabel(input.durationLabel);
    if (!durationDays) {
      throw new BadRequestException('Set duration days or a label like "3 months"');
    }
    return this.prisma.trainerMembershipPlan.create({
      data: {
        gymId: tenant.id,
        name: input.name.trim(),
        durationLabel: input.durationLabel.trim(),
        priceInr: input.priceInr,
        durationDays,
      },
    });
  }

  async updateTrainerMembershipPlan(
    user: AuthUserPayload,
    gymSlug: string,
    planId: string,
    input: { name: string; durationLabel: string; priceInr: number; durationDays?: number },
  ) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const existing = await this.prisma.trainerMembershipPlan.findFirst({
      where: { id: planId, gymId: tenant.id },
    });
    if (!existing) throw new NotFoundException('Trainer plan not found');
    const durationDays =
      input.durationDays ?? this.durationDaysFromLabel(input.durationLabel) ?? existing.durationDays;
    if (!durationDays) {
      throw new BadRequestException('Set duration days or a label like "3 months"');
    }
    return this.prisma.trainerMembershipPlan.update({
      where: { id: planId },
      data: {
        name: input.name.trim(),
        durationLabel: input.durationLabel.trim(),
        priceInr: input.priceInr,
        durationDays,
      },
    });
  }

  async deleteTrainerMembershipPlan(user: AuthUserPayload, gymSlug: string, planId: string) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const existing = await this.prisma.trainerMembershipPlan.findFirst({
      where: { id: planId, gymId: tenant.id },
    });
    if (!existing) throw new NotFoundException('Trainer plan not found');
    const linked = await this.prisma.memberTrainerAssignment.count({
      where: { gymId: tenant.id, trainerPlanId: planId },
    });
    if (linked > 0) {
      throw new BadRequestException(
        'Members are linked to this trainer plan. Remove or change assignments before deleting.',
      );
    }
    await this.prisma.trainerMembershipPlan.delete({ where: { id: planId } });
    return { deleted: true };
  }

  private durationDaysFromLabel(label: string) {
    const value = label.trim().toLowerCase();
    const match = value.match(/^(\d+)\s*(day|days|week|weeks|month|months|year|years)$/);
    if (!match) return null;
    const count = Number(match[1]);
    const unit = match[2];
    if (unit.startsWith('day')) return count;
    if (unit.startsWith('week')) return count * 7;
    if (unit.startsWith('month')) return count * 30;
    return count * 365;
  }

  async createBranch(
    user: AuthUserPayload,
    gymSlug: string,
    input: { name: string },
  ) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    return this.prisma.branch.create({
      data: {
        gymId: tenant.id,
        name: input.name.trim(),
        status: 'active',
      },
    });
  }

  async updateBranch(
    user: AuthUserPayload,
    gymSlug: string,
    branchId: string,
    input: { name?: string; status?: string },
  ) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, gymId: tenant.id },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    return this.prisma.branch.update({
      where: { id: branchId },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
    });
  }

  async listBranchGrants(
    user: AuthUserPayload,
    gymSlug: string,
    branchId: string,
  ) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, gymId: tenant.id },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    const grants = await this.prisma.userBranchAccess.findMany({
      where: { branchId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return grants.map((g) => ({
      id: g.id,
      userId: g.userId,
      branchId: g.branchId,
      createdAt: g.createdAt,
      user: g.user,
    }));
  }

  async grantBranchAccess(
    user: AuthUserPayload,
    gymSlug: string,
    branchId: string,
    input: { userId: string },
  ) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, gymId: tenant.id },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    // Ensure target user belongs to this gym tenant
    const role = await this.prisma.userTenantRole.findFirst({
      where: { gymId: tenant.id, userId: input.userId },
    });
    if (!role) throw new BadRequestException('User does not belong to this gym');

    return this.prisma.userBranchAccess.upsert({
      where: {
        userId_branchId: { userId: input.userId, branchId },
      },
      create: {
        userId: input.userId,
        branchId,
      },
      update: {},
    });
  }

  async revokeBranchAccess(
    user: AuthUserPayload,
    gymSlug: string,
    branchId: string,
    userId: string,
  ) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, gymId: tenant.id },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    await this.prisma.userBranchAccess.deleteMany({
      where: { branchId, userId },
    });

    return { revoked: true, branchId, userId };
  }

  private mapCrmLead(row: {
    id: string;
    name: string;
    phone: string | null;
    source: string;
    stage: string;
    nextAction: string;
    referredBy: string | null;
    assignedUserId: string | null;
    assignedUser: { id: string; name: string; email: string } | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      source: row.source,
      stage: row.stage,
      nextAction: row.nextAction,
      referredBy: row.referredBy,
      assignedUserId: row.assignedUserId,
      assignedName: row.assignedUser?.name ?? null,
      assignedEmail: row.assignedUser?.email ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private assertCrmStage(stage: string) {
    if (!CRM_STAGES.includes(stage as (typeof CRM_STAGES)[number])) {
      throw new BadRequestException(
        `stage must be one of: ${CRM_STAGES.join(', ')}`,
      );
    }
  }

  private async assertTrainerInGym(gymId: string, userId: string) {
    const role = await this.prisma.userTenantRole.findFirst({
      where: { gymId, userId, role: Role.TRAINER },
    });
    if (!role) throw new BadRequestException('assignedUserId must be a trainer in this gym');
  }

  async crm(user: AuthUserPayload, gymSlug: string) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const rows = await this.prisma.crmLead.findMany({
      where: { gymId: tenant.id },
      include: {
        assignedUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ stage: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => this.mapCrmLead(r));
  }

  async createCrmLead(
    user: AuthUserPayload,
    gymSlug: string,
    dto: CreateCrmLeadDto,
  ) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    this.assertCrmStage(dto.stage);
    if (dto.assignedUserId) {
      await this.assertTrainerInGym(tenant.id, dto.assignedUserId);
    }
    const row = await this.prisma.crmLead.create({
      data: {
        gymId: tenant.id,
        name: dto.name.trim(),
        phone: dto.phone?.trim() || null,
        source: dto.source.trim(),
        stage: dto.stage,
        nextAction: dto.nextAction?.trim() || 'Follow up',
        referredBy: dto.referredBy?.trim() || null,
        assignedUserId: dto.assignedUserId || null,
      },
      include: {
        assignedUser: { select: { id: true, name: true, email: true } },
      },
    });
    return this.mapCrmLead(row);
  }

  async updateCrmLead(
    user: AuthUserPayload,
    gymSlug: string,
    id: string,
    dto: UpdateCrmLeadDto,
  ) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const existing = await this.prisma.crmLead.findFirst({
      where: { id, gymId: tenant.id },
    });
    if (!existing) throw new NotFoundException('CRM lead not found');

    if (dto.stage !== undefined) this.assertCrmStage(dto.stage);
    if (dto.assignedUserId) {
      await this.assertTrainerInGym(tenant.id, dto.assignedUserId);
    }

    const row = await this.prisma.crmLead.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.source !== undefined ? { source: dto.source.trim() } : {}),
        ...(dto.stage !== undefined ? { stage: dto.stage } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
        ...(dto.referredBy !== undefined
          ? { referredBy: dto.referredBy?.trim() || null }
          : {}),
        ...(dto.nextAction !== undefined
          ? { nextAction: dto.nextAction.trim() }
          : {}),
        ...(dto.assignedUserId !== undefined
          ? { assignedUserId: dto.assignedUserId || null }
          : {}),
      },
      include: {
        assignedUser: { select: { id: true, name: true, email: true } },
      },
    });
    return this.mapCrmLead(row);
  }

  async equipment(user: AuthUserPayload, gymSlug: string) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    return this.prisma.gymEquipment.findMany({
      where: { gymId: tenant.id },
      orderBy: { name: 'asc' },
    });
  }

  async createEquipment(
    user: AuthUserPayload,
    gymSlug: string,
    dto: CreateEquipmentDto,
  ) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    return this.prisma.gymEquipment.create({
      data: {
        gymId: tenant.id,
        name: dto.name.trim(),
        branch: dto.branch.trim(),
        status: dto.status,
        nextServiceLabel: dto.nextServiceLabel.trim(),
      },
    });
  }

  async updateEquipment(
    user: AuthUserPayload,
    gymSlug: string,
    id: string,
    dto: UpdateEquipmentDto,
  ) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const existing = await this.prisma.gymEquipment.findFirst({
      where: { id, gymId: tenant.id },
    });
    if (!existing) throw new NotFoundException('Equipment not found');
    return this.prisma.gymEquipment.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.branch !== undefined ? { branch: dto.branch.trim() } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.nextServiceLabel !== undefined
          ? { nextServiceLabel: dto.nextServiceLabel.trim() }
          : {}),
      },
    });
  }

  async deleteEquipment(user: AuthUserPayload, gymSlug: string, id: string) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const existing = await this.prisma.gymEquipment.findFirst({
      where: { id, gymId: tenant.id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Equipment not found');
    await this.prisma.gymEquipment.delete({ where: { id } });
    return { deleted: true };
  }

  async equipmentForMember(user: AuthUserPayload) {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) return [];
    return this.prisma.gymEquipment.findMany({
      where: { gymId: memberRole.gymId, status: { not: 'out' } },
      orderBy: { name: 'asc' },
    });
  }

  async payroll(user: AuthUserPayload, gymSlug: string) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    return this.prisma.trainerPayrollRun.findMany({
      where: { gymId: tenant.id },
      orderBy: { period: 'desc' },
    });
  }

  async listAutomationRules(user: AuthUserPayload, gymSlug: string) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    return this.prisma.gymAutomationRule.findMany({
      where: { gymId: tenant.id },
      orderBy: { name: 'asc' },
    });
  }

  async toggleAutomation(user: AuthUserPayload, gymSlug: string, id: string) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const row = await this.prisma.gymAutomationRule.findFirst({
      where: { id, gymId: tenant.id },
    });
    if (!row) throw new NotFoundException('Rule not found');
    return this.prisma.gymAutomationRule.update({
      where: { id },
      data: { enabled: !row.enabled },
    });
  }

  async reports(user: AuthUserPayload, gymSlug: string) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    return this.prisma.gymReportExport.findMany({
      where: { gymId: tenant.id },
      orderBy: { name: 'asc' },
    });
  }

  async finance(user: AuthUserPayload, gymSlug: string) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodLabel = monthStart.toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
    });

    const paid = await this.prisma.gymPayment.aggregate({
      where: {
        gymId: tenant.id,
        status: { in: ['paid', 'refunded'] },
        createdAt: { gte: monthStart },
      },
      _sum: { amountInr: true },
    });
    const pending = await this.prisma.gymPayment.aggregate({
      where: { gymId: tenant.id, status: 'pending' },
      _sum: { amountInr: true },
    });
    const refunded = await this.prisma.paymentRefund.aggregate({
      where: {
        gymId: tenant.id,
        createdAt: { gte: monthStart },
      },
      _sum: { amountInr: true },
    });
    const expenseAgg = await this.prisma.gymOtherExpense.aggregate({
      where: { gymId: tenant.id, paidAt: { gte: monthStart } },
      _sum: { amountInr: true },
    });
    const supplementAgg = await this.prisma.gymSupplementSale.aggregate({
      where: { gymId: tenant.id, createdAt: { gte: monthStart } },
      _sum: { amountInr: true },
      _count: { _all: true },
    });

    const expenseByCategory = await this.prisma.gymOtherExpense.groupBy({
      by: ['category'],
      where: { gymId: tenant.id, paidAt: { gte: monthStart } },
      _sum: { amountInr: true },
    });

    const supplementByMethod = await this.prisma.gymSupplementSale.groupBy({
      by: ['paymentMethod'],
      where: { gymId: tenant.id, createdAt: { gte: monthStart } },
      _sum: { amountInr: true },
    });

    const payrollRuns = await this.prisma.trainerPayrollRun.findMany({
      where: { gymId: tenant.id },
      orderBy: { period: 'desc' },
      take: 30,
    });
    const latestPeriod = payrollRuns[0]?.period ?? null;
    const payrollPeriodTotal = latestPeriod
      ? payrollRuns
          .filter((r) => r.period === latestPeriod)
          .reduce((sum, r) => sum + r.baseInr + r.commissionInr, 0)
      : 0;

    const mtdRevenue = paid._sum.amountInr ?? 0;
    const refundMtd = refunded._sum.amountInr ?? 0;
    const expensesMtd = expenseAgg._sum.amountInr ?? 0;
    const supplementMtd = supplementAgg._sum.amountInr ?? 0;
    const totalInflowMtd = mtdRevenue + supplementMtd;
    const operatingOutMtd = expensesMtd + payrollPeriodTotal;
    const netOperatingMtd = totalInflowMtd - refundMtd - operatingOutMtd;

    const [
      recentPayments,
      recentExpenses,
      recentSupplements,
      mtdPaidPayments,
      mtdRefundedPayments,
      mtdExpenseRows,
      mtdSupplementRows,
      payrollPeriodRows,
    ] = await Promise.all([
      this.prisma.gymPayment.findMany({
        where: { gymId: tenant.id },
        include: { member: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      this.prisma.gymOtherExpense.findMany({
        where: { gymId: tenant.id },
        orderBy: { paidAt: 'desc' },
        take: 6,
      }),
      this.prisma.gymSupplementSale.findMany({
        where: { gymId: tenant.id },
        include: { member: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      this.prisma.gymPayment.findMany({
        where: {
          gymId: tenant.id,
          status: { in: ['paid', 'refunded'] },
          createdAt: { gte: monthStart },
        },
        include: { member: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.paymentRefund.findMany({
        where: {
          gymId: tenant.id,
          createdAt: { gte: monthStart },
        },
        include: { payment: { include: { member: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.gymOtherExpense.findMany({
        where: { gymId: tenant.id, paidAt: { gte: monthStart } },
        orderBy: { paidAt: 'desc' },
      }),
      this.prisma.gymSupplementSale.findMany({
        where: { gymId: tenant.id, createdAt: { gte: monthStart } },
        include: { member: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      latestPeriod
        ? this.prisma.trainerPayrollRun.findMany({
            where: { gymId: tenant.id, period: latestPeriod },
            orderBy: { trainerName: 'asc' },
          })
        : Promise.resolve([]),
    ]);

    return {
      periodLabel,
      kpis: [
        {
          label: 'Total inflow (MTD)',
          valueInr: totalInflowMtd,
          trend: 'Membership payments + supplement sales',
        },
        {
          label: 'Membership revenue (MTD)',
          valueInr: mtdRevenue,
          trend: 'Paid member transactions',
        },
        {
          label: 'Supplement sales (MTD)',
          valueInr: supplementMtd,
          trend: `${supplementAgg._count._all} sale(s) this month`,
        },
        {
          label: 'Other expenses (MTD)',
          valueInr: expensesMtd,
          trend: 'Cleaning, electricity, upkeep',
        },
        {
          label: 'Payroll (latest run)',
          valueInr: payrollPeriodTotal,
          trend: latestPeriod ? `Period ${latestPeriod}` : 'No payroll run yet',
        },
        {
          label: 'Outstanding dues',
          valueInr: pending._sum.amountInr ?? 0,
          trend: 'Pending member payments',
        },
        {
          label: 'Refunds (MTD)',
          valueInr: refundMtd,
          trend: 'Returned to members',
        },
        {
          label: 'Net operating (MTD)',
          valueInr: netOperatingMtd,
          trend: 'Inflow − refunds − expenses − payroll',
        },
      ],
      expenseByCategory: expenseByCategory
        .map((r) => ({
          category: r.category,
          amountInr: r._sum.amountInr ?? 0,
        }))
        .filter((r) => r.amountInr > 0)
        .sort((a, b) => b.amountInr - a.amountInr),
      supplementByPaymentMethod: supplementByMethod
        .map((r) => ({
          method: r.paymentMethod,
          amountInr: r._sum.amountInr ?? 0,
        }))
        .filter((r) => r.amountInr > 0)
        .sort((a, b) => b.amountInr - a.amountInr),
      payrollLatestPeriod: latestPeriod,
      payrollLatestTotalInr: payrollPeriodTotal,
      netBreakdown: {
        periodLabel,
        netOperatingInr: netOperatingMtd,
        lines: [
          {
            kind: 'add',
            label: 'Membership revenue (MTD)',
            amountInr: mtdRevenue,
          },
          {
            kind: 'add',
            label: 'Supplement sales (MTD)',
            amountInr: supplementMtd,
          },
          {
            kind: 'subtotal',
            label: 'Total inflow',
            amountInr: totalInflowMtd,
          },
          {
            kind: 'subtract',
            label: 'Refunds (MTD)',
            amountInr: refundMtd,
          },
          {
            kind: 'subtract',
            label: 'Other expenses (MTD)',
            amountInr: expensesMtd,
          },
          {
            kind: 'subtract',
            label: latestPeriod
              ? `Payroll (${latestPeriod})`
              : 'Payroll (latest run)',
            amountInr: payrollPeriodTotal,
          },
          {
            kind: 'total',
            label: 'Net operating (MTD)',
            amountInr: netOperatingMtd,
          },
        ],
        inflows: {
          membership: mtdPaidPayments.map((p) => ({
            id: p.id,
            label: p.member.name,
            sublabel: p.title,
            amountInr: p.amountInr,
            at: p.createdAt.toISOString(),
          })),
          supplements: mtdSupplementRows.map((s) => ({
            id: s.id,
            label: s.member.name,
            sublabel: s.billNumber,
            amountInr: s.amountInr,
            at: s.createdAt.toISOString(),
          })),
        },
        outflows: {
          refunds: mtdRefundedPayments.map((p) => ({
            id: p.id,
            label: p.payment.member.name,
            sublabel: p.payment.title,
            amountInr: p.amountInr,
            at: p.createdAt.toISOString(),
          })),
          expenses: mtdExpenseRows.map((e) => ({
            id: e.id,
            label: e.title,
            sublabel: e.category,
            amountInr: e.amountInr,
            at: e.paidAt.toISOString(),
          })),
          payroll: {
            period: latestPeriod,
            trainers: payrollPeriodRows.map((r) => ({
              name: r.trainerName,
              baseInr: r.baseInr,
              commissionInr: r.commissionInr,
              totalInr: r.baseInr + r.commissionInr,
            })),
          },
        },
        expenseByCategory: expenseByCategory
          .map((r) => ({
            category: r.category,
            amountInr: r._sum.amountInr ?? 0,
          }))
          .filter((r) => r.amountInr > 0)
          .sort((a, b) => b.amountInr - a.amountInr),
      },
      recent: {
        payments: recentPayments.map((p) => ({
          id: p.id,
          memberName: p.member.name,
          title: p.title,
          amountInr: p.amountInr,
          method: p.method,
          status: p.status,
          at: p.createdAt.toISOString(),
        })),
        expenses: recentExpenses.map((e) => ({
          id: e.id,
          category: e.category,
          title: e.title,
          amountInr: e.amountInr,
          paidAt: e.paidAt.toISOString(),
        })),
        supplements: recentSupplements.map((s) => ({
          id: s.id,
          billNumber: s.billNumber,
          memberName: s.member.name,
          amountInr: s.amountInr,
          paymentMethod: s.paymentMethod,
          at: s.createdAt.toISOString(),
        })),
      },
      analytics: await this.buildFinanceAnalytics(tenant.id, now, {
        membershipMtd: mtdRevenue,
        supplementMtd,
        expenseMtd: expensesMtd,
        payrollMtd: payrollPeriodTotal,
        refundMtd,
      }),
    };
  }

  async otherExpenses(user: AuthUserPayload, gymSlug: string) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const rows = await this.prisma.gymOtherExpense.findMany({
      where: { gymId: tenant.id },
      include: { createdBy: { select: { name: true } } },
      orderBy: { paidAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      category: r.category,
      title: r.title,
      notes: r.notes,
      amountInr: r.amountInr,
      paidAt: r.paidAt.toISOString(),
      hasProof: Boolean(r.proofData),
      createdAt: r.createdAt.toISOString(),
      recordedBy: r.createdBy.name,
    }));
  }

  async createOtherExpense(
    user: AuthUserPayload,
    gymSlug: string,
    dto: CreateOtherExpenseDto,
  ) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    if (!OTHER_EXPENSE_CATEGORIES.includes(dto.category)) {
      throw new BadRequestException('Invalid expense category');
    }

    let proofData: string | undefined;
    let proofMimeType: string | undefined;
    if (dto.proofBase64) {
      const proof = validateBase64Image({
        base64: dto.proofBase64,
        mimeType: dto.proofMimeType,
        maxBytes: 2_500_000,
        label: 'Proof image',
      });
      proofData = proof.base64;
      proofMimeType = proof.mimeType;
    }

    const paidAt = new Date(dto.paidAt);
    if (Number.isNaN(paidAt.getTime())) {
      throw new BadRequestException('Invalid paid date');
    }

    const row = await this.prisma.gymOtherExpense.create({
      data: {
        gymId: tenant.id,
        category: dto.category,
        title: dto.title.trim(),
        notes: dto.notes?.trim() || null,
        amountInr: dto.amountInr,
        paidAt,
        proofMimeType,
        proofData,
        createdByUserId: user.id,
      },
      include: { createdBy: { select: { name: true } } },
    });

    return {
      id: row.id,
      category: row.category,
      title: row.title,
      notes: row.notes,
      amountInr: row.amountInr,
      paidAt: row.paidAt.toISOString(),
      hasProof: Boolean(row.proofData),
      createdAt: row.createdAt.toISOString(),
      recordedBy: row.createdBy.name,
    };
  }

  async otherExpenseProof(
    user: AuthUserPayload,
    gymSlug: string,
    id: string,
  ) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const row = await this.prisma.gymOtherExpense.findFirst({
      where: { id, gymId: tenant.id },
    });
    if (!row?.proofData) throw new NotFoundException('No proof attached');
    const mime = row.proofMimeType ?? 'image/jpeg';
    return {
      mimeType: mime,
      dataUrl: `data:${mime};base64,${row.proofData}`,
    };
  }

  async supplementSales(user: AuthUserPayload, gymSlug: string) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const rows = await this.prisma.gymSupplementSale.findMany({
      where: { gymId: tenant.id },
      include: {
        member: { select: { name: true, email: true, phone: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.mapSupplementSale(r));
  }

  async createSupplementSale(
    user: AuthUserPayload,
    gymSlug: string,
    dto: CreateSupplementSaleDto,
  ) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const membership = await this.prisma.userTenantRole.findFirst({
      where: {
        gymId: tenant.id,
        userId: dto.memberUserId,
        role: Role.MEMBER,
      },
      include: { user: true },
    });
    if (!membership) {
      throw new BadRequestException('Member not found in this gym');
    }

    const items = dto.items.map((i) => ({
      productName: i.productName.trim(),
      quantity: i.quantity,
      unitPriceInr: i.unitPriceInr,
    }));
    const amountInr = items.reduce(
      (sum, i) => sum + i.quantity * i.unitPriceInr,
      0,
    );
    if (amountInr < 1) {
      throw new BadRequestException('Invalid line items');
    }

    let proofData: string | undefined;
    let proofMimeType: string | undefined;
    if (dto.proofBase64) {
      const proof = validateBase64Image({
        base64: dto.proofBase64,
        mimeType: dto.proofMimeType,
        maxBytes: 2_500_000,
        label: 'Proof image',
      });
      proofData = proof.base64;
      proofMimeType = proof.mimeType;
    }

    const billNumber = `SUP-${tenant.slug.slice(0, 4).toUpperCase()}-${Date.now().toString(36).slice(-6).toUpperCase()}`;
    const member = membership.user;
    const sendWa = dto.sendWhatsApp !== false;
    let whatsappStatus = 'skipped';
    let whatsappMessage: string | null = null;
    let whatsappPhone: string | null = member.phone;
    let whatsappSentAt: Date | null = null;
    let whatsappDetail = 'WhatsApp not requested';

    whatsappMessage = formatSupplementBillMessage({
      gymName: tenant.name,
      billNumber,
      memberName: member.name,
      items,
      totalInr: amountInr,
      paymentMethod: dto.paymentMethod,
      notes: dto.notes,
    });

    if (sendWa) {
      const wa = sendSupplementBillPhoneStub(member.phone, whatsappMessage);
      whatsappStatus = wa.status;
      whatsappPhone = wa.phone ?? member.phone;
      whatsappDetail = wa.detail;
      if (wa.status === 'sent') {
        whatsappSentAt = new Date();
      }
    }

    const row = await this.prisma.gymSupplementSale.create({
      data: {
        gymId: tenant.id,
        memberUserId: member.id,
        billNumber,
        lineItems: items,
        amountInr,
        paymentMethod: dto.paymentMethod,
        notes: dto.notes?.trim() || null,
        proofMimeType,
        proofData,
        whatsappPhone,
        whatsappStatus,
        whatsappMessage: `${whatsappMessage}\n\n[${whatsappDetail}]`,
        whatsappSentAt,
        createdByUserId: user.id,
      },
      include: {
        member: { select: { name: true, email: true, phone: true } },
        createdBy: { select: { name: true } },
      },
    });

    if (whatsappStatus === 'sent') {
      await this.prisma.gymNotification.create({
        data: {
          gymId: tenant.id,
          userId: member.id,
          title: `Supplement bill ${billNumber}`,
          body: whatsappMessage.slice(0, 2000),
        },
      });
    }

    return this.mapSupplementSale(row);
  }

  async supplementSaleProof(
    user: AuthUserPayload,
    gymSlug: string,
    id: string,
  ) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const row = await this.prisma.gymSupplementSale.findFirst({
      where: { id, gymId: tenant.id },
    });
    if (!row?.proofData) throw new NotFoundException('No payment proof attached');
    const mime = row.proofMimeType ?? 'image/jpeg';
    return {
      mimeType: mime,
      dataUrl: `data:${mime};base64,${row.proofData}`,
    };
  }

  async resendSupplementBillWhatsApp(
    user: AuthUserPayload,
    gymSlug: string,
    id: string,
  ) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const row = await this.prisma.gymSupplementSale.findFirst({
      where: { id, gymId: tenant.id },
      include: { member: true },
    });
    if (!row) throw new NotFoundException('Sale not found');
    const message =
      row.whatsappMessage?.split('\n\n[')[0] ??
      formatSupplementBillMessage({
        gymName: tenant.name,
        billNumber: row.billNumber,
        memberName: row.member.name,
        items: row.lineItems as {
          productName: string;
          quantity: number;
          unitPriceInr: number;
        }[],
        totalInr: row.amountInr,
        paymentMethod: row.paymentMethod,
        notes: row.notes,
      });
    const wa = sendSupplementBillPhoneStub(row.member.phone, message);
    const updated = await this.prisma.gymSupplementSale.update({
      where: { id: row.id },
      data: {
        whatsappStatus: wa.status,
        whatsappPhone: wa.phone ?? row.member.phone,
        whatsappMessage: `${message}\n\n[${wa.detail}]`,
        whatsappSentAt: wa.status === 'sent' ? new Date() : row.whatsappSentAt,
      },
      include: {
        member: { select: { name: true, email: true, phone: true } },
        createdBy: { select: { name: true } },
      },
    });
    return this.mapSupplementSale(updated);
  }

  private mapSupplementSale(row: {
    id: string;
    memberUserId: string;
    billNumber: string;
    lineItems: unknown;
    amountInr: number;
    paymentMethod: string;
    notes: string | null;
    proofData: string | null;
    whatsappPhone: string | null;
    whatsappStatus: string;
    whatsappMessage: string | null;
    whatsappSentAt: Date | null;
    createdAt: Date;
    member: { name: string; email: string; phone: string | null };
    createdBy: { name: string };
  }) {
    const items = row.lineItems as {
      productName: string;
      quantity: number;
      unitPriceInr: number;
    }[];
    return {
      id: row.id,
      billNumber: row.billNumber,
      memberUserId: row.memberUserId,
      memberName: row.member.name,
      memberEmail: row.member.email,
      memberPhone: row.member.phone,
      items,
      amountInr: row.amountInr,
      paymentMethod: row.paymentMethod,
      notes: row.notes,
      hasProof: Boolean(row.proofData),
      whatsappPhone: row.whatsappPhone,
      whatsappStatus: row.whatsappStatus,
      whatsappPreview: row.whatsappMessage?.split('\n\n[')[0] ?? null,
      whatsappSentAt: row.whatsappSentAt?.toISOString() ?? null,
      billDeliveryPhone: row.whatsappPhone,
      billDeliveryStatus: row.whatsappStatus,
      billPreview: row.whatsappMessage?.split('\n\n[')[0] ?? null,
      billSentAt: row.whatsappSentAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      recordedBy: row.createdBy.name,
    };
  }

  async branches(user: AuthUserPayload, gymSlug: string) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const branches = await this.prisma.branch.findMany({
      where: { gymId: tenant.id },
    });
    const memberCount = await this.prisma.userTenantRole.count({
      where: { gymId: tenant.id, role: Role.MEMBER },
    });
    const trainerCount = await this.prisma.userTenantRole.count({
      where: { gymId: tenant.id, role: Role.TRAINER },
    });
  const paidMtd = await this.prisma.gymPayment.aggregate({
      where: {
        gymId: tenant.id,
        status: 'paid',
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
      _sum: { amountInr: true },
    });
    const revenue = `₹${Math.round((paidMtd._sum.amountInr ?? 0) / 1000)}K MTD`;
    return branches.map((b, i) => ({
      id: b.id,
      name: b.name,
      city: i === 0 ? 'Indore' : 'Bhopal',
      members: memberCount,
      staff: trainerCount + 1,
      revenue,
      status: b.status,
    }));
  }

  async computePayroll(user: AuthUserPayload, gymSlug: string, period: string) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const trainers = await this.prisma.userTenantRole.findMany({
      where: { gymId: tenant.id, role: Role.TRAINER },
      include: { user: true },
    });

    const completed = await this.prisma.sessionBooking.groupBy({
      by: ['trainerUserId'],
      where: { gymId: tenant.id, status: 'completed' },
      _count: true,
    });
    const completedByTrainer = new Map(
      completed.map((c) => [c.trainerUserId, c._count]),
    );

    const runs = [];
    for (const t of trainers) {
      const sessions = completedByTrainer.get(t.userId) ?? 0;
      const baseInr = 18_000;
      const commissionInr = sessions * 450;
      const existing = await this.prisma.trainerPayrollRun.findFirst({
        where: { gymId: tenant.id, trainerName: t.user.name, period },
      });
      const row = existing
        ? await this.prisma.trainerPayrollRun.update({
            where: { id: existing.id },
            data: {
              baseInr,
              commissionInr,
              status: 'draft',
            },
          })
        : await this.prisma.trainerPayrollRun.create({
            data: {
              gymId: tenant.id,
              trainerName: t.user.name,
              baseInr,
              commissionInr,
              period,
              status: 'draft',
            },
          });
      runs.push(row);
    }
    return runs;
  }

  async downloadReport(
    user: AuthUserPayload,
    gymSlug: string,
    reportId: string,
    format?: string,
  ) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const report = await this.prisma.gymReportExport.findFirst({
      where: { id: reportId, gymId: tenant.id },
    });
    if (!report) throw new NotFoundException('Report not found');

    let csv = `report,${report.name}\n`;
    if (report.name.toLowerCase().includes('attendance')) {
      const rows = await this.prisma.memberCheckIn.findMany({
        where: { gymId: tenant.id },
        include: { member: true },
        orderBy: { checkInAt: 'desc' },
        take: 200,
      });
      csv += 'member,check_in,check_out,branch\n';
      for (const r of rows) {
        csv += `${r.member.name},${r.checkInAt.toISOString()},${r.checkOutAt?.toISOString() ?? ''},${r.branchName}\n`;
      }
    } else if (report.name.toLowerCase().includes('revenue')) {
      const rows = await this.prisma.gymPayment.findMany({
        where: { gymId: tenant.id, status: 'paid' },
        include: { member: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      csv += 'member,title,amount_inr,method,at\n';
      for (const r of rows) {
        csv += `${r.member.name},${r.title},${r.amountInr},${r.method},${r.createdAt.toISOString()}\n`;
      }
    } else {
      const members = await this.prisma.userTenantRole.count({
        where: { gymId: tenant.id, role: 'MEMBER' },
      });
      csv += `metric,value\nmembers,${members}\n`;
    }
    const wantPdf =
      format?.toLowerCase() === 'pdf' ||
      report.format.toUpperCase() === 'PDF';
    const base = report.name.replace(/\s+/g, '-').toLowerCase();
    if (wantPdf) {
      const pdf = await textReportToPdf(report.name, csv);
      return {
        filename: `${base}.pdf`,
        content: pdf.toString('base64'),
        contentType: 'application/pdf',
        encoding: 'base64' as const,
      };
    }
    return {
      filename: `${base}.csv`,
      content: csv,
      contentType: 'text/csv',
      encoding: 'utf8' as const,
    };
  }

  private async buildFinanceAnalytics(
    gymId: string,
    now: Date,
    mtd: {
      membershipMtd: number;
      supplementMtd: number;
      expenseMtd: number;
      payrollMtd: number;
      refundMtd: number;
    },
  ) {
    const dailyCount = 90;
    const monthCount = 12;
    const rangeStart = new Date(now.getFullYear(), now.getMonth() - (monthCount - 1), 1);
    const dailyStart = new Date(now);
    dailyStart.setHours(0, 0, 0, 0);
    dailyStart.setDate(dailyStart.getDate() - (dailyCount - 1));

    const [payments, supplements, expenses, refunds] = await Promise.all([
      this.prisma.gymPayment.findMany({
        where: {
          gymId,
          status: { in: ['paid', 'refunded'] },
          createdAt: { gte: rangeStart },
        },
        select: { amountInr: true, createdAt: true },
      }),
      this.prisma.gymSupplementSale.findMany({
        where: { gymId, createdAt: { gte: rangeStart } },
        select: { amountInr: true, createdAt: true },
      }),
      this.prisma.gymOtherExpense.findMany({
        where: { gymId, paidAt: { gte: rangeStart } },
        select: { amountInr: true, paidAt: true },
      }),
      this.prisma.paymentRefund.findMany({
        where: {
          gymId,
          createdAt: { gte: rangeStart },
        },
        select: { amountInr: true, createdAt: true },
      }),
    ]);

    const dailyRows: {
      date: string;
      label: string;
      membershipInr: number;
      supplementInr: number;
      expenseInr: number;
      totalInr: number;
      netInr: number;
    }[] = [];

    for (let i = 0; i < dailyCount; i++) {
      const d = new Date(dailyStart);
      d.setDate(d.getDate() + i);
      const date = financeDayKey(d);
      dailyRows.push({
        date,
        label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        membershipInr: 0,
        supplementInr: 0,
        expenseInr: 0,
        totalInr: 0,
        netInr: 0,
      });
    }
    const dailyMap = new Map(dailyRows.map((row) => [row.date, row]));

    for (const p of payments) {
      if (p.createdAt < dailyStart) continue;
      const row = dailyMap.get(financeDayKey(p.createdAt));
      if (!row) continue;
      row.membershipInr += p.amountInr;
      row.totalInr += p.amountInr;
    }
    for (const s of supplements) {
      if (s.createdAt < dailyStart) continue;
      const row = dailyMap.get(financeDayKey(s.createdAt));
      if (!row) continue;
      row.supplementInr += s.amountInr;
      row.totalInr += s.amountInr;
    }
    for (const e of expenses) {
      if (e.paidAt < dailyStart) continue;
      const row = dailyMap.get(financeDayKey(e.paidAt));
      if (!row) continue;
      row.expenseInr += e.amountInr;
    }
    for (const row of dailyRows) {
      row.netInr = row.totalInr - row.expenseInr;
    }

    const monthlyTrend: {
      monthKey: string;
      monthLabel: string;
      membershipInr: number;
      supplementInr: number;
      expenseInr: number;
      refundInr: number;
      netInr: number;
    }[] = [];

    for (let i = monthCount - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      let membershipInr = 0;
      let supplementInr = 0;
      let expenseInr = 0;
      let refundInr = 0;
      for (const p of payments) {
        if (p.createdAt >= start && p.createdAt < end) membershipInr += p.amountInr;
      }
      for (const s of supplements) {
        if (s.createdAt >= start && s.createdAt < end) supplementInr += s.amountInr;
      }
      for (const e of expenses) {
        if (e.paidAt >= start && e.paidAt < end) expenseInr += e.amountInr;
      }
      for (const r of refunds) {
        if (r.createdAt >= start && r.createdAt < end) refundInr += r.amountInr;
      }
      monthlyTrend.push({
        monthKey: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
        monthLabel: start.toLocaleDateString('en-IN', {
          month: 'short',
          year: '2-digit',
        }),
        membershipInr,
        supplementInr,
        expenseInr,
        refundInr,
        netInr: membershipInr + supplementInr - expenseInr - refundInr,
      });
    }

    const inflowTotal = mtd.membershipMtd + mtd.supplementMtd;
    const outflowTotal =
      mtd.expenseMtd + mtd.payrollMtd + mtd.refundMtd;

    const sumDaily = (
      slice: typeof dailyRows,
      pick: (r: (typeof dailyRows)[0]) => number,
    ) => slice.reduce((s, r) => s + pick(r), 0);

    const last7 = dailyRows.slice(-7);
    const prev7 = dailyRows.slice(-14, -7);

    const monthComparisons = monthlyTrend.map((m, i) => {
      const prev = i > 0 ? monthlyTrend[i - 1] : null;
      const inflowInr = m.membershipInr + m.supplementInr;
      const prevInflow = prev ? prev.membershipInr + prev.supplementInr : 0;
      return {
        monthKey: m.monthKey,
        monthLabel: m.monthLabel,
        prevMonthLabel: prev?.monthLabel ?? null,
        inflowInr,
        prevInflowInr: prevInflow,
        inflowChangePct: financePctChange(inflowInr, prevInflow),
        expenseInr: m.expenseInr,
        prevExpenseInr: prev?.expenseInr ?? 0,
        expenseChangePct: financePctChange(m.expenseInr, prev?.expenseInr ?? 0),
        netInr: m.netInr,
        prevNetInr: prev?.netInr ?? 0,
        netChangePct: financePctChange(m.netInr, prev?.netInr ?? 0),
      };
    });

    const curMonth = monthlyTrend[monthlyTrend.length - 1];
    const prevMonth = monthlyTrend[monthlyTrend.length - 2];
    const curInflow = curMonth
      ? curMonth.membershipInr + curMonth.supplementInr
      : 0;
    const prevInflow = prevMonth
      ? prevMonth.membershipInr + prevMonth.supplementInr
      : 0;

    return {
      dailyInflow: dailyRows,
      monthlyTrend,
      monthComparisons,
      weekCompare: {
        thisWeekLabel: 'Last 7 days',
        prevWeekLabel: 'Prior 7 days',
        thisWeekInflowInr: sumDaily(last7, (r) => r.totalInr),
        prevWeekInflowInr: sumDaily(prev7, (r) => r.totalInr),
        thisWeekExpenseInr: sumDaily(last7, (r) => r.expenseInr),
        prevWeekExpenseInr: sumDaily(prev7, (r) => r.expenseInr),
        thisWeekNetInr: sumDaily(last7, (r) => r.netInr),
        prevWeekNetInr: sumDaily(prev7, (r) => r.netInr),
        inflowChangePct: financePctChange(
          sumDaily(last7, (r) => r.totalInr),
          sumDaily(prev7, (r) => r.totalInr),
        ),
        netChangePct: financePctChange(
          sumDaily(last7, (r) => r.netInr),
          sumDaily(prev7, (r) => r.netInr),
        ),
      },
      monthPeriodCompare: {
        currentLabel: curMonth?.monthLabel ?? 'This month',
        previousLabel: prevMonth?.monthLabel ?? 'Last month',
        currentInflowInr: curInflow,
        previousInflowInr: prevInflow,
        currentExpenseInr: curMonth?.expenseInr ?? 0,
        previousExpenseInr: prevMonth?.expenseInr ?? 0,
        currentNetInr: curMonth?.netInr ?? 0,
        previousNetInr: prevMonth?.netInr ?? 0,
        inflowChangePct: financePctChange(curInflow, prevInflow),
        expenseChangePct: financePctChange(
          curMonth?.expenseInr ?? 0,
          prevMonth?.expenseInr ?? 0,
        ),
        netChangePct: financePctChange(
          curMonth?.netInr ?? 0,
          prevMonth?.netInr ?? 0,
        ),
      },
      inflowMix: {
        membershipInr: mtd.membershipMtd,
        supplementInr: mtd.supplementMtd,
        totalInr: inflowTotal,
      },
      outflowMix: {
        expenseInr: mtd.expenseMtd,
        payrollInr: mtd.payrollMtd,
        refundInr: mtd.refundMtd,
        totalInr: outflowTotal,
      },
    };
  }

  async getPaymentCollection(user: AuthUserPayload, gymSlug: string) {
    const slug = gymSlug?.trim().toLowerCase();
    if (!slug) throw new BadRequestException('gymSlug is required');
    const allowed =
      gymRole(user, Role.GYM_ADMIN, slug) || gymRole(user, Role.MEMBER, slug);
    if (!allowed) throw new ForbiddenException('Not allowed for this gym');
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new NotFoundException('Gym not found');
    return paymentCollectionFromTenant(tenant);
  }

  async updatePaymentCollection(
    user: AuthUserPayload,
    gymSlug: string,
    dto: UpdatePaymentCollectionDto,
  ) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const data: {
      payoutBankHolderName?: string | null;
      payoutBankName?: string | null;
      payoutBankAccountNumber?: string | null;
      payoutBankIfsc?: string | null;
      payoutUpiId?: string | null;
      payoutUpiQrMimeType?: string | null;
      payoutUpiQrData?: string | null;
    } = {};

    if (dto.bankHolderName !== undefined) {
      data.payoutBankHolderName = optionalTextField(dto.bankHolderName);
    }
    if (dto.bankName !== undefined) {
      data.payoutBankName = optionalTextField(dto.bankName);
    }
    if (dto.bankAccountNumber !== undefined) {
      data.payoutBankAccountNumber = optionalTextField(dto.bankAccountNumber);
    }
    if (dto.bankIfsc !== undefined) {
      const ifsc = optionalTextField(dto.bankIfsc);
      data.payoutBankIfsc = ifsc ? ifsc.toUpperCase() : null;
    }
    if (dto.upiId !== undefined) {
      data.payoutUpiId = optionalTextField(dto.upiId);
    }
    if (dto.clearUpiQr) {
      data.payoutUpiQrMimeType = null;
      data.payoutUpiQrData = null;
    } else if (dto.upiQrBase64) {
      const qr = validateBase64Image({
        base64: dto.upiQrBase64,
        mimeType: dto.upiQrMimeType,
        maxBytes: 2_500_000,
        label: 'UPI QR',
      });
      data.payoutUpiQrMimeType = qr.mimeType;
      data.payoutUpiQrData = qr.base64;
    }

    const updated = await this.prisma.tenant.update({
      where: { id: tenant.id },
      data,
    });
    return paymentCollectionFromTenant(updated);
  }

  async settings(user: AuthUserPayload, gymSlug: string) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const gymId = tenant.id;

    const [branches, roleCounts, owners, activeMemberships, membershipPlans] =
      await Promise.all([
        this.prisma.branch.findMany({
          where: { gymId },
          orderBy: { createdAt: 'asc' },
          select: { id: true, name: true, status: true },
        }),
        this.prisma.userTenantRole.groupBy({
          by: ['role'],
          where: { gymId },
          _count: { userId: true },
        }),
        this.prisma.userTenantRole.findMany({
          where: { gymId, role: Role.GYM_ADMIN },
          include: {
            user: { select: { name: true, email: true, phone: true } },
          },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.memberMembership.count({
          where: { gymId, status: { in: ['active', 'trial'] } },
        }),
        this.prisma.gymMembershipPlan.count({ where: { gymId } }),
      ]);

    const appPublicUrl = (
      this.config.get<string>('APP_PUBLIC_URL') ?? 'https://fit-core-mocha.vercel.app'
    ).replace(/\/$/, '');

    return {
      gymName: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      createdAt: tenant.createdAt.toISOString(),
      branches,
      teamCounts: roleCounts.map((row) => ({
        role: row.role,
        count: row._count.userId,
      })),
      owners: owners.map((row) => ({
        name: row.user.name,
        email: row.user.email,
        phone: row.user.phone,
      })),
      activeMemberships,
      membershipPlans,
      memberSignupUrl: `${appPublicUrl}/signup`,
      adminWebUrl: appPublicUrl,
      paymentCollection: paymentCollectionFromTenant(tenant),
    };
  }
}

function optionalTextField(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function financePctChange(current: number, previous: number): number | null {
  if (previous === 0) {
    if (current === 0) return 0;
    return null;
  }
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function financeDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mapMembershipStatus(raw: string): string {
  if (raw === 'trial') return 'active';
  if (raw === 'frozen') return 'paused';
  if (raw === 'expired') return 'expiring';
  return raw;
}
