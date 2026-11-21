import { describe, expect, it, vi } from 'vitest';
import { renewMembershipAfterPayment } from '../src/common/membership-renew-after-payment.js';

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