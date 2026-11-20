import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class RazorpayOrderDto {
  @IsString()
  title!: string;

  @IsInt()
  @Min(1)
  amountInr!: number;

  @IsOptional()
  @IsString()
  gymSlug?: string;
}