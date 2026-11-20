import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateRefundDto {
  @IsInt()
  @Min(1)
  amountInr!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsString()
  @MaxLength(200)
  idempotencyKey!: string;
}
