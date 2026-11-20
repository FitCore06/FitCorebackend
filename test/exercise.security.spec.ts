import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Role, type AuthUserPayload } from '../src/auth/auth.types.js';
import { ExerciseService } from '../src/fitness/exercise.service.js';

const ownerA: AuthUserPayload = {
  id: 'owner-a',
  email: 'owner@gym-a.test',
  roles: [{ role: Role.GYM_ADMIN, gymId: 'gym-a-id', gymSlug: 'gym-a', gymName: 'Gym A' }],
};

const trainerA: AuthUserPayload = {
  id: 'trainer-a',
  email: 'trainer@gym-a.test',
  roles: [{ role: Role.TRAINER, gymId: 'gym-a-id', gymSlug: 'gym-a', gymName: 'Gym A' }],
};

const memberA: AuthUserPayload = {
  id: 'member-a',
  email: 'member@gym-a.test',
  roles: [{ role: Role.MEMBER, gymId: 'gym-a-id', gymSlug: 'gym-a', gymName: 'Gym A' }],
};

const memberB: AuthUserPayload = {
  id: 'member-b',
  email: 'member@gym-b.test',
  roles: [{ role: Role.MEMBER, gymId: 'gym-b-id', gymSlug: 'gym-b', gymName: 'Gym B' }],
};

const ownerB: AuthUserPayload = {
  id: 'owner-b',
  email: 'owner@gym-b.test',
  roles: [{ role: Role.GYM_ADMIN, gymId: 'gym-b-id', gymSlug: 'gym-b', gymName: 'Gym B' }],
};

describe('ExerciseService Strict Tenant Isolation & Security Rules', () => {
  let prismaMock: any;
  let service: ExerciseService;

  beforeEach(() => {
    prismaMock = {
      exercise: {
        count: vi.fn().mockResolvedValue(100),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      tenant: {
        findUnique: vi.fn().mockImplementation(({ where }) => {
          if (where.slug === 'gym-a') return Promise.resolve({ id: 'gym-a-id', slug: 'gym-a' });
          if (where.slug === 'gym-b') return Promise.resolve({ id: 'gym-b-id', slug: 'gym-b' });
          return Promise.resolve(null);
        }),
      },
    };
    service = new ExerciseService(prismaMock as any);
  });

  it('lists global exercises along with ONLY the authenticated gym custom exercises', async () => {
    prismaMock.exercise.findMany.mockResolvedValue([
      {
        id: 'global-1',
        gymId: null,
        name: 'Barbell Bench Press',
        slug: 'barbell-bench-press',
        description: null,
        category: 'strength',
        primaryMuscle: 'chest',
        secondaryMuscles: ['triceps'],
        equipment: 'barbell',
        instructions: ['Press'],
        mediaMimeType: null,
        mediaBase64: null,
        isCustom: false,
        createdById: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'custom-1',
        gymId: 'gym-a-id',
        name: 'Gym A Special Squat',
        slug: 'gym-a-special-squat',
        description: null,
        category: 'strength',
        primaryMuscle: 'quadriceps',
        secondaryMuscles: [],
        equipment: 'barbell',
        instructions: ['Squat'],
        mediaMimeType: null,
        mediaBase64: null,
        isCustom: true,
        createdById: 'owner-a',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const res = await service.listExercises(memberA, {});
    expect(res).toHaveLength(2);
    // Verified: targetGymId must be gym-a-id from authenticated member context
    expect(prismaMock.exercise.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ gymId: null }, { gymId: 'gym-a-id' }],
        }),
      }),
    );
  });

  it('strictly rejects when client attempts to pass a foreign gymSlug parameter to access other custom exercises', async () => {
    // Member A attempts to supply gymSlug="gym-b" to read Gym B's custom exercises
    await expect(
      service.listExercises(memberA, { gymSlug: 'gym-b' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prismaMock.exercise.findMany).not.toHaveBeenCalled();
  });

  it('denies ordinary members from creating gym-custom exercises', async () => {
    await expect(
      service.createGymExercise(memberA, {
        name: 'Unauthorized Exercise',
        primaryMuscle: 'chest',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prismaMock.exercise.create).not.toHaveBeenCalled();
  });

  it('allows trainers to create gym custom exercises with strictly bound authenticated gym_id', async () => {
    prismaMock.exercise.findFirst.mockResolvedValue(null);
    prismaMock.exercise.create.mockResolvedValue({
      id: 'custom-created-1',
      gymId: 'gym-a-id',
      name: 'Plate Loaded Incline Press',
      slug: 'plate-loaded-incline-press',
      description: 'Custom machine',
      category: 'hypertrophy',
      primaryMuscle: 'chest',
      secondaryMuscles: ['triceps'],
      equipment: 'machine',
      instructions: ['Push'],
      mediaMimeType: null,
      mediaBase64: null,
      isCustom: true,
      createdById: 'trainer-a',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await service.createGymExercise(trainerA, {
      name: 'Plate Loaded Incline Press',
      category: 'hypertrophy',
      primaryMuscle: 'chest',
      secondaryMuscles: ['triceps'],
      equipment: 'machine',
      instructions: ['Push'],
    });

    expect(res.isCustom).toBe(true);
    expect(res.gymId).toBe('gym-a-id');
    expect(prismaMock.exercise.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gymId: 'gym-a-id',
          name: 'Plate Loaded Incline Press',
          isCustom: true,
          createdById: 'trainer-a',
        }),
      }),
    );
  });

  it('prevents modification or deletion of global standard library exercises', async () => {
    prismaMock.exercise.findUnique.mockResolvedValue({
      id: 'global-std-1',
      gymId: null,
      isCustom: false,
      name: 'Barbell Deadlift',
    });

    await expect(
      service.updateGymExercise(ownerA, 'global-std-1', {
        name: 'Hacked Deadlift',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.deleteGymExercise(ownerA, 'global-std-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prismaMock.exercise.update).not.toHaveBeenCalled();
    expect(prismaMock.exercise.delete).not.toHaveBeenCalled();
  });

  it('strictly rejects cross-tenant modification of another gym custom exercise', async () => {
    prismaMock.exercise.findUnique.mockResolvedValue({
      id: 'custom-gym-b-1',
      gymId: 'gym-b-id',
      isCustom: true,
      name: 'Gym B Private Press',
    });

    // Owner A attempts to modify Gym B's custom exercise
    await expect(
      service.updateGymExercise(ownerA, 'custom-gym-b-1', {
        name: 'Hijacked by Gym A',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Owner A attempts to delete Gym B's custom exercise
    await expect(
      service.deleteGymExercise(ownerA, 'custom-gym-b-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prismaMock.exercise.update).not.toHaveBeenCalled();
    expect(prismaMock.exercise.delete).not.toHaveBeenCalled();
  });

  it('enforces idempotency on ensureGlobalExercisesSeeded', async () => {
    // When count matches or exceeds, no database queries are created
    prismaMock.exercise.count.mockResolvedValue(40);
    await service.ensureGlobalExercisesSeeded();
    expect(prismaMock.exercise.create).not.toHaveBeenCalled();

    // Run a second time
    await service.ensureGlobalExercisesSeeded();
    expect(prismaMock.exercise.create).not.toHaveBeenCalled();
  });
});
