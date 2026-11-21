import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { SEED_WORKOUT_TEMPLATES } from './fitness.seed-data.js';
import type {
  WeeklyWorkoutPlanDto,
  WorkoutExerciseDto,
  WorkoutTemplateDto,
} from './fitness.types.js';

const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

@Injectable()
export class MemberWeeklyPlanService {
  constructor(private readonly prisma: PrismaService) {}

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
}