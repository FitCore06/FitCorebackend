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

class DietMealInput {
  @IsString()
  id!: string;

  @IsString()
  mealType!: string;

  @IsString()
  details!: string;

  @IsInt()
  @Min(0)
  calories!: number;

  @IsInt()
  @Min(0)
  proteinG!: number;
}

export class UpsertDietTemplateDto {
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
  @Min(0)
  dailyCalories!: number;

  @IsInt()
  @Min(0)
  proteinG!: number;

  @IsInt()
  @Min(0)
  carbsG!: number;

  @IsInt()
  @Min(0)
  fatG!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DietMealInput)
  meals!: DietMealInput[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  gymSlug?: string;
}