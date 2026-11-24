import { describe, expect, it, vi } from 'vitest';
import {
  applyMembershipFromPayment,
  renewMembershipAfterPayment,
} from '../src/common/membership-renew-after-payment.js';

function utcDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

describe('renewMembershipAfterPayment', () => {
  it('skips non-membership titles', async () => {
    const prisma = {
      memberMembership: { findFirst: vi.fn() },
    } as never;
    const res = await renewMembershipAfterPayment(
      prisma,
      'gym-1',
      'user-1',
      'PT pack (4 sessions)',
    );
    expect(res.renewed).toBe(false);
    expect(res.reason).toBe('not_membership_payment');
  });
});

describe('applyMembershipFromPayment stacking', () => {
  it('extends by plan duration without an extra calendar day', async () => {
    const currentEndsAt = utcDate('2026-01-30');
    const currentStartsAt = utcDate('2026-01-01');
    let createdEndsAt: Date | undefined;

    const prisma = {
      gymMembershipPlan: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'plan-1',
          name: 'Monthly',
          durationDays: 30,
        }),
      },
      memberMembership: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'mem-1',
          startsAt: currentStartsAt,
          endsAt: currentEndsAt,
        }),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          memberMembership: {
            updateMany: vi.fn(),
            create: vi.fn().mockImplementation(async (args: { data: { endsAt: Date } }) => {
              createdEndsAt = args.data.endsAt;
              return { id: 'mem-2', ...args.data };
            }),
          },
          memberTrainerAssignment: { updateMany: vi.fn() },
        };
        return fn(tx);
      }),
    } as never;

    const res = await applyMembershipFromPayment(prisma, 'gym-1', 'user-1', 'plan-1');
    expect(res.applied).toBe(true);
    expect(res.stacked).toBe(true);
    expect(createdEndsAt?.toISOString().slice(0, 10)).toBe('2026-03-01');
  });
});