import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

const STATUSES = ['active', 'trial', 'frozen', 'expired'] as const;

export class UpsertAssignmentDto {
  @IsEmail()
  memberEmail!: string;

  @IsEmail()
  trainerEmail!: string;

  @IsString()
  @MinLength(2)
  gymSlug!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  planLabel?: string;

  @IsOptional()
  @IsUUID()
  trainerPlanId?: string;

  @IsIn(STATUSES)
  membershipStatus!: (typeof STATUSES)[number];

  @IsOptional()
  @IsString()
  membershipNote?: string;

  @IsOptional()
  @IsString()
  nextSessionNote?: string;

  /** YYYY-MM-DD — trainer plan validity starts here (default today). */
  @IsOptional()
  @IsString()
  startDate?: string;
}