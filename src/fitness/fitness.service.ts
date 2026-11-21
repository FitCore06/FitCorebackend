import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Role, type AuthUserPayload } from '../auth/auth.types.js';
import { gymRole } from '../auth/guards/roles.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AssignPlanDto } from './dto/assign-plan.dto.js';
import type { UpsertDietTemplateDto } from './dto/upsert-diet-template.dto.js';
import type { UpsertWorkoutTemplateDto } from './dto/upsert-workout-template.dto.js';
import type { PatchDietMealDto } from './dto/patch-diet-meal.dto.js';
import type { PatchWorkoutSetDto } from './dto/patch-workout-set.dto.js';
import {
  SEED_DIET_TEMPLATES,
  SEED_WORKOUT_TEMPLATES,
} from './fitness.seed-data.js';
import type {
  DietTemplateDto,
  MemberDietStatusDto,
  MemberWorkoutPlanResponse,
  MemberWorkoutStatusDto,
  WeeklyWorkoutPlanDto,
  WorkoutExerciseDto,
  WorkoutSetLogDto,
  WorkoutTemplateDto,
} from './fitness.types.js';

const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const DAY_LABELS: Record<string, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  mid_morning: 'Mid-morning',
  lunch: 'Lunch',
  evening_snack: 'Evening snack',
  dinner: 'Dinner',
  pre_workout: 'Pre-workout',
  post_workout: 'Post-workout',
};

