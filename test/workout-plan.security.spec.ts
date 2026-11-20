import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { WorkoutPlanService } from '../src/fitness/workout-plan.service.js';
import { Role, type AuthUserPayload } from '../src/auth/auth.types.js';

describe('WorkoutPlanService Security & Tenant Isolation', () => {
  const gymAUserTrainer: AuthUserPayload = {
    id: 'trainer-a-id',
    email: 'trainer-a@gym.test',
    name: 'Trainer A',
    roles: [{ gymId: 'gym-a-id', gymSlug: 'gym-a', gymName: 'Gym A', role: Role.TRAINER }],
  };

  const gymBUserTrainer: AuthUserPayload = {
    id: 'trainer-b-id',
    email: 'trainer-b@gym.test',
    name: 'Trainer B',
    roles: [{ gymId: 'gym-b-id', gymSlug: 'gym-b', gymName: 'Gym B', role: Role.TRAINER }],
  };

  const gymAMember: AuthUserPayload = {
    id: 'member-a-id',
    email: 'member-a@gym.test',
    name: 'Member A',
    roles: [{ gymId: 'gym-a-id', gymSlug: 'gym-a', gymName: 'Gym A', role: Role.MEMBER }],
  };

  const mockPrisma = {
    workoutPlan: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    exercise: {
      findMany: vi.fn(),
    },
    userTenantRole: {
      findFirst: vi.fn(),
    },
    userBranchAccess: {
      count: vi.fn().mockResolvedValue(0),
    },
    workoutPlanAssignment: {
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn(mockPrisma)),
  } as any;

  const service = new WorkoutPlanService(mockPrisma);

  it('rejects workout plan modification if trainer belongs to another gym', async () => {
    mockPrisma.workoutPlan.findUnique.mockResolvedValue({
      id: 'plan-1',
      gymId: 'gym-a-id',
      createdById: 'trainer-a-id',
    });

    await expect(
      service.updateWorkoutPlan(gymBUserTrainer, 'plan-1', { name: 'Hacked' }, 'gym-b'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects member attempting to create a workout plan', async () => {
    await expect(
      service.createWorkoutPlan(gymAMember, { name: 'Member Plan' }, 'gym-a'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects adding an exercise from another gym to a workout plan', async () => {
    mockPrisma.exercise.findMany.mockResolvedValue([
      { id: 'ex-b-id', name: 'Secret Drill B', gymId: 'gym-b-id' },
    ]);

    await expect(
      service.createWorkoutPlan(
        gymAUserTrainer,
        {
          name: 'Gym A Plan',
          days: [
            {
              dayOfWeek: 'mon',
              exercises: [{ exerciseId: 'ex-b-id', sets: 3, targetReps: '10' }],
            },
          ],
        },
        'gym-a',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects publishing a workout plan with zero scheduled exercises', async () => {
    mockPrisma.workoutPlan.findUnique.mockResolvedValue({
      id: 'plan-empty',
      gymId: 'gym-a-id',
      days: [{ isRestDay: true, exercises: [] }],
    });

    await expect(
      service.publishWorkoutPlan(gymAUserTrainer, 'plan-empty', 'gym-a'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects cross-tenant plan assignment', async () => {
    mockPrisma.workoutPlan.findUnique.mockResolvedValue({
      id: 'plan-1',
      gymId: 'gym-a-id',
      status: 'PUBLISHED',
    });

    await expect(
      service.createAssignment(
        gymBUserTrainer,
        {
          planId: 'plan-1',
          memberUserId: 'member-a-id',
          startDate: new Date().toISOString(),
        },
        'gym-b',
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});

