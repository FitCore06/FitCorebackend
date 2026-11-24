import type { PrismaClient } from '@prisma/client';

function utcMidnight(d = new Date()) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function addMembershipDays(start: Date, durationDays: number) {
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + durationDays - 1);
  return end;
}

/** Stack after inclusive `endDate`: same day count as a new plan from the next calendar day. */
function extendFromEndDate(endDate: Date, durationDays: number) {
  const extensionStart = new Date(endDate);
  extensionStart.setUTCDate(extensionStart.getUTCDate() + 1);
  return addMembershipDays(extensionStart, durationDays);
}

function isStillActive(endsAt: Date, now = new Date()) {
  const today = utcMidnight(now);
  const endDay = utcMidnight(endsAt);
  return endDay >= today;
}

/** Renews current structured membership when payment title looks like membership. */
export async function renewMembershipAfterPayment(
  prisma: PrismaClient,
  gymId: string,
  memberUserId: string,
  paymentTitle: string,
): Promise<{ renewed: boolean; membershipId?: string; reason?: string }> {
  const title = paymentTitle.toLowerCase();
  const looksLikeMembership =
    title.includes('membership') ||
    title.includes('renew') ||
    title.includes('plan') ||
    title.includes('monthly') ||
    title.includes('annual');
  if (!looksLikeMembership) {
    return { renewed: false, reason: 'not_membership_payment' };
  }

  const current = await prisma.memberMembership.findFirst({
    where: {
      gymId,
      memberUserId,
      status: { in: ['active', 'trial', 'frozen'] },
    },
    orderBy: { endsAt: 'desc' },
  });
  if (!current) return { renewed: false, reason: 'no_active_membership' };

  const plan = await prisma.gymMembershipPlan.findFirst({
    where: { id: current.planId, gymId },
  });
  if (!plan?.durationDays) return { renewed: false, reason: 'plan_missing_duration' };

  const startsAt = utcMidnight();
  const endsAt = addMembershipDays(startsAt, plan.durationDays);

  const membership = await prisma.$transaction(async (tx) => {
    await tx.memberMembership.updateMany({
      where: {
        gymId,
        memberUserId,
        status: { in: ['active', 'trial', 'frozen'] },
      },
      data: { status: 'renewed' },
    });
    const created = await tx.memberMembership.create({
      data: {
        gymId,
        memberUserId,
        planId: plan.id,
        status: 'active',
        startsAt,
        endsAt,
        renewedFromId: current.id,
      },
    });
    await tx.memberTrainerAssignment.updateMany({
      where: { gymId, memberUserId },
      data: {
        membershipStatus: 'active',
        planLabel: plan.name,
        membershipNote: endsAt.toISOString().slice(0, 10),
      },
    });
    return created;
  });

  return { renewed: true, membershipId: membership.id };
}

/** Assign or switch membership to the plan chosen on the payment request. */
export async function applyMembershipFromPayment(
  prisma: PrismaClient,
  gymId: string,
  memberUserId: string,
  planId: string,
): Promise<{
  applied: boolean;
  membershipId?: string;
  planName?: string;
  durationDays?: number;
  endsOn?: string;
  stacked?: boolean;
  reason?: string;
}> {
  const plan = await prisma.gymMembershipPlan.findFirst({
    where: { id: planId, gymId },
  });
  if (!plan) return { applied: false, reason: 'plan_not_found' };
  if (!plan.durationDays) return { applied: false, reason: 'plan_missing_duration' };

  const current = await prisma.memberMembership.findFirst({
    where: {
      gymId,
      memberUserId,
      status: { in: ['active', 'trial', 'frozen'] },
    },
    orderBy: { endsAt: 'desc' },
  });

  const stacked = Boolean(current && isStillActive(current.endsAt));
  const startsAt = stacked && current ? current.startsAt : utcMidnight();
  const endsAt =
    stacked && current
      ? extendFromEndDate(current.endsAt, plan.durationDays)
      : addMembershipDays(startsAt, plan.durationDays);

  const membership = await prisma.$transaction(async (tx) => {
    await tx.memberMembership.updateMany({
      where: {
        gymId,
        memberUserId,
        status: { in: ['active', 'trial', 'frozen'] },
      },
      data: { status: stacked ? 'renewed' : 'replaced' },
    });
    const created = await tx.memberMembership.create({
      data: {
        gymId,
        memberUserId,
        planId: plan.id,
        status: 'active',
        startsAt,
        endsAt,
        renewedFromId: current?.id ?? null,
      },
    });
    const planLabel = stacked
      ? `${plan.name} (+${plan.durationDays}d)`
      : plan.name;
    await tx.memberTrainerAssignment.updateMany({
      where: { gymId, memberUserId },
      data: {
        membershipStatus: 'active',
        planLabel,
        membershipNote: endsAt.toISOString().slice(0, 10),
      },
    });
    return created;
  });

  return {
    applied: true,
    membershipId: membership.id,
    planName: plan.name,
    durationDays: plan.durationDays,
    endsOn: endsAt.toISOString().slice(0, 10),
    stacked,
  };
}