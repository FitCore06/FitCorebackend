import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class PatchDietMealDto {
  @IsString()
  mealId!: string;

  @IsBoolean()
  done!: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  logDate?: string;
}