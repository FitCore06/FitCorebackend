import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const SUPPLEMENT_PAYMENT_METHODS = [
  'cash',
  'upi',
  'card',
  'net_banking',
  'other',
] as const;

export type SupplementPaymentMethod = (typeof SUPPLEMENT_PAYMENT_METHODS)[number];

export class SupplementLineItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  productName!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsInt()
  @Min(1)
  unitPriceInr!: number;
}

export class CreateSupplementSaleDto {
  @IsUUID()
  memberUserId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SupplementLineItemDto)
  items!: SupplementLineItemDto[];

  @IsIn([...SUPPLEMENT_PAYMENT_METHODS])
  paymentMethod!: SupplementPaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  sendWhatsApp?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(4_000_000)
  proofBase64?: string;

  @ValidateIf((o: CreateSupplementSaleDto) => !!o.proofBase64)
  @IsString()
  @MinLength(3)
  proofMimeType?: string;
}