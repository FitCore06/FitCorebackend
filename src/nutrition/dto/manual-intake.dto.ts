import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class ManualIntakeDto {
  @IsString()
  displayName!: string;

  @IsNumber()
  @Min(0.01)
  quantityGrams!: number;

  @IsOptional()
  @IsUUID()
  foodCatalogId?: string;

  @IsOptional()
  @IsNumber()
  calories?: number;

  @IsOptional()
  @IsNumber()
  proteinG?: number;

  @IsOptional()
  @IsNumber()
  carbsG?: number;

  @IsOptional()
  @IsNumber()
  fatG?: number;

  @IsOptional()
  @IsString()
  logDate?: string;

  @IsOptional()
  @IsString()
  linkedDietMealId?: string;
}