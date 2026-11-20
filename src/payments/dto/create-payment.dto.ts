import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

const STATUSES = ['paid', 'pending', 'refunded'] as const;

export class CreatePaymentDto {
  @IsEmail()
  memberEmail!: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsInt()
  @Min(1)
  amountInr!: number;

  @IsString()
  method!: string;

  @ApiProperty({ enum: STATUSES })
  @IsIn(STATUSES)
  status!: (typeof STATUSES)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  gymSlug?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
