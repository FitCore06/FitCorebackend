import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Role, type AuthUserPayload } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MemberWeeklyPlanService } from './member-weekly-plan.service.js';
import {
  CancelWorkoutSessionDto,
  CompleteWorkoutSessionSetDto,
  FinishWorkoutSessionDto,
  StartWorkoutSessionDto,
  UpdateWorkoutSessionSetDto,
} from './dto/workout-session.dto.js';

@Injectable()
export class WorkoutSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberWeeklyPlan: MemberWeeklyPlanService,
  ) {}

  private static readonly PLAN_EXERCISE_ID_NOTE = /^__planExerciseId=([^\s]+)/;

  /** Weekly JSON plans use synthetic ids (e.g. e1-tue-0); only persist real Exercise UUIDs. */
  private snapshotExerciseId(raw: string | undefined | null): string | null {
    const id = raw?.trim();
    if (!id) return null;
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      )
    ) {
      return id;
    }
    return null;
  }

  private async resolveSessionLogDayId(
    planDayId: string | null | undefined,
  ): Promise<string> {
    if (planDayId && /^(sun|mon|tue|wed|thu|fri|sat)$/i.test(planDayId)) {
      return planDayId.toLowerCase();
    }
    if (planDayId) {
      const planDay = await this.prisma.workoutPlanDay.findUnique({
        where: { id: planDayId },
        select: { dayOfWeek: true },
      });
      if (planDay?.dayOfWeek) return planDay.dayOfWeek.toLowerCase();
    }
    const weekdayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][
      new Date().getDay()
    ];
    return weekdayKey;
  }

  private async resolveQuickLogExerciseId(
    gymId: string,
    user: AuthUserPayload,
    dayId: string,
    sessionExercise: {
      exerciseNameSnapshot: string;
      sortOrder: number;
      exerciseId?: string | null;
      notes?: string | null;
    },
  ): Promise<string | null> {
    const fromNotes = sessionExercise.notes
      ?.trim()
      .match(WorkoutSessionService.PLAN_EXERCISE_ID_NOTE)?.[1];
    if (fromNotes) return fromNotes;

    const weekly = await this.memberWeeklyPlan.resolveWeeklyPlanForMember(
      gymId,
      user.id,
      user.email,
    );
    const day = weekly.days?.find(
      (d: { dayId?: string }) => d.dayId?.toLowerCase() === dayId.toLowerCase(),
    );
    const exercises =
      day && !(day as { restDay?: boolean }).restDay && Array.isArray(day.exercises)
        ? (day.exercises as { id?: string; name?: string }[])
        : [];
    const byOrder = exercises[sessionExercise.sortOrder];
    if (
      byOrder?.id &&
      byOrder.name?.trim().toLowerCase() ===
        sessionExercise.exerciseNameSnapshot.trim().toLowerCase()
    ) {
      return byOrder.id;
    }
    const byName = exercises.find(
      (e) =>
        e.name?.trim().toLowerCase() ===
        sessionExercise.exerciseNameSnapshot.trim().toLowerCase(),
    );
    if (byName?.id) return byName.id;
    return sessionExercise.exerciseId ?? null;
  }

  /** New session same day: carry over today's Quick log ticks into live session sets. */
  private async hydrateSessionSetsFromTodayQuickLog(
    tx: Pick<
      PrismaService,
      'workoutSession' | 'workoutSessionExercise' | 'workoutSessionSet' | 'workoutSetLog'
    >,
    input: {
      gymId: string;
      user: AuthUserPayload;
      sessionId: string;
      planDayId: string | null | undefined;
      dtoDayOfWeek?: string;
    },
  ): Promise<void> {
    const dayId = await this.resolveSessionLogDayId(
      input.planDayId ?? input.dtoDayOfWeek ?? null,
    );
    const dateStr = new Date().toISOString().slice(0, 10);
    const logs = await tx.workoutSetLog.findMany({
      where: {
        gymId: input.gymId,
        memberUserId: input.user.id,
        logDate: dateStr,
        dayId,
      },
    });
    if (!logs.length) return;

    const exercises = await tx.workoutSessionExercise.findMany({
      where: { sessionId: input.sessionId },
      include: { sets: { orderBy: { setNumber: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });

    const now = new Date();
    for (const ex of exercises) {
      const logExerciseId = await this.resolveQuickLogExerciseId(
        input.gymId,
        input.user,
        dayId,
        ex,
      );
      if (!logExerciseId) continue;
      for (const log of logs) {
        if (log.exerciseId !== logExerciseId) continue;
        const setRow = ex.sets.find((s) => s.setNumber === log.setNumber);
        if (!setRow || setRow.isCompleted) continue;
        const parsedReps = parseInt(String(setRow.targetReps), 10);
        await tx.workoutSessionSet.update({
          where: { id: setRow.id },
          data: {
            isCompleted: true,
            completedAt: now,
            actualWeightKg: log.weightKg ?? setRow.actualWeightKg,
            actualReps:
              setRow.actualReps ??
              (Number.isFinite(parsedReps) && parsedReps > 0 ? parsedReps : 10),
          },
        });
      }
    }
  }

  private async upsertQuickLogForCompletedSet(
    db: Pick<PrismaService, 'workoutSetLog'>,
    input: {
      gymId: string;
      user: AuthUserPayload;
      planDayId: string | null;
      sessionExercise: {
        exerciseNameSnapshot: string;
        sortOrder: number;
        exerciseId?: string | null;
        notes?: string | null;
      };
      setNumber: number;
      actualWeightKg?: number | null;
      targetWeightKg?: number | null;
      logDate?: string;
    },
  ): Promise<void> {
    const dayId = await this.resolveSessionLogDayId(input.planDayId);
    const logExerciseId = await this.resolveQuickLogExerciseId(
      input.gymId,
      input.user,
      dayId,
      input.sessionExercise,
    );
    if (!logExerciseId) return;

    const dateStr =
      input.logDate?.trim() || new Date().toISOString().slice(0, 10);
    const weightKg =
      input.actualWeightKg ?? input.targetWeightKg ?? null;
    await db.workoutSetLog.upsert({
      where: {
        memberUserId_logDate_dayId_exerciseId_setNumber: {
          memberUserId: input.user.id,
          logDate: dateStr,
          dayId,
          exerciseId: logExerciseId,
          setNumber: input.setNumber,
        },
      },
      create: {
        gymId: input.gymId,
        memberUserId: input.user.id,
        logDate: dateStr,
        dayId,
        exerciseId: logExerciseId,
        setNumber: input.setNumber,
        weightKg,
      },
      update: { weightKg },
    });
  }

  private async trainerReadScope(
    trainerUserId: string,
    gymId: string,
    memberUserId: string,
  ): Promise<string[] | null> {
    const assignment = await this.prisma.memberTrainerAssignment.findFirst({
      where: { gymId, trainerUserId, memberUserId, active: true },
      select: { id: true },
    });
    if (!assignment) {
      throw new ForbiddenException('Trainer is not assigned to this member');
    }
    const grants = await this.prisma.userBranchAccess.findMany({
      where: { userId: trainerUserId, branch: { gymId } },
      select: { branchId: true },
    });
    return grants.length ? grants.map((grant) => grant.branchId) : null;
  }

  private async createPersonalRecords(tx: any, session: any, achievedAt: Date) {
    for (const exercise of session.exercises) {
      if (exercise.equipmentSnapshot === 'bodyweight') continue;
      for (const set of exercise.sets) {
        if (!set.isCompleted || !set.actualWeightKg || set.actualWeightKg <= 0) continue;
        const base = {
          gymId: session.gymId,
          memberUserId: session.memberUserId,
          exerciseId: exercise.exerciseId,
          exerciseNameSnapshot: exercise.exerciseNameSnapshot,
          weightKg: set.actualWeightKg,
          repetitions: set.actualReps ?? null,
          achievedAt,
          sessionId: session.id,
          sessionSetId: set.id,
        };
        const heaviest = await tx.workoutPersonalRecord.findFirst({
          where: { gymId: session.gymId, memberUserId: session.memberUserId, exerciseId: exercise.exerciseId, recordType: 'heaviest_weight' },
          orderBy: { weightKg: 'desc' }, select: { weightKg: true },
        });
        if (!heaviest || set.actualWeightKg > (heaviest.weightKg ?? 0)) {
          await tx.workoutPersonalRecord.createMany({ data: { ...base, recordType: 'heaviest_weight' }, skipDuplicates: true });
        }
        if ((set.actualReps ?? 0) > 0) {
          const maxReps = await tx.workoutPersonalRecord.findFirst({
            where: { gymId: session.gymId, memberUserId: session.memberUserId, exerciseId: exercise.exerciseId, recordType: 'max_reps_at_weight', weightKg: set.actualWeightKg },
            orderBy: { repetitions: 'desc' }, select: { repetitions: true },
          });
          if (!maxReps || (set.actualReps ?? 0) > (maxReps.repetitions ?? 0)) {
            await tx.workoutPersonalRecord.createMany({ data: { ...base, recordType: 'max_reps_at_weight' }, skipDuplicates: true });
          }
        }
      }
    }
  }

  private resolveGym(user: AuthUserPayload, gymSlug?: string) {
    const targetSlug = gymSlug?.trim().toLowerCase() || user.roles[0]?.gymSlug?.toLowerCase();
    if (!targetSlug) {
      throw new BadRequestException('No gym context available');
    }
    const roleEntry = user.roles.find((r) => r.gymSlug.toLowerCase() === targetSlug);
    if (!roleEntry) {
      throw new ForbiddenException(
        `Tenant boundary violation: you do not hold an active role in gym '${targetSlug}'`,
      );
    }
    return { gymId: roleEntry.gymId, gymSlug: targetSlug, role: roleEntry.role };
  }

  async completedHistory(user: AuthUserPayload, query: { page?: string; limit?: string; from?: string; to?: string; exerciseId?: string; memberUserId?: string; gymSlug?: string }) {
    const { gymId, role } = this.resolveGym(user, query.gymSlug);
    let targetMemberId = user.id;

    if (role === Role.TRAINER || role === Role.GYM_ADMIN) {
      if (query.memberUserId) {
        // Validate member belongs to this gym
        const memberCheck = await this.prisma.userTenantRole.findFirst({
          where: { gymId, userId: query.memberUserId, role: Role.MEMBER },
        });
        if (!memberCheck) throw new NotFoundException('Member not found in this gym');
        targetMemberId = query.memberUserId;
        if (role === Role.TRAINER) {
          const branchIds = await this.trainerReadScope(user.id, gymId, targetMemberId);
          if (branchIds) query = { ...query, _branchIds: branchIds } as typeof query;
        }
      } else {
        // If trainer doesn't specify memberUserId, list all sessions for members assigned to them
        const whereTrainer: any = { gymId, status: 'COMPLETED' };
        if (role === Role.TRAINER) {
          const clientAssignments = await this.prisma.memberTrainerAssignment.findMany({
            where: { gymId, trainerUserId: user.id, active: true },
            select: { memberUserId: true },
          });
          const clientIds = clientAssignments.map((c) => c.memberUserId);
          whereTrainer.memberUserId = { in: clientIds };
        }
        const page = Math.max(1, Number(query.page) || 1);
        const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
        const [total, rows] = await Promise.all([
          this.prisma.workoutSession.count({ where: whereTrainer }),
          this.prisma.workoutSession.findMany({
            where: whereTrainer,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { completedAt: 'desc' },
            include: {
              member: { select: { id: true, name: true, email: true } },
              exercises: {
                include: { sets: { where: { isCompleted: true }, orderBy: { setNumber: 'asc' } } },
                orderBy: { sortOrder: 'asc' },
              },
            },
          }),
        ]);
        return { page, limit, total, rows };
      }
    } else if (role !== Role.MEMBER) {
      throw new ForbiddenException('Unauthorized access');
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
    const completedAt: any = {};
    if (query.from) completedAt.gte = new Date(query.from);
    if (query.to) completedAt.lte = new Date(query.to);
    const branchIds = (query as typeof query & { _branchIds?: string[] })._branchIds;
    const where: any = { gymId, memberUserId: targetMemberId, status: 'COMPLETED', ...(branchIds ? { branchId: { in: branchIds } } : {}), ...(Object.keys(completedAt).length ? { completedAt } : {}) };
    if (query.exerciseId) where.exercises = { some: { exerciseId: query.exerciseId } };
    const [total, rows] = await Promise.all([
      this.prisma.workoutSession.count({ where }),
      this.prisma.workoutSession.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { completedAt: 'desc' },
        include: {
          member: { select: { id: true, name: true, email: true } },
          exercises: {
            include: { sets: { where: { isCompleted: true }, orderBy: { setNumber: 'asc' } } },
            orderBy: { sortOrder: 'asc' },
          },
        },
      }),
    ]);
    return { page, limit, total, rows };
  }

  async completedHistoryDetail(user: AuthUserPayload, sessionId: string, gymSlug?: string) {
    const { gymId, role } = this.resolveGym(user, gymSlug);
    const row = await this.prisma.workoutSession.findFirst({
      where: { id: sessionId, gymId, status: 'COMPLETED' },
      include: {
        member: { select: { id: true, name: true, email: true } },
        exercises: {
          include: { sets: { orderBy: { setNumber: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!row) throw new NotFoundException('Completed workout session not found');

    if (role === Role.MEMBER && row.memberUserId !== user.id) {
      throw new ForbiddenException('Members can only view their own workout sessions');
    }
    if (role === Role.TRAINER) {
      const branchIds = await this.trainerReadScope(user.id, gymId, row.memberUserId);
      if (branchIds && (!row.branchId || !branchIds.includes(row.branchId))) {
        throw new ForbiddenException('Trainer has no access to this branch');
      }
    }

    return row;
  }

  async personalRecords(user: AuthUserPayload, exerciseId?: string, memberUserId?: string, gymSlug?: string) {
    const { gymId, role } = this.resolveGym(user, gymSlug);
    let targetMemberId = user.id;

    if (role === Role.TRAINER || role === Role.GYM_ADMIN) {
      if (!memberUserId) {
        // Return gym's recent PRs
        return this.prisma.workoutPersonalRecord.findMany({
          where: { gymId, ...(exerciseId ? { exerciseId } : {}) },
          orderBy: { achievedAt: 'desc' },
          take: 50,
          include: { member: { select: { id: true, name: true, email: true } } },
        });
      }
      targetMemberId = memberUserId;
      if (role === Role.TRAINER) {
        const branchIds = await this.trainerReadScope(user.id, gymId, targetMemberId);
        return this.prisma.workoutPersonalRecord.findMany({
          where: { gymId, memberUserId: targetMemberId, ...(exerciseId ? { exerciseId } : {}), ...(branchIds ? { session: { branchId: { in: branchIds } } } : {}) },
          orderBy: { achievedAt: 'desc' },
          include: { member: { select: { id: true, name: true, email: true } } },
        });
      }
    } else if (role !== Role.MEMBER) {
      throw new ForbiddenException('Members, Trainers and Admins only');
    }

    return this.prisma.workoutPersonalRecord.findMany({
      where: { gymId, memberUserId: targetMemberId, ...(exerciseId ? { exerciseId } : {}) },
      orderBy: { achievedAt: 'desc' },
      include: { member: { select: { id: true, name: true, email: true } } },
    });
  }

  async activityCalendar(
    user: AuthUserPayload,
    from?: string,
    to?: string,
  ): Promise<
    { date: string; minutes: number; volumeKg: number; setCount: number }[]
  > {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Members only');
    const toDate = to?.trim() || new Date().toISOString().slice(0, 10);
    const fallback = new Date();
    fallback.setDate(fallback.getDate() - 364);
    const fromDate =
      from?.trim() ||
      `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, '0')}-${String(fallback.getDate()).padStart(2, '0')}`;

    const completedAt: Prisma.DateTimeFilter = {
      gte: new Date(`${fromDate}T00:00:00.000Z`),
      lte: new Date(`${toDate}T23:59:59.999Z`),
    };

    const [sessions, logGroups] = await Promise.all([
      this.prisma.workoutSession.findMany({
        where: {
          gymId: memberRole.gymId,
          memberUserId: user.id,
          status: 'COMPLETED',
          completedAt,
        },
        include: {
          exercises: {
            include: { sets: { where: { isCompleted: true } } },
          },
        },
      }),
      this.prisma.workoutSetLog.groupBy({
        by: ['logDate'],
        where: {
          memberUserId: user.id,
          gymId: memberRole.gymId,
          logDate: { gte: fromDate, lte: toDate },
        },
        _count: { _all: true },
      }),
    ]);

    const byDate = new Map<
      string,
      { minutes: number; volumeKg: number; setCount: number }
    >();

    for (const s of sessions) {
      if (!s.completedAt) continue;
      const date = s.completedAt.toISOString().slice(0, 10);
      const ms =
        s.completedAt.getTime() -
        s.startedAt.getTime() -
        s.accumulatedPausedSeconds * 1000;
      const minutes = Math.max(1, Math.round(ms / 60_000));
      let volumeKg = 0;
      let setCount = 0;
      for (const ex of s.exercises) {
        for (const set of ex.sets) {
          setCount += 1;
          const w = set.actualWeightKg ?? 0;
          const r = set.actualReps ?? 0;
          volumeKg += w * r;
        }
      }
      const prev = byDate.get(date) ?? { minutes: 0, volumeKg: 0, setCount: 0 };
      byDate.set(date, {
        minutes: prev.minutes + minutes,
        volumeKg: Math.round((prev.volumeKg + volumeKg) * 10) / 10,
        setCount: prev.setCount + setCount,
      });
    }

    for (const row of logGroups) {
      const prev = byDate.get(row.logDate) ?? {
        minutes: 0,
        volumeKg: 0,
        setCount: 0,
      };
      byDate.set(row.logDate, {
        ...prev,
        setCount: prev.setCount + row._count._all,
      });
    }

    return [...byDate.entries()]
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async exercisePerformance(user: AuthUserPayload, exerciseId: string, memberUserId?: string, gymSlug?: string) {
    const { gymId, role } = this.resolveGym(user, gymSlug);
    let targetMemberId = user.id;

    if (role === Role.TRAINER || role === Role.GYM_ADMIN) {
      if (memberUserId) {
        targetMemberId = memberUserId;
      }
      if (role === Role.TRAINER) {
        const branchIds = await this.trainerReadScope(user.id, gymId, targetMemberId);
        return this.prisma.workoutSessionSet.findMany({
          where: { isCompleted: true, sessionExercise: { exerciseId, session: { gymId, memberUserId: targetMemberId, status: 'COMPLETED', ...(branchIds ? { branchId: { in: branchIds } } : {}) } } },
          orderBy: { completedAt: 'desc' },
          include: { sessionExercise: { include: { session: { select: { id: true, completedAt: true, dayTitle: true } } } } },
        });
      }
    } else if (role !== Role.MEMBER) {
      throw new ForbiddenException('Members only');
    }

    return this.prisma.workoutSessionSet.findMany({
      where: { isCompleted: true, sessionExercise: { exerciseId, session: { gymId, memberUserId: targetMemberId, status: 'COMPLETED' } } },
      orderBy: { completedAt: 'desc' },
      include: { sessionExercise: { include: { session: { select: { id: true, completedAt: true, dayTitle: true } } } } },
    });
  }

  // --- 1. START SESSION ---
  async startSession(user: AuthUserPayload, dto: StartWorkoutSessionDto, gymSlug?: string) {
    const { gymId, role } = this.resolveGym(user, gymSlug);
    if (role !== Role.MEMBER) {
      throw new ForbiddenException('Only members can start active workout sessions');
    }

    // 1. Prevent duplicate concurrent active/paused sessions for this member in this gym
    const existingActive = await this.prisma.workoutSession.findFirst({
      where: {
        gymId,
        memberUserId: user.id,
        status: { in: ['IN_PROGRESS', 'PAUSED'] },
      },
      include: {
        exercises: {
          include: { sets: { orderBy: { setNumber: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (existingActive) {
      throw new ConflictException({
        message: 'You already have an active workout session in progress',
        sessionId: existingActive.id,
        status: existingActive.status,
      });
    }

    // 2. Identify active assignment & plan
    let assignment = await this.prisma.workoutPlanAssignment.findFirst({
      where: {
        gymId,
        memberUserId: user.id,
        status: 'ACTIVE',
      },
      include: {
        plan: {
          include: {
            days: {
              include: {
                exercises: {
                  include: { exercise: true },
                  orderBy: { sortOrder: 'asc' },
                },
              },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    });

    // 3. Determine which day to load
    let targetDay: any = null;
    if (assignment && assignment.plan) {
      if (dto.planDayId) {
        targetDay = assignment.plan.days.find((d) => d.id === dto.planDayId);
      } else if (dto.dayOfWeek) {
        const dow = dto.dayOfWeek.toLowerCase();
        targetDay = assignment.plan.days.find((d) => d.dayOfWeek === dow);
      } else {
        // Auto-detect current weekday
        const weekdayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];
        targetDay = assignment.plan.days.find((d) => d.dayOfWeek === weekdayKey);
        if (!targetDay || targetDay.isRestDay) {
          // Fallback to first non-rest day with exercises
          targetDay = assignment.plan.days.find((d) => !d.isRestDay && d.exercises.length > 0);
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const session = await tx.workoutSession.create({
        data: {
          gymId,
          memberUserId: user.id,
          assignmentId: assignment?.id,
          planId: assignment?.planId,
          planDayId: targetDay?.id,
          dayTitle: targetDay?.title ?? dto.dayTitle ?? 'Workout Session',
          status: 'IN_PROGRESS',
          startedAt: new Date(),
          accumulatedPausedSeconds: 0,
        },
      });

      let seeded = 0;
      // Populate snapshot exercises & initial sets from the assigned plan day
      if (targetDay && targetDay.exercises?.length) {
        for (let exIndex = 0; exIndex < targetDay.exercises.length; exIndex++) {
          const planEx = targetDay.exercises[exIndex];
          const sessionEx = await tx.workoutSessionExercise.create({
            data: {
              sessionId: session.id,
              exerciseId: planEx.exerciseId,
              exerciseNameSnapshot: planEx.exercise?.name ?? 'Exercise',
              categorySnapshot: planEx.exercise?.category ?? 'strength',
              primaryMuscleSnapshot: planEx.exercise?.primaryMuscle ?? 'other',
              equipmentSnapshot: planEx.exercise?.equipment ?? 'other',
              sortOrder: exIndex,
              targetSets: planEx.sets ?? 3,
              targetReps: planEx.targetReps ?? '10-12',
              targetWeightKg: planEx.targetWeightKg,
              restSeconds: planEx.restSeconds ?? 60,
              notes: planEx.notes,
            },
          });

          // Pre-create target sets
          const totalSets = planEx.sets ?? 3;
          for (let s = 1; s <= totalSets; s++) {
            await tx.workoutSessionSet.create({
              data: {
                sessionExerciseId: sessionEx.id,
                setNumber: s,
                targetReps: planEx.targetReps ?? '10-12',
                targetWeightKg: planEx.targetWeightKg,
                isCompleted: false,
              },
            });
          }
          seeded += 1;
        }
      }

      if (seeded === 0) {
        const weekly = await this.memberWeeklyPlan.resolveWeeklyPlanForMember(
          gymId,
          user.id,
          user.email,
        );
        const dow =
          dto.dayOfWeek?.toLowerCase() ??
          ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][
            new Date().getDay()
          ];
        const weekDay = weekly.days?.find(
          (d: { dayId?: string }) => d.dayId === dow,
        );
        const planExercises =
          weekDay && !weekDay.restDay && Array.isArray(weekDay.exercises)
            ? weekDay.exercises.filter(
                (e: { name?: string }) => (e.name ?? '').trim().length > 0,
              )
            : [];

        await tx.workoutSession.update({
          where: { id: session.id },
          data: {
            planDayId: dow,
            dayTitle:
              weekDay?.title ?? dto.dayTitle ?? session.dayTitle ?? 'Workout',
          },
        });

        for (let exIndex = 0; exIndex < planExercises.length; exIndex++) {
          const planEx = planExercises[exIndex] as {
            id: string;
            name: string;
            sets: number;
            reps: string;
            restSec?: number;
          };
          const sessionEx = await tx.workoutSessionExercise.create({
            data: {
              sessionId: session.id,
              exerciseId: this.snapshotExerciseId(planEx.id),
              exerciseNameSnapshot: planEx.name,
              categorySnapshot: 'strength',
              primaryMuscleSnapshot: 'other',
              equipmentSnapshot: 'other',
              sortOrder: exIndex,
              targetSets: Math.max(1, planEx.sets ?? 3),
              targetReps: String(planEx.reps ?? '10'),
              restSeconds: planEx.restSec ?? 90,
              notes: `__planExerciseId=${planEx.id}`,
            },
          });
          const totalSets = Math.max(1, planEx.sets ?? 3);
          for (let s = 1; s <= totalSets; s++) {
            await tx.workoutSessionSet.create({
              data: {
                sessionExerciseId: sessionEx.id,
                setNumber: s,
                targetReps: String(planEx.reps ?? '10'),
                isCompleted: false,
              },
            });
          }
        }
      }

      const current = await tx.workoutSession.findUnique({
        where: { id: session.id },
        select: { planDayId: true },
      });
      await this.hydrateSessionSetsFromTodayQuickLog(tx, {
        gymId,
        user,
        sessionId: session.id,
        planDayId: current?.planDayId,
        dtoDayOfWeek: dto.dayOfWeek,
      });

      return tx.workoutSession.findUnique({
        where: { id: session.id },
        include: {
          exercises: {
            include: { sets: { orderBy: { setNumber: 'asc' } } },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    });
  }

  // --- 2. GET ACTIVE SESSION (Recovery on App Reload) ---
  async getActiveSession(user: AuthUserPayload, gymSlug?: string) {
    const { gymId, role } = this.resolveGym(user, gymSlug);
    if (role !== Role.MEMBER) {
      throw new ForbiddenException('Only members have active personal workout sessions');
    }

    const session = await this.prisma.workoutSession.findFirst({
      where: {
        gymId,
        memberUserId: user.id,
        status: { in: ['IN_PROGRESS', 'PAUSED'] },
      },
      include: {
        exercises: {
          include: { sets: { orderBy: { setNumber: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!session) {
      return { activeSession: null };
    }

    await this.prisma.$transaction(async (tx) => {
      await this.hydrateSessionSetsFromTodayQuickLog(tx, {
        gymId,
        user,
        sessionId: session.id,
        planDayId: session.planDayId,
      });
    });

    const refreshed = await this.prisma.workoutSession.findFirst({
      where: { id: session.id },
      include: {
        exercises: {
          include: { sets: { orderBy: { setNumber: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return { activeSession: refreshed ?? session };
  }

  // --- 3. GET SESSION BY ID ---
  async getSession(user: AuthUserPayload, id: string, gymSlug?: string) {
    const { gymId, role } = this.resolveGym(user, gymSlug);
    const session = await this.prisma.workoutSession.findUnique({
      where: { id },
      include: {
        exercises: {
          include: { sets: { orderBy: { setNumber: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!session) throw new NotFoundException('Workout session not found');
    if (session.gymId !== gymId) throw new ForbiddenException('Access denied to other gym session');
    if (role === Role.MEMBER && session.memberUserId !== user.id) {
      throw new ForbiddenException('Members can only view their own workout sessions');
    }
    if (role === Role.TRAINER) {
      const assignment = await this.prisma.memberTrainerAssignment.findFirst({
        where: { gymId, memberUserId: session.memberUserId, trainerUserId: user.id, active: true },
      });
      if (!assignment) throw new ForbiddenException('Trainer is not assigned to this member');
      if (session.branchId) {
        const grants = await this.prisma.userBranchAccess.count({ where: { userId: user.id } });
        if (grants > 0) {
          const grant = await this.prisma.userBranchAccess.findFirst({ where: { userId: user.id, branchId: session.branchId } });
          if (!grant) throw new ForbiddenException('Trainer has no access to this branch');
        }
      }
    }

    return session;
  }

  // --- 4. PAUSE SESSION ---
  async pauseSession(user: AuthUserPayload, id: string, gymSlug?: string) {
    const { gymId } = this.resolveGym(user, gymSlug);
    const session = await this.prisma.workoutSession.findUnique({ where: { id } });

    if (!session) throw new NotFoundException('Session not found');
    if (session.gymId !== gymId || session.memberUserId !== user.id) {
      throw new ForbiddenException('Access denied to this session');
    }
    if (session.status !== 'IN_PROGRESS') {
      throw new BadRequestException(`Cannot pause session with status '${session.status}'`);
    }

    return this.prisma.workoutSession.update({
      where: { id },
      data: {
        status: 'PAUSED',
        pausedAt: new Date(),
      },
      include: {
        exercises: {
          include: { sets: { orderBy: { setNumber: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  // --- 5. RESUME SESSION ---
  async resumeSession(user: AuthUserPayload, id: string, gymSlug?: string) {
    const { gymId } = this.resolveGym(user, gymSlug);
    const session = await this.prisma.workoutSession.findUnique({ where: { id } });

    if (!session) throw new NotFoundException('Session not found');
    if (session.gymId !== gymId || session.memberUserId !== user.id) {
      throw new ForbiddenException('Access denied to this session');
    }
    if (session.status !== 'PAUSED') {
      throw new BadRequestException(`Cannot resume session with status '${session.status}'`);
    }

    const now = new Date();
    let additionalPausedSeconds = 0;
    if (session.pausedAt) {
      additionalPausedSeconds = Math.max(
        0,
        Math.floor((now.getTime() - session.pausedAt.getTime()) / 1000),
      );
    }

    return this.prisma.workoutSession.update({
      where: { id },
      data: {
        status: 'IN_PROGRESS',
        pausedAt: null,
        accumulatedPausedSeconds: session.accumulatedPausedSeconds + additionalPausedSeconds,
      },
      include: {
        exercises: {
          include: { sets: { orderBy: { setNumber: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  // --- 6. UPDATE SET LOG (Actual weight / reps without completion) ---
  async updateSet(
    user: AuthUserPayload,
    sessionId: string,
    setId: string,
    dto: UpdateWorkoutSessionSetDto,
    gymSlug?: string,
  ) {
    const { gymId } = this.resolveGym(user, gymSlug);
    const session = await this.prisma.workoutSession.findUnique({ where: { id: sessionId } });

    if (!session) throw new NotFoundException('Session not found');
    if (session.gymId !== gymId || session.memberUserId !== user.id) {
      throw new ForbiddenException('Access denied to this session');
    }
    if (session.status === 'COMPLETED' || session.status === 'CANCELLED') {
      throw new BadRequestException('Cannot modify sets of a completed or cancelled workout session');
    }

    const setRecord = await this.prisma.workoutSessionSet.findUnique({
      where: { id: setId },
      include: { sessionExercise: true },
    });
    if (!setRecord || setRecord.sessionExercise.sessionId !== sessionId) {
      throw new NotFoundException('Set not found in this session');
    }

    return this.prisma.workoutSessionSet.update({
      where: { id: setId },
      data: {
        actualReps: dto.actualReps !== undefined ? dto.actualReps : setRecord.actualReps,
        actualWeightKg:
          dto.actualWeightKg !== undefined ? dto.actualWeightKg : setRecord.actualWeightKg,
        notes: dto.notes !== undefined ? dto.notes : setRecord.notes,
      },
    });
  }

  // --- 7. COMPLETE SET (Record completion timestamp) ---
  async completeSet(
    user: AuthUserPayload,
    sessionId: string,
    setId: string,
    dto: CompleteWorkoutSessionSetDto,
    gymSlug?: string,
  ) {
    const { gymId } = this.resolveGym(user, gymSlug);
    const session = await this.prisma.workoutSession.findUnique({ where: { id: sessionId } });

    if (!session) throw new NotFoundException('Session not found');
    if (session.gymId !== gymId || session.memberUserId !== user.id) {
      throw new ForbiddenException('Access denied to this session');
    }
    if (session.status === 'COMPLETED' || session.status === 'CANCELLED') {
      throw new BadRequestException('Cannot complete sets of a finished or cancelled session');
    }

    const setRecord = await this.prisma.workoutSessionSet.findUnique({
      where: { id: setId },
      include: { sessionExercise: true },
    });
    if (!setRecord || setRecord.sessionExercise.sessionId !== sessionId) {
      throw new NotFoundException('Set not found in this session');
    }

    const updated = await this.prisma.workoutSessionSet.update({
      where: { id: setId },
      data: {
        actualReps: dto.actualReps ?? setRecord.actualReps ?? (parseInt(setRecord.targetReps) || 10),
        actualWeightKg: dto.actualWeightKg ?? setRecord.actualWeightKg ?? setRecord.targetWeightKg,
        notes: dto.notes ?? setRecord.notes,
        isCompleted: true,
        completedAt: new Date(),
      },
    });

    await this.upsertQuickLogForCompletedSet(this.prisma, {
      gymId,
      user,
      planDayId: session.planDayId,
      sessionExercise: setRecord.sessionExercise,
      setNumber: setRecord.setNumber,
      actualWeightKg: updated.actualWeightKg,
      targetWeightKg: setRecord.targetWeightKg,
    });

    return updated;
  }

  // --- 8. FINISH SESSION ---
  async finishSession(
    user: AuthUserPayload,
    id: string,
    dto: FinishWorkoutSessionDto,
    gymSlug?: string,
  ) {
    const { gymId } = this.resolveGym(user, gymSlug);

    return this.prisma.$transaction(async (tx) => {
      // Row-level lock to prevent concurrent finish race conditions
      await tx.$executeRaw`SELECT id FROM workout_sessions WHERE id = ${id} FOR UPDATE`;
      const session = await tx.workoutSession.findUnique({
        where: { id },
        include: {
          exercises: {
            include: { sets: true },
          },
        },
      });

      if (!session) throw new NotFoundException('Session not found');
      if (session.gymId !== gymId || session.memberUserId !== user.id) {
        throw new ForbiddenException('Access denied to this session');
      }
      if (session.status === 'COMPLETED') {
        throw new BadRequestException('Session is already completed');
      }
      if (session.status === 'CANCELLED') {
        throw new BadRequestException('Cannot finish a cancelled session');
      }

      const now = new Date();
      let additionalPaused = 0;
      if (session.status === 'PAUSED' && session.pausedAt) {
        additionalPaused = Math.max(0, Math.floor((now.getTime() - session.pausedAt.getTime()) / 1000));
      }

      for (const ex of session.exercises) {
        for (const s of ex.sets) {
          if (!s.isCompleted) continue;
          if (s.actualReps == null || s.actualReps <= 0) {
            const parsed = parseInt(String(s.targetReps), 10);
            const actualReps =
              Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
            await tx.workoutSessionSet.update({
              where: { id: s.id },
              data: { actualReps },
            });
            s.actualReps = actualReps;
          }
        }
      }

      const dateStr = now.toISOString().slice(0, 10);
      for (const ex of session.exercises) {
        for (const s of ex.sets) {
          if (!s.isCompleted) continue;
          await this.upsertQuickLogForCompletedSet(tx as Pick<PrismaService, 'workoutSetLog'>, {
            gymId,
            user,
            planDayId: session.planDayId,
            sessionExercise: ex,
            setNumber: s.setNumber,
            actualWeightKg: s.actualWeightKg,
            targetWeightKg: s.targetWeightKg,
            logDate: dateStr,
          });
        }
      }

      await this.createPersonalRecords(tx, session, now);

      return tx.workoutSession.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          pausedAt: null,
          accumulatedPausedSeconds: session.accumulatedPausedSeconds + additionalPaused,
        },
        include: {
          exercises: {
            include: { sets: { orderBy: { setNumber: 'asc' } } },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    });
  }

  // --- 9. CANCEL SESSION ---
  async cancelSession(
    user: AuthUserPayload,
    id: string,
    dto: CancelWorkoutSessionDto,
    gymSlug?: string,
  ) {
    const { gymId } = this.resolveGym(user, gymSlug);
    const session = await this.prisma.workoutSession.findUnique({ where: { id } });

    if (!session) throw new NotFoundException('Session not found');
    if (session.gymId !== gymId || session.memberUserId !== user.id) {
      throw new ForbiddenException('Access denied to this session');
    }
    if (session.status === 'COMPLETED') {
      throw new BadRequestException('Cannot cancel a completed workout session');
    }

    return this.prisma.workoutSession.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });
  }
}
