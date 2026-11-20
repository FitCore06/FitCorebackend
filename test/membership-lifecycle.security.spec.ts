import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role, type AuthUserPayload } from '../src/auth/auth.types.js';
import { GymOpsService } from '../src/gym-ops/gym-ops.service.js';

const owner: AuthUserPayload = {
  id: 'owner-a', email: 'owner-a@example.test', name: 'Owner A',
  roles: [{ gymId: 'gym-a', gymSlug: 'gym-a', gymName: 'Gym A', role: Role.GYM_ADMIN }],
};

describe('Membership lifecycle tenant safety', () => {
  const tx = {
    memberMembership: { updateMany: vi.fn(), create: vi.fn() },
    memberTrainerAssignment: { updateMany: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn().mockImplementation((callback) => callback(tx)),
    tenant: { findUnique: vi.fn() },
    userTenantRole: { findFirst: vi.fn() },
    gymMembershipPlan: { findFirst: vi.fn() },
    memberMembership: { findFirst: vi.fn(), findMany: vi.fn() },
    gymNotification: { createMany: vi.fn() },
  };
  let service: GymOpsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GymOpsService(prisma as never, { get: vi.fn() } as never);
    prisma.tenant.findUnique.mockResolvedValue({ id: 'gym-a', slug: 'gym-a' });
    prisma.userTenantRole.findFirst.mockResolvedValue({ userId: 'member-a' });
    prisma.gymMembershipPlan.findFirst.mockResolvedValue({
      id: 'plan-a', gymId: 'gym-a', name: 'Monthly', durationDays: 30,
    });
    tx.memberMembership.create.mockResolvedValue({ id: 'membership-a' });
  });

  it('creates structured membership and synchronizes legacy authorization state', async () => {
    await service.assignMembership(owner, 'gym-a', {
      memberUserId: 'member-a', planId: 'plan-a', startDate: '2026-11-20', status: 'active',
    });
    expect(tx.memberMembership.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        gymId: 'gym-a', memberUserId: 'member-a', planId: 'plan-a', status: 'active',
        endsAt: new Date('2026-12-19T00:00:00.000Z'),
      }), include: expect.any(Object),
    });
    expect(tx.memberTrainerAssignment.updateMany).toHaveBeenCalledWith({
      where: { gymId: 'gym-a', memberUserId: 'member-a' },
      data: expect.objectContaining({ membershipStatus: 'active', planLabel: 'Monthly' }),
    });
  });

  it('denies cross-tenant assignment before writes', async () => {
    await expect(service.assignMembership(owner, 'gym-b', {
      memberUserId: 'member-b', planId: 'plan-b', status: 'active',
    })).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('renews by closing old record and creating a new history row', async () => {
    prisma.memberMembership.findFirst.mockResolvedValue({
      id: 'membership-old', gymId: 'gym-a', memberUserId: 'member-a', planId: 'plan-a',
    });
    await service.renewMembership(owner, 'gym-a', 'membership-old', { startDate: '2026-12-20' });
    expect(tx.memberMembership.updateMany).toHaveBeenCalledWith({
      where: { gymId: 'gym-a', memberUserId: 'member-a', status: { in: ['active', 'trial', 'frozen'] } },
      data: { status: 'renewed' },
    });
    expect(tx.memberMembership.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ renewedFromId: 'membership-old' }), include: expect.any(Object),
    });
  });

  it('creates idempotent seven-day expiry reminders', async () => {
    prisma.memberMembership.findMany.mockResolvedValue([{
      id: 'membership-a', gymId: 'gym-a', memberUserId: 'member-a',
      endsAt: new Date('2026-11-25T00:00:00.000Z'), plan: { name: 'Monthly' },
    }]);
    prisma.gymNotification.createMany.mockResolvedValue({ count: 1 });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T00:00:00.000Z'));
    const result = await service.runMembershipReminders(owner, 'gym-a');
    vi.useRealTimers();
    expect(result).toEqual({ candidates: 1, created: 1 });
    expect(prisma.gymNotification.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        userId: 'member-a',
        dedupeKey: 'membership-expiry:membership-a:2026-11-25',
      })],
      skipDuplicates: true,
    });
  });
});
