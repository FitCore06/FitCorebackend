import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateBookingDto {
  @IsString()
  @MinLength(2)
  startAtLabel!: string;

  @IsOptional()
  @IsString()
  gymSlug?: string;
}