import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const STATUSES = ['active', 'trial', 'frozen', 'expired'] as const;

export class UpsertAssignmentDto {
  @IsEmail()
  memberEmail!: string;

  @IsEmail()
  trainerEmail!: string;

  @IsString()
  @MinLength(2)
  gymSlug!: string;

  @IsString()
  @MinLength(2)
  planLabel!: string;

  @IsIn(STATUSES)
  membershipStatus!: (typeof STATUSES)[number];

  @IsOptional()
  @IsString()
  membershipNote?: string;

  @IsOptional()
  @IsString()
  nextSessionNote?: string;
}