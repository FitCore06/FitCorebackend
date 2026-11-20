import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { EQUIPMENT_STATUSES } from './create-equipment.dto.js';

export class UpdateEquipmentDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  branch?: string;

  @IsOptional()
  @IsIn(EQUIPMENT_STATUSES)
  status?: (typeof EQUIPMENT_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MinLength(2)
  nextServiceLabel?: string;
}
