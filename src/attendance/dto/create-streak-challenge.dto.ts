import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateStreakChallengeDto {
  @IsUUID()
  challengedUserId!: string;

  @IsOptional()
  @IsUUID()
  exerciseId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  exerciseName!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  setCount!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(500)
  targetWeightKg!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  message?: string;
}