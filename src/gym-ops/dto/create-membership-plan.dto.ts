import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateMembershipPlanDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  durationLabel!: string;

  @IsInt()
  @Min(0)
  priceInr!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;
}
