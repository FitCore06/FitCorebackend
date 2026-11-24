import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class MemberPaymentRequestDto {
  @IsInt()
  @Min(1)
  amountInr!: number;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  method?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4_000_000)
  proofBase64?: string;

  @ValidateIf((o: MemberPaymentRequestDto) => !!o.proofBase64)
  @IsString()
  @MaxLength(80)
  proofMimeType?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  membershipPlanId?: string;
}