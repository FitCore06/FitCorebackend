import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { ExpoPushService } from '../notifications/expo-push.service.js';
import {
  expiryNotifyLeadDays,
  isExpiryNotifyDailyUntilPaid,
} from './automation-days.js';
import { formatMembershipExpiryReminderMessage } from './membership-expiry-message.js';
import { parseMembershipExpiryChannels } from './membership-expiry-channels.js';
import {
  expiryDedupeKey,
  expiryDedupeKeyVariants,
  membershipIdFromExpiryDedupe,
} from './membership-expiry-dedupe.js';

export type MembershipExpiryCandidate = {
  membershipId: string;
  memberUserId: string;
  memberName: string;
  memberEmail: string | null;
  phone: string | null;
  planName: string;
  endsOn: string;
  daysUntil: number;
  message: string;
  dedupeKey: string;
};

export type MembershipExpiryRunItem = {
  membershipId: string;
  memberEmail: string | null;
  status: 'sent' | 'skipped' | 'failed';
  detail?: string;
  deliveredVia?: string[];
};

export type MembershipExpiryRunResult = {
  gymSlug: string;
  gymName: string;
  notifyOnDays: number[];
  channels: string[];
  candidateCount: number;
  sent: number;
  skipped: number;
  failed: number;
  results: MembershipExpiryRunItem[];
};

