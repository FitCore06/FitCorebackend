import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

class WorkoutExerciseDto {
  @IsString()
  id!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsInt()
  @Min(0)
  sets!: number;

  @IsString()
  reps!: string;

  @IsInt()
  @Min(0)
  restSec!: number;
}

export class UpsertWorkoutTemplateDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  goal!: string;

  @IsInt()
  @Min(1)
  daysPerWeek!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkoutExerciseDto)
  exercises!: WorkoutExerciseDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  gymSlug?: string;
}