@Injectable()
export class FitnessService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveGymSlug(user: AuthUserPayload, gymSlug?: string) {
    const slug =
      gymSlug?.trim().toLowerCase() ??
      user.roles[0]?.gymSlug?.toLowerCase();
    if (!slug) throw new BadRequestException('gymSlug required');
    return slug;
  }

  private async tenantForSlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new NotFoundException('Gym not found');
    return tenant;
  }

  private workoutRowToDto(row: {
    id: string;
    builtInKey: string | null;
    name: string;
    goal: string;
    daysPerWeek: number;
    exercises: Prisma.JsonValue;
  }): WorkoutTemplateDto {
    return {
      id: row.builtInKey ?? row.id,
      builtIn: Boolean(row.builtInKey),
      name: row.name,
      goal: row.goal,
      daysPerWeek: row.daysPerWeek,
      exercises: row.exercises as WorkoutExerciseDto[],
    };
  }

  private dietRowToDto(row: {
    id: string;
    builtInKey: string | null;
    name: string;
    goal: string;
    dailyCalories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    meals: Prisma.JsonValue;
  }): DietTemplateDto {
    return {
      id: row.builtInKey ?? row.id,
      builtIn: Boolean(row.builtInKey),
      name: row.name,
      goal: row.goal,
      dailyCalories: row.dailyCalories,
      proteinG: row.proteinG,
      carbsG: row.carbsG,
      fatG: row.fatG,
      meals: row.meals as DietTemplateDto['meals'],
    };
  }

  private async findWorkoutTemplate(gymId: string, templateId: string) {
    const byBuiltin = await this.prisma.workoutTemplate.findFirst({
      where: { gymId, builtInKey: templateId },
    });
    if (byBuiltin) return byBuiltin;
    return this.prisma.workoutTemplate.findFirst({
      where: { gymId, id: templateId },
    });
  }

  private async findDietTemplate(gymId: string, templateId: string) {
    const byBuiltin = await this.prisma.dietTemplate.findFirst({
      where: { gymId, builtInKey: templateId },
    });
    if (byBuiltin) return byBuiltin;
    return this.prisma.dietTemplate.findFirst({
      where: { gymId, id: templateId },
    });
  }

  private templateToWeeklyPlan(
    template: WorkoutTemplateDto,
    meta: { trainerName?: string; source: 'trainer' | 'default' },
  ): WeeklyWorkoutPlanDto {
    const trainingDays = WEEK_DAYS.slice(0, Math.min(template.daysPerWeek, 7));
    const days = WEEK_DAYS.map((dayId) => {
      const training = trainingDays.includes(dayId);
      if (!training) {
        return {
          dayId,
          restDay: true,
          title: 'Rest',
          exercises: [] as WorkoutExerciseDto[],
        };
      }
      const exercises = template.exercises.map((e, i) => ({
        ...e,
        id: `${e.id}-${dayId}-${i}`,
      }));
      return {
        dayId,
        restDay: false,
        title: template.name,
        exercises: exercises.length
          ? exercises
          : [
              {
                id: `ex-${dayId}`,
                name: 'Movement prep',
                sets: 3,
                reps: '10',
                restSec: 60,
              },
            ],
      };
    });

    return {
      id: `week-${template.id}-${Date.now()}`,
      name: template.name,
      goal: template.goal,
      days,
      updatedAt: new Date().toISOString(),
      source: meta.source,
      trainerName: meta.trainerName,
    };
  }

  private defaultWorkoutTemplateKey(memberEmail: string) {
    return memberEmail.toLowerCase() === 'newmember@gym.test'
      ? 'wkt-intro'
      : 'wkt-upper';
  }

  private defaultDietTemplateKey(memberEmail: string) {
    return memberEmail.toLowerCase() === 'newmember@gym.test'
      ? 'diet-cut'
      : 'diet-lean';
  }

  private workoutSeedTemplate(builtInKey: string): WorkoutTemplateDto | null {
    const seed = SEED_WORKOUT_TEMPLATES.find((t) => t.builtInKey === builtInKey);
    if (!seed) return null;
    return {
      id: seed.builtInKey,
      builtIn: true,
      name: seed.name,
      goal: seed.goal,
      daysPerWeek: seed.daysPerWeek,
      exercises: seed.exercises.map((e) => ({ ...e })),
    };
  }

  private dietSeedTemplate(builtInKey: string): DietTemplateDto | null {
    const seed = SEED_DIET_TEMPLATES.find((t) => t.builtInKey === builtInKey);
    if (!seed) return null;
    return {
      id: seed.builtInKey,
      builtIn: true,
      name: seed.name,
      goal: seed.goal,
      dailyCalories: seed.dailyCalories,
      proteinG: seed.proteinG,
      carbsG: seed.carbsG,
      fatG: seed.fatG,
      meals: seed.meals.map((m) => ({ ...m })),
    };
  }

  private assertTrainerOrAdmin(user: AuthUserPayload, gymId: string) {
    const isTrainer = user.roles.some(
      (r) => r.role === Role.TRAINER && r.gymId === gymId,
    );
    const isAdmin = user.roles.some(
      (r) => r.role === Role.GYM_ADMIN && r.gymId === gymId,
    );
    if (!isTrainer && !isAdmin) {
      throw new ForbiddenException('Trainer or gym admin only');
    }
  }

  async listWorkoutTemplates(
    user: AuthUserPayload,
    gymSlug: string,
  ): Promise<WorkoutTemplateDto[]> {
    const admin = gymRole(user, Role.GYM_ADMIN, gymSlug);
    const trainer = user.roles.find(
      (r) => r.role === Role.TRAINER && r.gymSlug === gymSlug.toLowerCase(),
    );
    if (!admin && !trainer) throw new ForbiddenException('Gym access required');

    const tenant = await this.tenantForSlug(gymSlug);
    const rows = await this.prisma.workoutTemplate.findMany({
      where: { gymId: tenant.id },
      orderBy: [{ builtInKey: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => this.workoutRowToDto(r));
  }

  async upsertWorkoutTemplate(
    user: AuthUserPayload,
    dto: UpsertWorkoutTemplateDto,
  ): Promise<WorkoutTemplateDto> {
    const slug = this.resolveGymSlug(user, dto.gymSlug);
    const tenant = await this.tenantForSlug(slug);
    this.assertTrainerOrAdmin(user, tenant.id);

    if (dto.id && !dto.id.startsWith('wkt-custom-') && dto.id.includes('-')) {
      const existing = await this.findWorkoutTemplate(tenant.id, dto.id);
      if (existing?.builtInKey) {
        throw new BadRequestException('Cannot edit built-in template');
      }
    }

    const existingCustom = dto.id
      ? await this.findWorkoutTemplate(tenant.id, dto.id)
      : null;

    if (existingCustom && !existingCustom.builtInKey) {
      const row = await this.prisma.workoutTemplate.update({
        where: { id: existingCustom.id },
        data: {
          name: dto.name.trim(),
          goal: dto.goal.trim(),
          daysPerWeek: dto.daysPerWeek,
          exercises: dto.exercises as unknown as Prisma.InputJsonValue,
        },
      });
      return this.workoutRowToDto(row);
    }

    const row = await this.prisma.workoutTemplate.create({
      data: {
        gymId: tenant.id,
        createdById: user.id,
        name: dto.name.trim(),
        goal: dto.goal.trim(),
        daysPerWeek: dto.daysPerWeek,
        exercises: dto.exercises as unknown as Prisma.InputJsonValue,
      },
    });
    return this.workoutRowToDto(row);
  }

  async deleteWorkoutTemplate(
    user: AuthUserPayload,
    templateId: string,
    gymSlug?: string,
  ) {
    const slug = this.resolveGymSlug(user, gymSlug);
    const tenant = await this.tenantForSlug(slug);
    this.assertTrainerOrAdmin(user, tenant.id);

    const row = await this.findWorkoutTemplate(tenant.id, templateId);
    if (!row) throw new NotFoundException('Template not found');
    if (row.builtInKey) {
      throw new BadRequestException('Cannot delete built-in template');
    }
    await this.prisma.workoutTemplate.delete({ where: { id: row.id } });
    return { ok: true };
  }

  async listDietTemplates(
    user: AuthUserPayload,
    gymSlug: string,
  ): Promise<DietTemplateDto[]> {
    const admin = gymRole(user, Role.GYM_ADMIN, gymSlug);
    const trainer = user.roles.find(
      (r) => r.role === Role.TRAINER && r.gymSlug === gymSlug.toLowerCase(),
    );
    if (!admin && !trainer) throw new ForbiddenException('Gym access required');

    const tenant = await this.tenantForSlug(gymSlug);
    const rows = await this.prisma.dietTemplate.findMany({
      where: { gymId: tenant.id },
      orderBy: [{ builtInKey: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => this.dietRowToDto(r));
  }

  async upsertDietTemplate(
    user: AuthUserPayload,
    dto: UpsertDietTemplateDto,
  ): Promise<DietTemplateDto> {
    const slug = this.resolveGymSlug(user, dto.gymSlug);
    const tenant = await this.tenantForSlug(slug);
    this.assertTrainerOrAdmin(user, tenant.id);

    const existing = dto.id
      ? await this.findDietTemplate(tenant.id, dto.id)
      : null;
    if (existing?.builtInKey) {
      throw new BadRequestException('Cannot edit built-in template');
    }

    if (existing && !existing.builtInKey) {
      const row = await this.prisma.dietTemplate.update({
        where: { id: existing.id },
        data: {
          name: dto.name.trim(),
          goal: dto.goal.trim(),
          dailyCalories: dto.dailyCalories,
          proteinG: dto.proteinG,
          carbsG: dto.carbsG,
          fatG: dto.fatG,
          meals: dto.meals as unknown as Prisma.InputJsonValue,
        },
      });
      return this.dietRowToDto(row);
    }

    const row = await this.prisma.dietTemplate.create({
      data: {
        gymId: tenant.id,
        createdById: user.id,
        name: dto.name.trim(),
        goal: dto.goal.trim(),
        dailyCalories: dto.dailyCalories,
        proteinG: dto.proteinG,
        carbsG: dto.carbsG,
        fatG: dto.fatG,
        meals: dto.meals as unknown as Prisma.InputJsonValue,
      },
    });
    return this.dietRowToDto(row);
  }

  async deleteDietTemplate(
    user: AuthUserPayload,
    templateId: string,
    gymSlug?: string,
  ) {
    const slug = this.resolveGymSlug(user, gymSlug);
    const tenant = await this.tenantForSlug(slug);
    this.assertTrainerOrAdmin(user, tenant.id);

    const row = await this.findDietTemplate(tenant.id, templateId);
    if (!row) throw new NotFoundException('Template not found');
    if (row.builtInKey) {
      throw new BadRequestException('Cannot delete built-in template');
    }
    await this.prisma.dietTemplate.delete({ where: { id: row.id } });
    return { ok: true };
  }

  async assignWorkout(
    user: AuthUserPayload,
    dto: AssignPlanDto,
  ): Promise<WeeklyWorkoutPlanDto> {
    const slug = this.resolveGymSlug(user, dto.gymSlug);
    const tenant = await this.tenantForSlug(slug);
    this.assertTrainerOrAdmin(user, tenant.id);

    const member = await this.prisma.user.findUnique({
      where: { email: dto.memberEmail.toLowerCase() },
    });
    if (!member) throw new NotFoundException('Member not found');

    const templateRow = await this.findWorkoutTemplate(tenant.id, dto.templateId);
    if (!templateRow) throw new NotFoundException('Workout template not found');

    const template = this.workoutRowToDto(templateRow);
    const weekly = this.templateToWeeklyPlan(template, {
      source: 'trainer',
      trainerName: user.name,
    });

    await this.prisma.fitnessPlanAssignment.upsert({
      where: {
        gymId_memberUserId_planType: {
          gymId: tenant.id,
          memberUserId: member.id,
          planType: 'workout',
        },
      },
      create: {
        gymId: tenant.id,
        memberUserId: member.id,
        trainerUserId: user.id,
        planType: 'workout',
        templateRef: template.id,
        planSnapshot: weekly as unknown as Prisma.InputJsonValue,
      },
      update: {
        trainerUserId: user.id,
        templateRef: template.id,
        planSnapshot: weekly as unknown as Prisma.InputJsonValue,
      },
    });

    return weekly;
  }

  async assignDiet(user: AuthUserPayload, dto: AssignPlanDto) {
    const slug = this.resolveGymSlug(user, dto.gymSlug);
    const tenant = await this.tenantForSlug(slug);
    this.assertTrainerOrAdmin(user, tenant.id);

    const member = await this.prisma.user.findUnique({
      where: { email: dto.memberEmail.toLowerCase() },
    });
    if (!member) throw new NotFoundException('Member not found');

    const templateRow = await this.findDietTemplate(tenant.id, dto.templateId);
    if (!templateRow) throw new NotFoundException('Diet template not found');

    const template = this.dietRowToDto(templateRow);

    await this.prisma.fitnessPlanAssignment.upsert({
      where: {
        gymId_memberUserId_planType: {
          gymId: tenant.id,
          memberUserId: member.id,
          planType: 'diet',
        },
      },
      create: {
        gymId: tenant.id,
        memberUserId: member.id,
        trainerUserId: user.id,
        planType: 'diet',
        templateRef: template.id,
        planSnapshot: template as unknown as Prisma.InputJsonValue,
      },
      update: {
        trainerUserId: user.id,
        templateRef: template.id,
        planSnapshot: template as unknown as Prisma.InputJsonValue,
      },
    });

    return template;
  }

  private todayLogDate() {
    return new Date().toISOString().slice(0, 10);
  }

  private async memberWeeklyPlan(
    memberUserId: string,
    gymId: string,
    memberEmail: string,
  ): Promise<WeeklyWorkoutPlanDto> {
    const assigned = await this.prisma.fitnessPlanAssignment.findUnique({
      where: {
        gymId_memberUserId_planType: {
          gymId,
          memberUserId,
          planType: 'workout',
        },
      },
    });
    if (assigned) {
      return assigned.planSnapshot as unknown as WeeklyWorkoutPlanDto;
    }
    const key = this.defaultWorkoutTemplateKey(memberEmail);
    const row = await this.prisma.workoutTemplate.findFirst({
      where: { gymId, builtInKey: key },
    });
    const template = row
      ? this.workoutRowToDto(row)
      : this.workoutSeedTemplate(key);
    if (!template) throw new NotFoundException('Default workout template missing');
    return this.templateToWeeklyPlan(template, {
      source: 'default',
    });
  }

  private async memberDietTemplate(
    memberUserId: string,
    gymId: string,
    memberEmail: string,
  ): Promise<DietTemplateDto> {
    const assigned = await this.prisma.fitnessPlanAssignment.findUnique({
      where: {
        gymId_memberUserId_planType: {
          gymId,
          memberUserId,
          planType: 'diet',
        },
      },
    });
    if (assigned) {
      return assigned.planSnapshot as unknown as DietTemplateDto;
    }
    const key = this.defaultDietTemplateKey(memberEmail);
    const row = await this.prisma.dietTemplate.findFirst({
      where: { gymId, builtInKey: key },
    });
    if (row) return this.dietRowToDto(row);
    const seed = this.dietSeedTemplate(key);
    if (!seed) throw new NotFoundException('Default diet template missing');
    return seed;
  }

  private async assertTrainerForMember(
    trainerUser: AuthUserPayload,
    memberUserId: string,
    gymId: string,
  ) {
    const link = await this.prisma.memberTrainerAssignment.findFirst({
      where: {
        gymId,
        memberUserId,
        trainerUserId: trainerUser.id,
        active: true,
      },
    });
    const isAdmin = trainerUser.roles.some(
      (r) => r.role === Role.GYM_ADMIN && r.gymId === gymId,
    );
    if (!link && !isAdmin) {
      throw new ForbiddenException('Not assigned to this member');
    }
  }

  async resolveWeeklyPlanForMember(
    gymId: string,
    memberUserId: string,
    memberEmail: string,
  ): Promise<WeeklyWorkoutPlanDto> {
    const custom = await this.prisma.memberWeeklyWorkout.findUnique({
      where: {
        gymId_memberUserId_source: {
          gymId,
          memberUserId,
          source: 'member',
        },
      },
    });
    if (custom) {
      return custom.planJson as unknown as WeeklyWorkoutPlanDto;
    }

    const assigned = await this.prisma.fitnessPlanAssignment.findUnique({
      where: {
        gymId_memberUserId_planType: {
          gymId,
          memberUserId,
          planType: 'workout',
        },
      },
    });
    if (assigned) {
      return assigned.planSnapshot as unknown as WeeklyWorkoutPlanDto;
    }

    const trainerWeekly = await this.prisma.memberWeeklyWorkout.findUnique({
      where: {
        gymId_memberUserId_source: {
          gymId,
          memberUserId,
          source: 'trainer',
        },
      },
    });
    if (trainerWeekly) {
      return trainerWeekly.planJson as unknown as WeeklyWorkoutPlanDto;
    }

    return this.memberWeeklyPlan(memberUserId, gymId, memberEmail);
  }

  async myWorkoutPlan(user: AuthUserPayload): Promise<MemberWorkoutPlanResponse> {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Members only');

    const custom = await this.prisma.memberWeeklyWorkout.findUnique({
      where: {
        gymId_memberUserId_source: {
          gymId: memberRole.gymId,
          memberUserId: user.id,
          source: 'member',
        },
      },
    });
    if (custom) {
      return {
        plan: custom.planJson as unknown as WeeklyWorkoutPlanDto,
        kind: 'member',
      };
    }

    const assigned = await this.prisma.fitnessPlanAssignment.findUnique({
      where: {
        gymId_memberUserId_planType: {
          gymId: memberRole.gymId,
          memberUserId: user.id,
          planType: 'workout',
        },
      },
    });
    if (assigned) {
      return {
        plan: assigned.planSnapshot as unknown as WeeklyWorkoutPlanDto,
        kind: 'trainer',
      };
    }

    const trainerWeekly = await this.prisma.memberWeeklyWorkout.findUnique({
      where: {
        gymId_memberUserId_source: {
          gymId: memberRole.gymId,
          memberUserId: user.id,
          source: 'trainer',
        },
      },
    });
    if (trainerWeekly) {
      return {
        plan: trainerWeekly.planJson as unknown as WeeklyWorkoutPlanDto,
        kind: 'trainer',
      };
    }

    const plan = await this.memberWeeklyPlan(
      user.id,
      memberRole.gymId,
      user.email,
    );
    return { plan, kind: 'default' };
  }

  async saveMyWeeklyPlan(
    user: AuthUserPayload,
    plan: WeeklyWorkoutPlanDto,
  ): Promise<MemberWorkoutPlanResponse> {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Members only');
    await this.prisma.memberWeeklyWorkout.upsert({
      where: {
        gymId_memberUserId_source: {
          gymId: memberRole.gymId,
          memberUserId: user.id,
          source: 'member',
        },
      },
      create: {
        gymId: memberRole.gymId,
        memberUserId: user.id,
        source: 'member',
        planJson: plan as unknown as Prisma.InputJsonValue,
      },
      update: {
        planJson: plan as unknown as Prisma.InputJsonValue,
      },
    });
    return { plan, kind: 'member' };
  }

  async myWeeklyPlanBuilderState(user: AuthUserPayload): Promise<{
    trainerActive: boolean;
    draft: WeeklyWorkoutPlanDto | null;
  }> {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Members only');
    const gymId = memberRole.gymId;

    const custom = await this.prisma.memberWeeklyWorkout.findUnique({
      where: {
        gymId_memberUserId_source: {
          gymId,
          memberUserId: user.id,
          source: 'member',
        },
      },
    });

    const assigned = await this.prisma.fitnessPlanAssignment.findUnique({
      where: {
        gymId_memberUserId_planType: {
          gymId,
          memberUserId: user.id,
          planType: 'workout',
        },
      },
    });

    const trainerWeekly = await this.prisma.memberWeeklyWorkout.findUnique({
      where: {
        gymId_memberUserId_source: {
          gymId,
          memberUserId: user.id,
          source: 'trainer',
        },
      },
    });

    return {
      trainerActive: !!(assigned || trainerWeekly),
      draft: custom
        ? (custom.planJson as unknown as WeeklyWorkoutPlanDto)
        : null,
    };
  }

  async assignMemberWeeklyPlan(
    user: AuthUserPayload,
    memberEmail: string,
    plan: WeeklyWorkoutPlanDto,
    gymSlug?: string,
  ) {
    const slug = this.resolveGymSlug(user, gymSlug);
    const tenant = await this.tenantForSlug(slug);
    this.assertTrainerOrAdmin(user, tenant.id);
    const member = await this.prisma.user.findUnique({
      where: { email: memberEmail.toLowerCase() },
    });
    if (!member) throw new NotFoundException('Member not found');
    await this.assertTrainerForMember(user, member.id, tenant.id);
    await this.prisma.memberWeeklyWorkout.upsert({
      where: {
        gymId_memberUserId_source: {
          gymId: tenant.id,
          memberUserId: member.id,
          source: 'trainer',
        },
      },
      create: {
        gymId: tenant.id,
        memberUserId: member.id,
        source: 'trainer',
        planJson: plan as unknown as Prisma.InputJsonValue,
      },
      update: {
        planJson: plan as unknown as Prisma.InputJsonValue,
      },
    });
    return plan;
  }

  async myDietPlan(user: AuthUserPayload): Promise<DietTemplateDto> {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Members only');
    return this.memberDietTemplate(user.id, memberRole.gymId, user.email);
  }

  async listWorkoutSetLogs(
    user: AuthUserPayload,
    dayId: string,
    logDate?: string,
  ): Promise<WorkoutSetLogDto[]> {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Members only');
    const date = logDate?.trim() || this.todayLogDate();

    const rows = await this.prisma.workoutSetLog.findMany({
      where: {
        memberUserId: user.id,
        gymId: memberRole.gymId,
        logDate: date,
        dayId,
      },
    });
    return rows.map((r) => ({
      exerciseId: r.exerciseId,
      setNumber: r.setNumber,
      weightKg: r.weightKg ?? undefined,
    }));
  }

  async patchWorkoutSet(user: AuthUserPayload, dto: PatchWorkoutSetDto) {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Members only');
    const date = dto.logDate?.trim() || this.todayLogDate();

    const unique = {
      memberUserId: user.id,
      logDate: date,
      dayId: dto.dayId,
      exerciseId: dto.exerciseId,
      setNumber: dto.setNumber,
    };

    if (!dto.done) {
      await this.prisma.workoutSetLog.deleteMany({ where: unique });
      return { ok: true };
    }

    await this.prisma.workoutSetLog.upsert({
      where: { memberUserId_logDate_dayId_exerciseId_setNumber: unique },
      create: {
        gymId: memberRole.gymId,
        ...unique,
        weightKg: dto.weightKg ?? null,
      },
      update: { weightKg: dto.weightKg ?? null },
    });
    return { ok: true };
  }

  async listDietMealLogs(
    user: AuthUserPayload,
    logDate?: string,
  ): Promise<string[]> {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Members only');
    const date = logDate?.trim() || this.todayLogDate();

    const rows = await this.prisma.dietMealLog.findMany({
      where: { memberUserId: user.id, gymId: memberRole.gymId, logDate: date },
    });
    return rows.map((r) => r.mealId);
  }

  async patchDietMeal(user: AuthUserPayload, dto: PatchDietMealDto) {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Members only');
    const date = dto.logDate?.trim() || this.todayLogDate();

    const unique = {
      memberUserId: user.id,
      logDate: date,
      mealId: dto.mealId,
    };

    if (!dto.done) {
      await this.prisma.dietMealLog.deleteMany({ where: unique });
      return { ok: true };
    }

    await this.prisma.dietMealLog.upsert({
      where: { memberUserId_logDate_mealId: unique },
      create: {
        gymId: memberRole.gymId,
        ...unique,
      },
      update: {},
    });
    return { ok: true };
  }

  async trainerMemberWorkoutStatus(
    user: AuthUserPayload,
    memberEmail: string,
    dayId: string,
    logDate?: string,
  ): Promise<MemberWorkoutStatusDto> {
    const trainerRole = user.roles.find((r) => r.role === Role.TRAINER);
    const admin = user.roles.find((r) => r.role === Role.GYM_ADMIN);
    if (!trainerRole && !admin) throw new ForbiddenException('Trainer only');

    const member = await this.prisma.user.findUnique({
      where: { email: memberEmail.toLowerCase() },
    });
    if (!member) throw new NotFoundException('Member not found');

    const gymId = trainerRole?.gymId ?? admin!.gymId;
    await this.assertTrainerForMember(user, member.id, gymId);

    const date = logDate?.trim() || this.todayLogDate();
    const plan = await this.memberWeeklyPlan(member.id, gymId, member.email);
    const dayPlan = plan.days.find((d) => d.dayId === dayId);
    const exercises =
      dayPlan && !dayPlan.restDay
        ? dayPlan.exercises.filter((e) => e.name.trim().length > 0)
        : [];

    const logs = await this.prisma.workoutSetLog.findMany({
      where: {
        memberUserId: member.id,
        gymId,
        logDate: date,
        dayId,
      },
    });
    const logMap = new Map(
      logs.map((l) => [`${l.exerciseId}::${l.setNumber}`, l]),
    );

    const mapped = exercises.map((e) => {
      const setsTotal = Math.max(1, e.sets);
      const setDone: Record<number, boolean> = {};
      const setWeight: Record<number, number | undefined> = {};
      let setsDone = 0;
      for (let n = 1; n <= setsTotal; n++) {
        const row = logMap.get(`${e.id}::${n}`);
        setDone[n] = Boolean(row);
        setWeight[n] = row?.weightKg ?? undefined;
        if (setDone[n]) setsDone++;
      }
      return {
        id: e.id,
        name: e.name,
        targetReps: e.reps,
        restSec: e.restSec,
        setsTotal,
        setsDone,
        setDone,
        setWeight,
      };
    });

    const total = mapped.reduce((n, ex) => n + ex.setsTotal, 0);
    const completed = mapped.reduce((n, ex) => n + ex.setsDone, 0);

    return {
      memberEmail: member.email,
      dayId,
      dayLabel: DAY_LABELS[dayId] ?? dayId,
      planName: plan.name,
      restDay: Boolean(dayPlan?.restDay),
      exercises: mapped,
      completed,
      total,
      percent: total ? Math.round((completed / total) * 100) : 0,
    };
  }

  async trainerMemberDietStatus(
    user: AuthUserPayload,
    memberEmail: string,
    logDate?: string,
  ): Promise<MemberDietStatusDto> {
    const trainerRole = user.roles.find((r) => r.role === Role.TRAINER);
    const admin = user.roles.find((r) => r.role === Role.GYM_ADMIN);
    if (!trainerRole && !admin) throw new ForbiddenException('Trainer only');

    const member = await this.prisma.user.findUnique({
      where: { email: memberEmail.toLowerCase() },
    });
    if (!member) throw new NotFoundException('Member not found');

    const gymId = trainerRole?.gymId ?? admin!.gymId;
    await this.assertTrainerForMember(user, member.id, gymId);

    const date = logDate?.trim() || this.todayLogDate();
    const template = await this.memberDietTemplate(
      member.id,
      gymId,
      member.email,
    );
    const doneRows = await this.prisma.dietMealLog.findMany({
      where: { memberUserId: member.id, gymId, logDate: date },
    });
    const doneSet = new Set(doneRows.map((r) => r.mealId));

    const meals = template.meals.map((m) => ({
      id: m.id,
      label: `${MEAL_LABELS[m.mealType] ?? m.mealType} · ${m.details.slice(0, 32)}`,
      done: doneSet.has(m.id),
    }));
    const mealsDone = meals.filter((m) => m.done).length;

    return {
      memberEmail: member.email,
      planName: template.name,
      mealsTotal: meals.length,
      mealsDone,
      percent: meals.length
        ? Math.round((mealsDone / meals.length) * 100)
        : 0,
      meals,
    };
  }
}