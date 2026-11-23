import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { WorkoutSessionService } from '../src/fitness/workout-session.service.js';
import { Role, type AuthUserPayload } from '../src/auth/auth.types.js';

describe('WorkoutSessionService Security & Lifecycle', () => {
  const memberA: AuthUserPayload = {
    id: 'member-a-id',
    email: 'member-a@gym.test',
    name: 'Member A',
    roles: [{ gymId: 'gym-a-id', gymSlug: 'gym-a', gymName: 'Gym A', role: Role.MEMBER }],
  };

  const memberB: AuthUserPayload = {
    id: 'member-b-id',
    email: 'member-b@gym.test',
    name: 'Member B',
    roles: [{ gymId: 'gym-b-id', gymSlug: 'gym-b', gymName: 'Gym B', role: Role.MEMBER }],
  };

  const trainerA: AuthUserPayload = {
    id: 'trainer-a-id',
    email: 'trainer-a@gym.test',
    name: 'Trainer A',
    roles: [{ gymId: 'gym-a-id', gymSlug: 'gym-a', gymName: 'Gym A', role: Role.TRAINER }],
  };

  const mockPrisma = {
    workoutSession: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    workoutPlanAssignment: {
      findFirst: vi.fn(),
    },
    workoutSessionExercise: {
      create: vi.fn(),
    },
    workoutSessionSet: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    workoutSetLog: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn(mockPrisma)),
  } as any;

  const service = new WorkoutSessionService(mockPrisma, {
    resolveWeeklyPlanForMember: async () => ({ days: [] }),
  } as any);

  it('rejects duplicate concurrent session start', async () => {
    mockPrisma.workoutSession.findFirst.mockResolvedValue({
      id: 'active-session-1',
      status: 'IN_PROGRESS',
    });

    await expect(service.startSession(memberA, {}, 'gym-a')).rejects.toThrow(ConflictException);
  });

  it('rejects trainer attempting to start a member workout session', async () => {
    await expect(service.startSession(trainerA, {}, 'gym-a')).rejects.toThrow(ForbiddenException);
  });

  it('rejects cross-tenant session access', async () => {
    mockPrisma.workoutSession.findUnique.mockResolvedValue({
      id: 'session-1',
      gymId: 'gym-a-id',
      memberUserId: 'member-a-id',
    });

    await expect(service.getSession(memberB, 'session-1', 'gym-b')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects cross-member session pause within same gym', async () => {
    const memberA2: AuthUserPayload = {
      id: 'member-a2-id',
      email: 'member-a2@gym.test',
      name: 'Member A2',
      roles: [{ gymId: 'gym-a-id', gymSlug: 'gym-a', gymName: 'Gym A', role: Role.MEMBER }],
    };

    mockPrisma.workoutSession.findUnique.mockResolvedValue({
      id: 'session-1',
      gymId: 'gym-a-id',
      memberUserId: 'member-a-id',
      status: 'IN_PROGRESS',
    });

    await expect(service.pauseSession(memberA2, 'session-1', 'gym-a')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects set completion on an already completed session', async () => {
    mockPrisma.workoutSession.findUnique.mockResolvedValue({
      id: 'session-1',
      gymId: 'gym-a-id',
      memberUserId: 'member-a-id',
      status: 'COMPLETED',
    });

    await expect(
      service.completeSet(memberA, 'session-1', 'set-1', { actualReps: 10 }, 'gym-a'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects pause on a cancelled session', async () => {
    mockPrisma.workoutSession.findUnique.mockResolvedValue({
      id: 'session-1',
      gymId: 'gym-a-id',
      memberUserId: 'member-a-id',
      status: 'CANCELLED',
    });

    await expect(service.pauseSession(memberA, 'session-1', 'gym-a')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('starts session from weekly plan without invalid exercise FK ids', async () => {
    mockPrisma.workoutSession.findFirst.mockResolvedValue(null);
    mockPrisma.workoutPlanAssignment.findFirst.mockResolvedValue(null);
    mockPrisma.workoutSession.create.mockResolvedValue({
      id: 'session-new',
      dayTitle: 'Upper body strength',
    });
    mockPrisma.workoutSession.update.mockResolvedValue({});
    const exerciseCreates: { data: { exerciseId: string | null } }[] = [];
    mockPrisma.workoutSessionExercise.create.mockImplementation(
      (args: { data: { exerciseId: string | null } }) => {
        exerciseCreates.push(args);
        return Promise.resolve({ id: `sex-${exerciseCreates.length}` });
      },
    );
    mockPrisma.workoutSessionSet.create.mockResolvedValue({});
    mockPrisma.workoutSession.findUnique.mockResolvedValue({
      id: 'session-new',
      status: 'IN_PROGRESS',
      exercises: [],
    });

    const weeklyPlan = {
      resolveWeeklyPlanForMember: async () => ({
        days: [
          {
            dayId: 'tue',
            restDay: false,
            title: 'Upper body strength',
            exercises: [
              {
                id: 'e1-tue-0',
                name: 'Bench press',
                sets: 4,
                reps: '8',
                restSec: 120,
              },
            ],
          },
        ],
      }),
    };
    const weeklyService = new WorkoutSessionService(mockPrisma, weeklyPlan as any);

    await weeklyService.startSession(
      memberA,
      { dayOfWeek: 'tue', dayTitle: 'Upper body strength' },
      'gym-a',
    );

    expect(exerciseCreates).toHaveLength(1);
    expect(exerciseCreates[0]!.data.exerciseId).toBeNull();
  });
});

