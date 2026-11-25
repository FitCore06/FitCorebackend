import {
  IsEmpty,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SubmitDirectoryReviewDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  authorName!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsString()
  @MinLength(8)
  @MaxLength(1200)
  comment!: string;

  /** Honeypot — must stay empty (bots fill hidden fields). */
  @IsOptional()
  @IsEmpty()
  website?: string;
}