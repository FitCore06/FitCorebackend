import { IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class AdminCreateBookingDto {
  @IsEmail()
  memberEmail!: string;

  @IsEmail()
  trainerEmail!: string;

  @IsString()
  @MinLength(2)
  startAtLabel!: string;

  @IsOptional()
  @IsString()
  gymSlug?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}
