import { IsString, MinLength } from 'class-validator';

export class VerifyQrDto {
  @IsString()
  @MinLength(8)
  qrPayload!: string;

  @IsString()
  gymSlug!: string;
}