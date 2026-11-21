import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { WorkoutSessionService } from '../src/fitness/workout-session.service.js';
import { Role, type AuthUserPayload } from '../src/auth/auth.types.js';

describe('WorkoutHistory & PersonalRecords Security & Isolation', () => {
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

  const trainerB: AuthUserPayload = {
    id: 'trainer-b-id',
    email: 'trainer-b@gym.test',
    name: 'Trainer B',
    roles: [{ gymId: 'gym-b-id', gymSlug: 'gym-b', gymName: 'Gym B', role: Role.TRAINER }],
  };

  const mockPrisma = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $transaction: vi.fn().mockImplementation((cb) => cb(mockPrisma)),
    workoutSession: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    workoutPlanAssignment: {
      findMany: vi.fn(),
    },
    memberTrainerAssignment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    userBranchAccess: {
      findMany: vi.fn(),
    },
    userTenantRole: {
      findFirst: vi.fn(),
    },
    workoutPersonalRecord: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    workoutSetLog: {
      upsert: vi.fn(),
    },
  };

  let service: WorkoutSessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.memberTrainerAssignment.findFirst.mockResolvedValue({ id: 'assignment-a' });
    mockPrisma.userBranchAccess.findMany.mockResolvedValue([]);
    service = new WorkoutSessionService(mockPrisma as any, {
      resolveWeeklyPlanForMember: async () => ({ days: [] }),
    } as any);
  });

  describe('completedHistory', () => {
    it('allows Member to view their own completed history', async () => {
      mockPrisma.workoutSession.count.mockResolvedValue(1);
      mockPrisma.workoutSession.findMany.mockResolvedValue([
        { id: 'session-1', gymId: 'gym-a-id', memberUserId: memberA.id, status: 'COMPLETED' },
      ]);

      const history = await service.completedHistory(memberA, { gymSlug: 'gym-a' });
      expect(history.total).toBe(1);
      expect(history.rows).toHaveLength(1);
      expect(mockPrisma.workoutSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            gymId: 'gym-a-id',
            memberUserId: memberA.id,
            status: 'COMPLETED',
          }),
        }),
      );
    });

    it('rejects Member attempting to view another member history if memberUserId supplied', async () => {
      // In completedHistory, member role always overrides targetMemberId to user.id, but if user is unauthorized it throws
      mockPrisma.workoutSession.count.mockResolvedValue(1);
      mockPrisma.workoutSession.findMany.mockResolvedValue([]);
      const res = await service.completedHistory(memberA, { gymSlug: 'gym-a', memberUserId: 'other-user-id' });
      // When a member queries, service forces targetMemberId = memberA.id
      expect(mockPrisma.workoutSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            memberUserId: memberA.id,
          }),
        }),
      );
    });

    it('allows Trainer in same gym to view client history', async () => {
      mockPrisma.userTenantRole.findFirst.mockResolvedValue({
        gymId: 'gym-a-id',
        userId: memberA.id,
        role: Role.MEMBER,
      });
      mockPrisma.workoutSession.count.mockResolvedValue(0);
      mockPrisma.workoutSession.findMany.mockResolvedValue([]);

      const result = await service.completedHistory(trainerA, { gymSlug: 'gym-a', memberUserId: memberA.id });
      expect(result.total).toBe(0);
      expect(mockPrisma.workoutSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            gymId: 'gym-a-id',
            memberUserId: memberA.id,
            status: 'COMPLETED',
          }),
        }),
      );
    });

    it('prevents Trainer from accessing a different gym slug', async () => {
      await expect(
        service.completedHistory(trainerA, { gymSlug: 'gym-b', memberUserId: memberB.id }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('completedHistoryDetail', () => {
    it('allows Member to view their own session detail', async () => {
      mockPrisma.workoutSession.findFirst.mockResolvedValue({
        id: 'session-1',
        gymId: 'gym-a-id',
        memberUserId: memberA.id,
        status: 'COMPLETED',
      });

      const detail = await service.completedHistoryDetail(memberA, 'session-1', 'gym-a');
      expect(detail.id).toBe('session-1');
    });

    it('rejects cross-gym Member viewing detail (tenant isolation)', async () => {
      await expect(
        service.completedHistoryDetail(memberB, 'session-1', 'gym-a'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects another Member in same gym viewing session detail', async () => {
      const memberA2: AuthUserPayload = {
        id: 'member-a2-id',
        email: 'member-a2@gym.test',
        name: 'Member A2',
        roles: [{ gymId: 'gym-a-id', gymSlug: 'gym-a', gymName: 'Gym A', role: Role.MEMBER }],
      };

      mockPrisma.workoutSession.findFirst.mockResolvedValue({
        id: 'session-1',
        gymId: 'gym-a-id',
        memberUserId: memberA.id,
        status: 'COMPLETED',
      });

      await expect(
        service.completedHistoryDetail(memberA2, 'session-1', 'gym-a'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('personalRecords', () => {
    it('returns PRs for Member filtering by their own user ID', async () => {
      mockPrisma.workoutPersonalRecord.findMany.mockResolvedValue([
        { id: 'pr-1', gymId: 'gym-a-id', memberUserId: memberA.id, recordType: 'heaviest_weight', value: 100 },
      ]);

      const records = await service.personalRecords(memberA, undefined, undefined, 'gym-a');
      expect(records).toHaveLength(1);
      expect(mockPrisma.workoutPersonalRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            gymId: 'gym-a-id',
            memberUserId: memberA.id,
          }),
        }),
      );
    });

    it('allows Trainer to view client PRs within same gym', async () => {
      mockPrisma.workoutPersonalRecord.findMany.mockResolvedValue([]);
      await service.personalRecords(trainerA, undefined, memberA.id, 'gym-a');
      expect(mockPrisma.workoutPersonalRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            gymId: 'gym-a-id',
            memberUserId: memberA.id,
          }),
        }),
      );
    });

    it('prevents Trainer from querying cross-gym PRs', async () => {
      await expect(
        service.personalRecords(trainerA, undefined, memberB.id, 'gym-b'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects unassigned Trainer reading member PRs', async () => {
      mockPrisma.memberTrainerAssignment.findFirst.mockResolvedValue(null);
      await expect(
        service.personalRecords(trainerA, undefined, memberA.id, 'gym-a'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('finishSession atomic race & PR generation', () => {
    it('locks row with FOR UPDATE and completes session once', async () => {
      mockPrisma.workoutSession.findUnique.mockResolvedValue({
        id: 'session-1',
        gymId: 'gym-a-id',
        memberUserId: memberA.id,
        status: 'IN_PROGRESS',
        accumulatedPausedSeconds: 0,
        exercises: [
          {
            exerciseId: 'ex-1',
            exercise: { id: 'ex-1', name: 'Squat' },
            sets: [
              {
                id: 'set-1',
                setNumber: 1,
                isCompleted: true,
                actualWeightKg: 120,
                actualReps: 5,
              },
            ],
          },
        ],
      });

      mockPrisma.workoutPersonalRecord.findFirst.mockResolvedValue(null);
      mockPrisma.workoutSession.update.mockResolvedValue({
        id: 'session-1',
        status: 'COMPLETED',
      });

      const res = await service.finishSession(memberA, 'session-1', {}, 'gym-a');
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
      expect(res.status).toBe('COMPLETED');
      expect(mockPrisma.workoutPersonalRecord.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ recordType: 'heaviest_weight', weightKg: 120 }),
          skipDuplicates: true,
        }),
      );
      expect(mockPrisma.workoutPersonalRecord.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ recordType: 'max_reps_at_weight', repetitions: 5 }),
          skipDuplicates: true,
        }),
      );
    });

    it('rejects finishSession if session is already completed', async () => {
      mockPrisma.workoutSession.findUnique.mockResolvedValue({
        id: 'session-1',
        gymId: 'gym-a-id',
        memberUserId: memberA.id,
        status: 'COMPLETED',
      });

      await expect(
        service.finishSession(memberA, 'session-1', {}, 'gym-a'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
