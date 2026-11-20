import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateExerciseDto {
  @ApiProperty({ example: 'Incline Dumbbell Press' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'strength', required: false })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ example: 'chest' })
  @IsString()
  @MinLength(2)
  primaryMuscle!: string;

  @ApiProperty({ example: ['shoulders', 'triceps'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  secondaryMuscles?: string[];

  @ApiProperty({ example: 'dumbbell', required: false })
  @IsOptional()
  @IsString()
  equipment?: string;

  @ApiProperty({ example: ['Lie on an incline bench.', 'Press dumbbells upward.'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  instructions?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  mediaMimeType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  mediaBase64?: string;

  @ApiProperty({ required: false, description: 'Required for gym custom exercises' })
  @IsOptional()
  @IsString()
  gymSlug?: string;
}

export class UpdateExerciseDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  primaryMuscle?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  secondaryMuscles?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  equipment?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  instructions?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  mediaMimeType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  mediaBase64?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  gymSlug?: string;
}

export class QueryExerciseDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  muscle?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  equipment?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  gymSlug?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customOnly?: string;
}

