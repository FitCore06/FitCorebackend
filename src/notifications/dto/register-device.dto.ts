import { IsString, MinLength } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  @MinLength(8)
  token!: string;

  @IsString()
  platform!: string;
}