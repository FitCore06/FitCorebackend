import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class PatchWorkoutSetDto {
  @IsString()
  dayId!: string;

  @IsString()
  exerciseId!: string;

  @IsInt()
  @Min(1)
  setNumber!: number;

  @IsBoolean()
  done!: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  weightKg?: number;

  @ApiProperty({ required: false, example: '2026-11-18' })
  @IsOptional()
  @IsString()
  logDate?: string;
}