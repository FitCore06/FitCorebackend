import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StreakChallengeService } from '../src/attendance/streak-challenge.service.js';
import type { AuthUserPayload } from '../src/auth/auth.types.js';
import { Role } from '../src/auth/auth.types.js';

describe('Streak challenge security', () => {
  const prisma = {
    exercise: { findFirst: vi.fn() },
    userTenantRole: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    memberStreakChallenge: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    gymNotification: { create: vi.fn() },
    memberStreakChallengeSetCompletion: { create: vi.fn() },
  };

  const challengeRowExtras = {
    activeDay: null,
    winnerUserId: null,
    winReason: null,
    cancelledByUserId: null,
    challengerStartedAt: null,
    challengedStartedAt: null,
    completedAt: null,
    cancelledBy: null as { id: string; name: string } | null,
    setCompletions: [] as { userId: string; setNumber: number }[],
  };

  let service: StreakChallengeService;

  const memberUser: AuthUserPayload = {
    id: 'user-a',
    email: 'a@test.com',
    roles: [{ role: Role.MEMBER, gymId: 'gym-1', gymSlug: 'demo' }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new StreakChallengeService(prisma as never);
  });

  it('rejects self-challenge', async () => {
    await expect(
      service.create(memberUser, {
        challengedUserId: 'user-a',
        exerciseName: 'Bench Press',
        setCount: 3,
        targetWeightKg: 40,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('notifies challenged member on create', async () => {
    prisma.userTenantRole.findFirst.mockResolvedValue({
      userId: 'user-b',
      user: { name: 'Beta' },
    });
    prisma.user.findUnique.mockResolvedValue({ name: 'Alpha' });
    prisma.memberStreakChallenge.findFirst.mockResolvedValue(null);
    prisma.memberStreakChallenge.create.mockResolvedValue({
      id: 'ch-1',
      status: 'pending',
      exerciseId: null,
      exerciseName: 'Bench Press',
      setCount: 3,
      targetWeightKg: 40,
      createdAt: new Date(),
      respondedAt: null,
      challengerUserId: 'user-a',
      challengedUserId: 'user-b',
      challenger: { id: 'user-a', name: 'Alpha' },
      challenged: { id: 'user-b', name: 'Beta' },
      ...challengeRowExtras,
    });
    prisma.gymNotification.create.mockResolvedValue({});

    await service.create(memberUser, {
      challengedUserId: 'user-b',
      exerciseName: 'Bench Press',
      setCount: 3,
      targetWeightKg: 40,
    });

    expect(prisma.gymNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-b',
          title: 'Streak challenge',
        }),
      }),
    );
  });

  it('lets challenger cancel pending challenge', async () => {
    prisma.memberStreakChallenge.findFirst.mockResolvedValue({
      id: 'ch-1',
      status: 'pending',
      gymId: 'gym-1',
      exerciseId: null,
      exerciseName: 'Row',
      setCount: 3,
      targetWeightKg: 30,
      challengerUserId: 'user-a',
      challengedUserId: 'user-b',
      challenger: { id: 'user-a', name: 'Alpha' },
      challenged: { id: 'user-b', name: 'Beta' },
      ...challengeRowExtras,
    });
    prisma.memberStreakChallenge.update.mockResolvedValue({
      id: 'ch-1',
      status: 'cancelled',
      exerciseId: null,
      exerciseName: 'Row',
      setCount: 3,
      targetWeightKg: 30,
      createdAt: new Date(),
      respondedAt: new Date(),
      challengerUserId: 'user-a',
      challengedUserId: 'user-b',
      challenger: { id: 'user-a', name: 'Alpha' },
      challenged: { id: 'user-b', name: 'Beta' },
      ...challengeRowExtras,
      cancelledByUserId: 'user-a',
      cancelledBy: { id: 'user-a', name: 'Alpha' },
    });
    prisma.gymNotification.create.mockResolvedValue({});

    await service.cancel(memberUser, 'ch-1');

    expect(prisma.gymNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-b',
          title: 'Challenge cancelled',
        }),
      }),
    );
  });

  it('notifies challenger when challenge accepted', async () => {
    prisma.memberStreakChallenge.findFirst.mockResolvedValue({
      id: 'ch-1',
      status: 'pending',
      gymId: 'gym-1',
      exerciseId: null,
      exerciseName: 'Squat',
      setCount: 5,
      targetWeightKg: 60,
      challengerUserId: 'user-a',
      challengedUserId: 'user-b',
      challenger: { id: 'user-a', name: 'Alpha' },
      challenged: { id: 'user-b', name: 'Beta' },
      ...challengeRowExtras,
    });
    prisma.memberStreakChallenge.update.mockResolvedValue({
      id: 'ch-1',
      status: 'accepted',
      exerciseId: null,
      exerciseName: 'Squat',
      setCount: 5,
      targetWeightKg: 60,
      createdAt: new Date(),
      respondedAt: new Date(),
      challengerUserId: 'user-a',
      challengedUserId: 'user-b',
      challenger: { id: 'user-a', name: 'Alpha' },
      challenged: { id: 'user-b', name: 'Beta' },
      ...challengeRowExtras,
    });
    prisma.gymNotification.create.mockResolvedValue({});

    await service.respond(
      { ...memberUser, id: 'user-b' },
      'ch-1',
      { decision: 'accept' },
    );

    expect(prisma.gymNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-a',
          title: 'Challenge accepted',
        }),
      }),
    );
  });
});