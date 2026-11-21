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