@Injectable()
export class AutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly expoPush: ExpoPushService,
  ) {}

  async listMembershipExpiryCandidates(
    gymSlug: string,
    daysBefore: number[],
  ): Promise<{
    gymSlug: string;
    gymName: string;
    notifyOnDays: number[];
    candidates: MembershipExpiryCandidate[];
  }> {
    const slug = gymSlug?.trim().toLowerCase();
    if (!slug) throw new BadRequestException('gymSlug is required');
    const uniqueDays = [...new Set(daysBefore.filter((d) => Number.isFinite(d) && d >= 0))].sort(
      (a, b) => b - a,
    );
    if (!uniqueDays.length) throw new BadRequestException('days query must list at least one offset');

    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new NotFoundException('Gym not found');

    const today = utcMidnight(new Date());
    const dailyUntilPaid = this.isExpiryDailyUntilPaid();
    const leadDays = expiryNotifyLeadDays(uniqueDays);
    const horizon = new Date(today);
    horizon.setUTCDate(horizon.getUTCDate() + leadDays);

    const expiring = dailyUntilPaid
      ? await this.prisma.memberMembership.findMany({
          where: {
            gymId: tenant.id,
            status: { in: ['active', 'trial'] },
            endsAt: { lte: horizon },
          },
          include: { member: true, plan: true },
        })
      : await this.prisma.memberMembership.findMany({
          where: {
            gymId: tenant.id,
            status: { in: ['active', 'trial'] },
            OR: uniqueDays.map((offset) => {
              const ends = new Date(today);
              ends.setUTCDate(ends.getUTCDate() + offset);
              return { endsAt: ends };
            }),
          },
          include: { member: true, plan: true },
        });

    const memberIds = [...new Set(expiring.map((row) => row.memberUserId))];
    const pendingMemberIds = dailyUntilPaid
      ? await this.pendingMembershipPaymentMemberIds(tenant.id, memberIds)
      : new Set<string>();

    const dedupeKeys = [
      ...new Set(
        expiring.flatMap((row) =>
          expiryDedupeKeyVariants(row.id, row.endsAt, today),
        ),
      ),
    ];
    const sent = dedupeKeys.length
      ? await this.prisma.gymNotification.findMany({
          where: { dedupeKey: { in: dedupeKeys } },
          select: { dedupeKey: true },
        })
      : [];
    const sentKeys = new Set(sent.map((row) => row.dedupeKey));

    const candidates: MembershipExpiryCandidate[] = [];
    const notifyDaySet = new Set(uniqueDays);
    for (const row of expiring) {
      const endsOn = row.endsAt.toISOString().slice(0, 10);
      const daysUntil = Math.round(
        (row.endsAt.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (!dailyUntilPaid && !notifyDaySet.has(daysUntil)) continue;
      if (dailyUntilPaid && daysUntil > leadDays) continue;

      const dedupeKey = expiryDedupeKey(row.id, row.endsAt, today);
      const alreadySent = expiryDedupeKeyVariants(row.id, row.endsAt, today).some(
        (key) => sentKeys.has(key),
      );
      if (alreadySent) continue;

      const phone = row.member.phone?.trim() || null;
      const paymentPendingApproval = pendingMemberIds.has(row.memberUserId);
      candidates.push({
        membershipId: row.id,
        memberUserId: row.memberUserId,
        memberName: row.member.name,
        memberEmail: row.member.email?.trim() || null,
        phone,
        planName: row.plan.name,
        endsOn,
        daysUntil,
        message: formatMembershipExpiryReminderMessage({
          gymName: tenant.name,
          memberName: row.member.name,
          planName: row.plan.name,
          endsOn,
          daysUntil,
          paymentPendingApproval,
        }),
        dedupeKey,
      });
    }

    return {
      gymSlug: slug,
      gymName: tenant.name,
      notifyOnDays: uniqueDays,
      candidates,
    };
  }

  async runMembershipExpiryReminders(
    gymSlug: string,
    daysBefore: number[],
  ): Promise<MembershipExpiryRunResult> {
    const list = await this.listMembershipExpiryCandidates(gymSlug, daysBefore);
    const channels = parseMembershipExpiryChannels(
      this.config.get<string>('ATHRA_MEMBERSHIP_EXPIRY_CHANNELS') ||
        this.config.get<string>('FITCORE_MEMBERSHIP_EXPIRY_CHANNELS'),
    );
    const results: MembershipExpiryRunItem[] = [];
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const candidate of list.candidates) {
      const deliveredVia: string[] = [];

      if (channels.includes('in_app')) {
        deliveredVia.push('in_app');
      }

      const itemBase = {
        membershipId: candidate.membershipId,
        memberEmail: candidate.memberEmail,
        deliveredVia: deliveredVia.length ? deliveredVia : undefined,
      };

      if (deliveredVia.length) {
        sent += 1;
        await this.ackMembershipExpiryReminders(gymSlug, [candidate.dedupeKey]);
        results.push({
          ...itemBase,
          status: 'sent',
        });
        continue;
      }

      skipped += 1;
      results.push({
        ...itemBase,
        status: 'skipped',
        detail: 'No enabled channel could deliver',
      });
    }

    return {
      gymSlug: list.gymSlug,
      gymName: list.gymName,
      notifyOnDays: list.notifyOnDays,
      channels,
      candidateCount: list.candidates.length,
      sent,
      skipped,
      failed,
      results,
    };
  }

  async ackMembershipExpiryReminders(
    gymSlug: string,
    dedupeKeys: string[],
  ): Promise<{ recorded: number }> {
    const slug = gymSlug?.trim().toLowerCase();
    if (!slug) throw new BadRequestException('gymSlug is required');
    const keys = [...new Set(dedupeKeys.map((k) => k.trim()).filter(Boolean))];
    if (!keys.length) return { recorded: 0 };

    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new NotFoundException('Gym not found');

    const membershipIds = keys
      .map((key) => membershipIdFromExpiryDedupe(key))
      .filter((id): id is string => Boolean(id));
    const today = utcMidnight(new Date());
    const memberships = membershipIds.length
      ? await this.prisma.memberMembership.findMany({
          where: { gymId: tenant.id, id: { in: membershipIds } },
          include: { plan: true, member: true },
        })
      : [];
    const existingRows = await this.prisma.gymNotification.findMany({
      where: { dedupeKey: { in: keys } },
      select: { dedupeKey: true },
    });
    const alreadyRecorded = new Set(existingRows.map((row) => row.dedupeKey));
    const byMembershipId = new Map(memberships.map((row) => [row.id, row]));
    const memberIds = [...new Set(memberships.map((row) => row.memberUserId))];
    const pendingMemberIds = await this.pendingMembershipPaymentMemberIds(
      tenant.id,
      memberIds,
    );

    const data = keys
      .map((key) => {
        const membershipId = membershipIdFromExpiryDedupe(key);
        const membership = membershipId ? byMembershipId.get(membershipId) : undefined;
        if (!membership) return null;
        const endsOn = membership.endsAt.toISOString().slice(0, 10);
        const daysUntil = Math.round(
          (membership.endsAt.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
        );
        const body = formatMembershipExpiryReminderMessage({
          gymName: tenant.name,
          memberName: membership.member.name,
          planName: membership.plan.name,
          endsOn,
          daysUntil,
          paymentPendingApproval: pendingMemberIds.has(membership.memberUserId),
        });
        return {
          gymId: tenant.id,
          userId: membership.memberUserId,
          title: 'Membership expiry reminder',
          body,
          dedupeKey: key,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (!data.length) return { recorded: 0 };
    const result = await this.prisma.gymNotification.createMany({
      data,
      skipDuplicates: true,
    });

    const pushTargets = data.filter((row) => !alreadyRecorded.has(row.dedupeKey));
    await Promise.all(
      pushTargets.map((row) =>
        this.expoPush.sendToUser(row.userId, {
          title: row.title,
          body: row.body,
          data: { type: 'membership_expiry', dedupeKey: row.dedupeKey },
        }),
      ),
    );

    return { recorded: result.count };
  }

  private isExpiryDailyUntilPaid(): boolean {
    return isExpiryNotifyDailyUntilPaid(
      this.config.get<string>('ATHRA_EXPIRY_NOTIFY_DAILY') ||
        this.config.get<string>('FITCORE_EXPIRY_NOTIFY_DAILY'),
    );
  }

  private async pendingMembershipPaymentMemberIds(
    gymId: string,
    memberUserIds: string[],
  ): Promise<Set<string>> {
    if (!memberUserIds.length) {
      return new Set();
    }
    const pendingPayments = await this.prisma.gymPayment.findMany({
      where: {
        gymId,
        memberUserId: { in: memberUserIds },
        status: 'pending',
        membershipPlanId: { not: null },
      },
      select: { memberUserId: true },
    });
    return new Set(pendingPayments.map((p) => p.memberUserId));
  }
}

function utcMidnight(date: Date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}