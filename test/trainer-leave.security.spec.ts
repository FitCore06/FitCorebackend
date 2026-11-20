import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role, type AuthUserPayload } from '../src/auth/auth.types.js';
import { TrainersService } from '../src/trainers/trainers.service.js';

const trainer: AuthUserPayload = {
  id: 'trainer-a',
  email: 'trainer-a@example.test',
  name: 'Trainer A',
  roles: [{ gymId: 'gym-a', gymSlug: 'gym-a', gymName: 'Gym A', role: Role.TRAINER }],
};

const owner: AuthUserPayload = {
  id: 'owner-a',
  email: 'owner-a@example.test',
  name: 'Owner A',
  roles: [{ gymId: 'gym-a', gymSlug: 'gym-a', gymName: 'Gym A', role: Role.GYM_ADMIN }],
};

describe('Trainer leave tenant safety and approval', () => {
  const prisma = {
    $transaction: vi.fn().mockImplementation((callback) => callback(prisma)),
    tenant: { findUnique: vi.fn() },
    trainerLeaveRequest: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    trainerProfile: { upsert: vi.fn() },
    userTenantRole: { findMany: vi.fn() },
    gymNotification: { createMany: vi.fn() },
  };
  let service: TrainersService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TrainersService(prisma as never);
    prisma.tenant.findUnique.mockResolvedValue({ id: 'gym-a', slug: 'gym-a' });
  });

  it('creates request only in authenticated trainer tenant', async () => {
    prisma.trainerLeaveRequest.findFirst.mockResolvedValue(null);
    prisma.trainerLeaveRequest.create.mockResolvedValue({ id: 'leave-1', status: 'pending' });

    await service.createLeaveRequest(trainer, {
      fromDate: '2026-11-20',
      toDate: '2026-11-22',
      note: 'Medical',
    });

    expect(prisma.trainerLeaveRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ gymId: 'gym-a', trainerUserId: 'trainer-a' }),
      include: expect.any(Object),
    });
  });

  it('denies an owner reviewing another tenant request', async () => {
    prisma.trainerLeaveRequest.findFirst.mockResolvedValue(null);

    await expect(
      service.reviewLeaveRequest(owner, 'gym-a', 'leave-from-gym-b', { status: 'approved' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('approval updates trainer status and notifies every tenant member', async () => {
    prisma.trainerLeaveRequest.findFirst.mockResolvedValue({
      id: 'leave-1',
      gymId: 'gym-a',
      trainerUserId: 'trainer-a',
      status: 'pending',
      fromDate: new Date('2026-11-20T00:00:00.000Z'),
      toDate: new Date('2026-11-22T00:00:00.000Z'),
      trainer: { name: 'Trainer A' },
    });
    prisma.trainerLeaveRequest.update.mockResolvedValue({ id: 'leave-1', status: 'approved' });
    prisma.userTenantRole.findMany.mockResolvedValue([
      { userId: 'member-1' },
      { userId: 'member-2' },
    ]);
    prisma.trainerProfile.upsert.mockResolvedValue({});
    prisma.gymNotification.createMany.mockResolvedValue({ count: 2 });

    await service.reviewLeaveRequest(owner, 'gym-a', 'leave-1', { status: 'approved' });

    expect(prisma.trainerProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ floorStatus: 'leave', liveStatus: 'leave' }),
      }),
    );
    expect(prisma.gymNotification.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ gymId: 'gym-a', userId: 'member-1' }),
        expect.objectContaining({ gymId: 'gym-a', userId: 'member-2' }),
      ]),
    });
  });

  it('repeated review returns saved result without duplicate notifications', async () => {
    prisma.trainerLeaveRequest.findFirst.mockResolvedValue({
      id: 'leave-1',
      gymId: 'gym-a',
      status: 'approved',
    });

    const result = await service.reviewLeaveRequest(owner, 'gym-a', 'leave-1', {
      status: 'approved',
    });

    expect(result.status).toBe('approved');
    expect(prisma.gymNotification.createMany).not.toHaveBeenCalled();
    expect(prisma.trainerLeaveRequest.update).not.toHaveBeenCalled();
  });
});
