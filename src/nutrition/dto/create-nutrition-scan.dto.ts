import { IsOptional, IsString, Matches } from 'class-validator';

export class CreateNutritionScanDto {
  @IsString()
  imageBase64!: string;

  @IsString()
  @Matches(/^image\/(jpeg|png|webp)$/i)
  imageMimeType!: string;

  @IsOptional()
  @IsString()
  logDate?: string;

  @IsOptional()
  @IsString()
  linkedDietMealId?: string;
}