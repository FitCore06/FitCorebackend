import { IsIn, IsString, MinLength } from 'class-validator';

export const EQUIPMENT_STATUSES = ['ok', 'service-due', 'out'] as const;

export class CreateEquipmentDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  branch!: string;

  @IsIn(EQUIPMENT_STATUSES)
  status!: (typeof EQUIPMENT_STATUSES)[number];

  @IsString()
  @MinLength(2)
  nextServiceLabel!: string;
}
