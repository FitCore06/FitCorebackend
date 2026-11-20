import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class ScanItemDto {
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
}

export class PatchScanItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScanItemDto)
  items!: ScanItemDto[];
}