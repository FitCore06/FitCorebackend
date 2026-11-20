import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export const VALID_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type ValidDayOfWeek = (typeof VALID_DAYS)[number];

export class CreateWorkoutPlanExerciseDto {
  @ApiProperty({ description: 'ID of the exercise from the Exercise Library' })
  @IsString()
  exerciseId: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  sets?: number;

  @ApiPropertyOptional({ default: '10-12', description: 'Rep target e.g. 12, 8-12, or 30s' })
  @IsOptional()
  @IsString()
  targetReps?: string;

  @ApiPropertyOptional({ description: 'Optional target weight in KG' })
  @IsOptional()
  @IsNumber()
  targetWeightKg?: number;

  @ApiPropertyOptional({ default: 60, description: 'Rest duration in seconds' })
  @IsOptional()
  @IsInt()
  @Min(0)
  restSeconds?: number;

  @ApiPropertyOptional({ description: 'Superset group tag if paired' })
  @IsOptional()
  @IsString()
  supersetGroupId?: string;

  @ApiPropertyOptional({ description: 'Specific notes for this exercise' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateWorkoutPlanDayDto {
  @ApiProperty({ enum: VALID_DAYS, description: 'Day of week: mon, tue, wed, thu, fri, sat, sun' })
  @IsIn(VALID_DAYS)
  dayOfWeek: ValidDayOfWeek;

  @ApiPropertyOptional({ description: 'Title of the day, e.g. Upper Body Power' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isRestDay?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  warmupNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cooldownNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dayNotes?: string;

  @ApiPropertyOptional({ type: [CreateWorkoutPlanExerciseDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWorkoutPlanExerciseDto)
  exercises?: CreateWorkoutPlanExerciseDto[];
}

export class CreateWorkoutPlanDto {
  @ApiProperty({ description: 'Plan title' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Plan description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: 'general_fitness' })
  @IsOptional()
  @IsString()
  goal?: string;

  @ApiPropertyOptional({ default: 'intermediate' })
  @IsOptional()
  @IsString()
  difficulty?: string;

  @ApiPropertyOptional({ default: 4, description: 'Duration in weeks' })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationWeeks?: number;

  @ApiPropertyOptional({ description: 'Optional branch ID for branch scoping' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], default: 'DRAFT' })
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: string;

  @ApiPropertyOptional({ type: [CreateWorkoutPlanDayDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWorkoutPlanDayDto)
  days?: CreateWorkoutPlanDayDto[];
}

export class UpdateWorkoutPlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  goal?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  difficulty?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  durationWeeks?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] })
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: string;

  @ApiPropertyOptional({ type: [CreateWorkoutPlanDayDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWorkoutPlanDayDto)
  days?: CreateWorkoutPlanDayDto[];
}

export class QueryWorkoutPlanDto {
  @ApiPropertyOptional({ description: 'Optional gym slug override' })
  @IsOptional()
  @IsString()
  gymSlug?: string;

  @ApiPropertyOptional({ enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] })
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

export class CreateWorkoutPlanAssignmentDto {
  @ApiProperty({ description: 'Workout plan ID' })
  @IsString()
  planId: string;

  @ApiProperty({ description: 'Target member user ID' })
  @IsString()
  memberUserId: string;

  @ApiProperty({ description: 'Start date in ISO format' })
  @IsString()
  startDate: string;

  @ApiPropertyOptional({ description: 'Optional end date in ISO format' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Assignment notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateWorkoutPlanAssignmentDto {
  @ApiPropertyOptional({ description: 'Start date in ISO format' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date in ISO format' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'COMPLETED', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'COMPLETED', 'CANCELLED'])
  status?: string;

  @ApiPropertyOptional({ description: 'Assignment notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class QueryWorkoutPlanAssignmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gymSlug?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'COMPLETED', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'COMPLETED', 'CANCELLED'])
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by member user ID' })
  @IsOptional()
  @IsString()
  memberUserId?: string;
}

