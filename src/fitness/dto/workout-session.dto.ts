import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class StartWorkoutSessionDto {
  @ApiPropertyOptional({ description: 'Optional workout plan ID' })
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiPropertyOptional({ description: 'Optional plan day ID' })
  @IsOptional()
  @IsString()
  planDayId?: string;

  @ApiPropertyOptional({ description: 'Optional day of week e.g. mon, tue' })
  @IsOptional()
  @IsString()
  dayOfWeek?: string;

  @ApiPropertyOptional({ description: 'Optional custom day title' })
  @IsOptional()
  @IsString()
  dayTitle?: string;
}

export class UpdateWorkoutSessionSetDto {
  @ApiPropertyOptional({ description: 'Actual reps completed' })
  @IsOptional()
  @IsInt()
  @Min(0)
  actualReps?: number;

  @ApiPropertyOptional({ description: 'Actual weight in KG lifted' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  actualWeightKg?: number;

  @ApiPropertyOptional({ description: 'Notes for this set' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CompleteWorkoutSessionSetDto {
  @ApiPropertyOptional({ description: 'Actual reps completed' })
  @IsOptional()
  @IsInt()
  @Min(0)
  actualReps?: number;

  @ApiPropertyOptional({ description: 'Actual weight in KG lifted' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  actualWeightKg?: number;

  @ApiPropertyOptional({ description: 'Notes for this set' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class FinishWorkoutSessionDto {
  @ApiPropertyOptional({ description: 'Optional general session notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CancelWorkoutSessionDto {
  @ApiPropertyOptional({ description: 'Reason for cancellation' })
  @IsOptional()
  @IsString()
  reason?: string;
}

