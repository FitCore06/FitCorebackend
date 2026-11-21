import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdatePaymentCollectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankHolderName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Matches(/^[0-9]*$/, { message: 'bankAccountNumber must be digits only' })
  bankAccountNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(11)
  @Matches(/^[A-Za-z0-9]*$/, { message: 'bankIfsc must be alphanumeric' })
  bankIfsc?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  upiId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4_000_000)
  upiQrBase64?: string;

  @ValidateIf((o: UpdatePaymentCollectionDto) => !!o.upiQrBase64)
  @IsString()
  @MaxLength(80)
  upiQrMimeType?: string;

  /** When true, removes stored UPI QR image */
  @IsOptional()
  @IsBoolean()
  clearUpiQr?: boolean;
}