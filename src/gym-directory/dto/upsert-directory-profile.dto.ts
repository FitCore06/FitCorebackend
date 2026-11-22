import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpsertDirectoryProfileDto {
  @IsBoolean()
  isListed!: boolean;

  @IsIn(['basic', 'featured'])
  planTier!: 'basic' | 'featured';

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  state!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city!: string;

  @IsString()
  @MaxLength(120)
  area!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(240)
  addressLine!: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}