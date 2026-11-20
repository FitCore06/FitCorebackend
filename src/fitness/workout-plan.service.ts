import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Role, type AuthUserPayload } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateWorkoutPlanAssignmentDto,
  CreateWorkoutPlanDto,
  QueryWorkoutPlanAssignmentDto,
  QueryWorkoutPlanDto,
  UpdateWorkoutPlanAssignmentDto,
  UpdateWorkoutPlanDto,
} from './dto/workout-plan.dto.js';

@Injectable()
export class WorkoutPlanService {
  constructor(private readonly prisma: PrismaService) {}

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

  // Check branch access if user is restricted
  private async validateBranchAccess(user: AuthUserPayload, gymId: string, branchId?: string | null) {
    if (!branchId) return;
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch || branch.gymId !== gymId) {
      throw new BadRequestException('Invalid branch for this gym');
    }
    // Check if user has explicit branch access grants
    const grantsCount = await this.prisma.userBranchAccess.count({
      where: { userId: user.id },
    });
    if (grantsCount > 0) {
      const grant = await this.prisma.userBranchAccess.findUnique({
        where: { userId_branchId: { userId: user.id, branchId } },
      });
      if (!grant) {
        throw new ForbiddenException('Branch boundary violation: no access to branch ' + branchId);
      }
    }
  }

  // Validate exercises belong to standard library or caller gym
  private async validateExerciseOwnership(gymId: string, exerciseIds: string[]) {
    if (!exerciseIds.length) return;
    const exercises = await this.prisma.exercise.findMany({
      where: { id: { in: exerciseIds } },
    });
    if (exercises.length !== exerciseIds.length) {
      throw new NotFoundException('One or more exercises not found in Exercise Library');
    }
    for (const ex of exercises) {
      if (ex.gymId !== null && ex.gymId !== gymId) {
        throw new ForbiddenException(
          `Security violation: Exercise '${ex.name}' belongs to another gym`,
        );
      }
    }
  }

  // --- WORKOUT PLANS CRUD ---

  async listWorkoutPlans(user: AuthUserPayload, query: QueryWorkoutPlanDto) {
    const { gymId, role } = this.resolveGym(user, query.gymSlug);

    const where: Prisma.WorkoutPlanWhereInput = {
      gymId,
    };

    if (query.status) {
      where.status = query.status;
    } else if (role === Role.MEMBER) {
      where.status = 'PUBLISHED';
    }

    if (query.search?.trim()) {
      where.name = { contains: query.search.trim(), mode: 'insensitive' };
    }

    return this.prisma.workoutPlan.findMany({
      where,
      include: {
        creator: { select: { id: true, name: true, email: true } },
        branch: { select: { id: true, name: true } },
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
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getWorkoutPlan(user: AuthUserPayload, id: string, gymSlug?: string) {
    const { gymId, role } = this.resolveGym(user, gymSlug);
    const plan = await this.prisma.workoutPlan.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true, email: true } },
        branch: { select: { id: true, name: true } },
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
    });

    if (!plan) {
      throw new NotFoundException('Workout plan not found');
    }

    if (plan.gymId !== gymId) {
      throw new ForbiddenException('Access denied to other gym workout plan');
    }

    if (role === Role.MEMBER && plan.status !== 'PUBLISHED') {
      throw new ForbiddenException('Members cannot view unpublished workout plans');
    }

    return plan;
  }

  async createWorkoutPlan(user: AuthUserPayload, dto: CreateWorkoutPlanDto, gymSlug?: string) {
    const { gymId, role } = this.resolveGym(user, gymSlug);
    if (role !== Role.TRAINER && role !== Role.GYM_ADMIN) {
      throw new ForbiddenException('Only trainers and admins can create workout plans');
    }

    await this.validateBranchAccess(user, gymId, dto.branchId);

    // Extract and validate all exercise IDs
    const exIds = (dto.days ?? []).flatMap((d) => (d.exercises ?? []).map((e) => e.exerciseId));
    await this.validateExerciseOwnership(gymId, exIds);

    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.workoutPlan.create({
        data: {
          gymId,
          createdById: user.id,
          branchId: dto.branchId,
          name: dto.name,
          description: dto.description,
          goal: dto.goal ?? 'general_fitness',
          difficulty: dto.difficulty ?? 'intermediate',
          durationWeeks: dto.durationWeeks ?? 4,
          status: dto.status ?? 'DRAFT',
        },
      });

      if (dto.days?.length) {
        for (let dayIndex = 0; dayIndex < dto.days.length; dayIndex++) {
          const day = dto.days[dayIndex];
          const createdDay = await tx.workoutPlanDay.create({
            data: {
              planId: plan.id,
              dayOfWeek: day.dayOfWeek,
              title: day.title,
              isRestDay: day.isRestDay ?? false,
              warmupNote: day.warmupNote,
              cooldownNote: day.cooldownNote,
              dayNotes: day.dayNotes,
              sortOrder: dayIndex,
            },
          });

          if (!day.isRestDay && day.exercises?.length) {
            for (let exIndex = 0; exIndex < day.exercises.length; exIndex++) {
              const ex = day.exercises[exIndex];
              await tx.workoutPlanExercise.create({
                data: {
                  dayId: createdDay.id,
                  exerciseId: ex.exerciseId,
                  sortOrder: ex.sortOrder ?? exIndex,
                  sets: ex.sets ?? 3,
                  targetReps: ex.targetReps ?? '10-12',
                  targetWeightKg: ex.targetWeightKg,
                  restSeconds: ex.restSeconds ?? 60,
                  supersetGroupId: ex.supersetGroupId,
                  notes: ex.notes,
                },
              });
            }
          }
        }
      }

      return tx.workoutPlan.findUnique({
        where: { id: plan.id },
        include: {
          creator: { select: { id: true, name: true, email: true } },
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
      });
    });
  }

  async updateWorkoutPlan(
    user: AuthUserPayload,
    id: string,
    dto: UpdateWorkoutPlanDto,
    gymSlug?: string,
  ) {
    const { gymId, role } = this.resolveGym(user, gymSlug);
    if (role !== Role.TRAINER && role !== Role.GYM_ADMIN) {
      throw new ForbiddenException('Only trainers and admins can update workout plans');
    }

    const existing = await this.prisma.workoutPlan.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Workout plan not found');
    }
    if (existing.gymId !== gymId) {
      throw new ForbiddenException('Cannot modify another gym workout plan');
    }
    if (role === Role.TRAINER && existing.createdById !== user.id) {
      throw new ForbiddenException('Trainers can only edit their own workout plans');
    }

    if (dto.branchId !== undefined) {
      await this.validateBranchAccess(user, gymId, dto.branchId);
    }

    if (dto.days) {
      const exIds = dto.days.flatMap((d) => (d.exercises ?? []).map((e) => e.exerciseId));
      await this.validateExerciseOwnership(gymId, exIds);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.workoutPlan.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          goal: dto.goal,
          difficulty: dto.difficulty,
          durationWeeks: dto.durationWeeks,
          branchId: dto.branchId,
          status: dto.status,
        },
      });

      if (dto.days) {
        // Replace existing days & exercises
        await tx.workoutPlanDay.deleteMany({ where: { planId: id } });

        for (let dayIndex = 0; dayIndex < dto.days.length; dayIndex++) {
          const day = dto.days[dayIndex];
          const createdDay = await tx.workoutPlanDay.create({
            data: {
              planId: id,
              dayOfWeek: day.dayOfWeek,
              title: day.title,
              isRestDay: day.isRestDay ?? false,
              warmupNote: day.warmupNote,
              cooldownNote: day.cooldownNote,
              dayNotes: day.dayNotes,
              sortOrder: dayIndex,
            },
          });

          if (!day.isRestDay && day.exercises?.length) {
            for (let exIndex = 0; exIndex < day.exercises.length; exIndex++) {
              const ex = day.exercises[exIndex];
              await tx.workoutPlanExercise.create({
                data: {
                  dayId: createdDay.id,
                  exerciseId: ex.exerciseId,
                  sortOrder: ex.sortOrder ?? exIndex,
                  sets: ex.sets ?? 3,
                  targetReps: ex.targetReps ?? '10-12',
                  targetWeightKg: ex.targetWeightKg,
                  restSeconds: ex.restSeconds ?? 60,
                  supersetGroupId: ex.supersetGroupId,
                  notes: ex.notes,
                },
              });
            }
          }
        }
      }

      return tx.workoutPlan.findUnique({
        where: { id },
        include: {
          creator: { select: { id: true, name: true, email: true } },
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
      });
    });
  }

  async duplicateWorkoutPlan(user: AuthUserPayload, id: string, gymSlug?: string) {
    const { gymId, role } = this.resolveGym(user, gymSlug);
    if (role !== Role.TRAINER && role !== Role.GYM_ADMIN) {
      throw new ForbiddenException('Only trainers and admins can duplicate workout plans');
    }

    const source = await this.prisma.workoutPlan.findUnique({
      where: { id },
      include: {
        days: {
          include: { exercises: true },
        },
      },
    });

    if (!source) {
      throw new NotFoundException('Source workout plan not found');
    }
    if (source.gymId !== gymId) {
      throw new ForbiddenException('Cannot duplicate workout plan from another gym');
    }

    return this.prisma.$transaction(async (tx) => {
      const duplicated = await tx.workoutPlan.create({
        data: {
          gymId,
          createdById: user.id,
          branchId: source.branchId,
          name: `${source.name} (Copy)`,
          description: source.description,
          goal: source.goal,
          difficulty: source.difficulty,
          durationWeeks: source.durationWeeks,
          status: 'DRAFT',
        },
      });

      for (const day of source.days) {
        const createdDay = await tx.workoutPlanDay.create({
          data: {
            planId: duplicated.id,
            dayOfWeek: day.dayOfWeek,
            title: day.title,
            isRestDay: day.isRestDay,
            warmupNote: day.warmupNote,
            cooldownNote: day.cooldownNote,
            dayNotes: day.dayNotes,
            sortOrder: day.sortOrder,
          },
        });

        for (const ex of day.exercises) {
          await tx.workoutPlanExercise.create({
            data: {
              dayId: createdDay.id,
              exerciseId: ex.exerciseId,
              sortOrder: ex.sortOrder,
              sets: ex.sets,
              targetReps: ex.targetReps,
              targetWeightKg: ex.targetWeightKg,
              restSeconds: ex.restSeconds,
              supersetGroupId: ex.supersetGroupId,
              notes: ex.notes,
            },
          });
        }
      }

      return tx.workoutPlan.findUnique({
        where: { id: duplicated.id },
        include: {
          days: {
            include: { exercises: { include: { exercise: true } } },
          },
        },
      });
    });
  }

  async publishWorkoutPlan(user: AuthUserPayload, id: string, gymSlug?: string) {
    const { gymId, role } = this.resolveGym(user, gymSlug);
    if (role !== Role.TRAINER && role !== Role.GYM_ADMIN) {
      throw new ForbiddenException('Only trainers and admins can publish workout plans');
    }

    const plan = await this.prisma.workoutPlan.findUnique({
      where: { id },
      include: { days: { include: { exercises: true } } },
    });

    if (!plan) throw new NotFoundException('Workout plan not found');
    if (plan.gymId !== gymId) throw new ForbiddenException('Cannot publish plan from another gym');

    const hasWorkouts = plan.days.some((d) => !d.isRestDay && d.exercises.length > 0);
    if (!hasWorkouts) {
      throw new BadRequestException('Cannot publish plan without at least one exercise scheduled');
    }

    return this.prisma.workoutPlan.update({
      where: { id },
      data: { status: 'PUBLISHED' },
      include: { days: { include: { exercises: { include: { exercise: true } } } } },
    });
  }

  async deleteWorkoutPlan(user: AuthUserPayload, id: string, gymSlug?: string) {
    const { gymId, role } = this.resolveGym(user, gymSlug);
    if (role !== Role.TRAINER && role !== Role.GYM_ADMIN) {
      throw new ForbiddenException('Only trainers and admins can delete workout plans');
    }

    const plan = await this.prisma.workoutPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Workout plan not found');
    if (plan.gymId !== gymId) throw new ForbiddenException('Cannot delete plan from another gym');
    if (role === Role.TRAINER && plan.createdById !== user.id) {
      throw new ForbiddenException('Trainers can only delete their own plans');
    }

    // Check if actively assigned
    const activeAssignments = await this.prisma.workoutPlanAssignment.count({
      where: { planId: id, status: 'ACTIVE' },
    });
    if (activeAssignments > 0) {
      // Archive instead of hard delete to preserve history
      return this.prisma.workoutPlan.update({
        where: { id },
        data: { status: 'ARCHIVED' },
      });
    }

    await this.prisma.workoutPlan.delete({ where: { id } });
    return { ok: true, message: 'Plan deleted successfully' };
  }

  // --- WORKOUT ASSIGNMENT ---

  async listAssignments(user: AuthUserPayload, query: QueryWorkoutPlanAssignmentDto) {
    const { gymId, role } = this.resolveGym(user, query.gymSlug);

    const where: Prisma.WorkoutPlanAssignmentWhereInput = {
      gymId,
    };

    if (role === Role.MEMBER) {
      where.memberUserId = user.id;
    } else if (query.memberUserId) {
      where.memberUserId = query.memberUserId;
    }

    if (query.status) {
      where.status = query.status;
    }

    return this.prisma.workoutPlanAssignment.findMany({
      where,
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
        trainer: { select: { id: true, name: true, email: true } },
        member: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAssignment(user: AuthUserPayload, id: string, gymSlug?: string) {
    const { gymId, role } = this.resolveGym(user, gymSlug);
    const assignment = await this.prisma.workoutPlanAssignment.findUnique({
      where: { id },
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
        trainer: { select: { id: true, name: true, email: true } },
        member: { select: { id: true, name: true, email: true } },
      },
    });

    if (!assignment) throw new NotFoundException('Assignment not found');
    if (assignment.gymId !== gymId) throw new ForbiddenException('Access denied to assignment');
    if (role === Role.MEMBER && assignment.memberUserId !== user.id) {
      throw new ForbiddenException('Members can only view their own assignments');
    }

    return assignment;
  }

  async getMyCurrentWorkoutPlan(user: AuthUserPayload, gymSlug?: string) {
    const { gymId } = this.resolveGym(user, gymSlug);

    const assignment = await this.prisma.workoutPlanAssignment.findFirst({
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
        trainer: { select: { id: true, name: true, email: true } },
      },
      orderBy: { startDate: 'desc' },
    });

    if (!assignment) {
      return { plan: null, assignment: null };
    }

    return {
      assignment: {
        id: assignment.id,
        startDate: assignment.startDate,
        endDate: assignment.endDate,
        notes: assignment.notes,
        status: assignment.status,
        trainer: assignment.trainer,
      },
      plan: assignment.plan,
    };
  }

  async createAssignment(
    user: AuthUserPayload,
    dto: CreateWorkoutPlanAssignmentDto,
    gymSlug?: string,
  ) {
    const { gymId, role } = this.resolveGym(user, gymSlug);
    if (role !== Role.TRAINER && role !== Role.GYM_ADMIN) {
      throw new ForbiddenException('Only trainers and admins can assign workout plans');
    }

    // 1. Verify plan exists and is PUBLISHED and belongs to this gym
    const plan = await this.prisma.workoutPlan.findUnique({
      where: { id: dto.planId },
    });
    if (!plan) throw new NotFoundException('Workout plan not found');
    if (plan.gymId !== gymId) {
      throw new ForbiddenException('Cannot assign workout plan from another gym');
    }
    if (plan.status !== 'PUBLISHED') {
      throw new BadRequestException('Cannot assign an unpublished or archived workout plan');
    }

    // 2. Verify target member belongs to this gym and has active MEMBER role
    const memberRole = await this.prisma.userTenantRole.findFirst({
      where: {
        gymId,
        userId: dto.memberUserId,
        role: Role.MEMBER,
      },
    });
    if (!memberRole) {
      throw new BadRequestException('Target member is not an active member of this gym');
    }

    // 3. If trainer, verify trainer has an active assignment with this member OR branch access
    if (role === Role.TRAINER) {
      const trainerAssignment = await this.prisma.memberTrainerAssignment.findFirst({
        where: {
          gymId,
          memberUserId: dto.memberUserId,
          trainerUserId: user.id,
          active: true,
        },
      });
      // If no 1-on-1 PT assignment, check branch co-membership
      if (!trainerAssignment) {
        // Fallback: check if member belongs to gym and trainer has gym-level access
        const trainerGymRole = user.roles.find((r) => r.gymId === gymId);
        if (!trainerGymRole) {
          throw new ForbiddenException('Trainer has no access to this member');
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // Deactivate any existing active assignments for this member
      await tx.workoutPlanAssignment.updateMany({
        where: {
          gymId,
          memberUserId: dto.memberUserId,
          status: 'ACTIVE',
        },
        data: {
          status: 'COMPLETED',
          endDate: new Date(),
        },
      });

      return tx.workoutPlanAssignment.create({
        data: {
          gymId,
          planId: dto.planId,
          memberUserId: dto.memberUserId,
          trainerUserId: user.id,
          startDate: new Date(dto.startDate),
          endDate: dto.endDate ? new Date(dto.endDate) : null,
          status: 'ACTIVE',
          notes: dto.notes,
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
          member: { select: { id: true, name: true, email: true } },
          trainer: { select: { id: true, name: true, email: true } },
        },
      });
    });
  }

  async updateAssignment(
    user: AuthUserPayload,
    id: string,
    dto: UpdateWorkoutPlanAssignmentDto,
    gymSlug?: string,
  ) {
    const { gymId, role } = this.resolveGym(user, gymSlug);
    if (role !== Role.TRAINER && role !== Role.GYM_ADMIN) {
      throw new ForbiddenException('Only trainers and admins can update workout assignments');
    }

    const assignment = await this.prisma.workoutPlanAssignment.findUnique({
      where: { id },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (assignment.gymId !== gymId) {
      throw new ForbiddenException('Cannot modify assignment of another gym');
    }

    return this.prisma.workoutPlanAssignment.update({
      where: { id },
      data: {
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        status: dto.status,
        notes: dto.notes,
      },
      include: {
        plan: true,
        member: { select: { id: true, name: true, email: true } },
        trainer: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async endAssignment(user: AuthUserPayload, id: string, gymSlug?: string) {
    const { gymId, role } = this.resolveGym(user, gymSlug);
    if (role !== Role.TRAINER && role !== Role.GYM_ADMIN) {
      throw new ForbiddenException('Only trainers and admins can end workout assignments');
    }

    const assignment = await this.prisma.workoutPlanAssignment.findUnique({
      where: { id },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (assignment.gymId !== gymId) {
      throw new ForbiddenException('Cannot end assignment of another gym');
    }

    return this.prisma.workoutPlanAssignment.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        endDate: new Date(),
      },
    });
  }
}

