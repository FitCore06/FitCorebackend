import {
  IsEmail,
  IsEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SubmitContactDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsEmail()
  @MaxLength(120)
  email!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  message!: string;

  /** Honeypot — must stay empty. */
  @IsOptional()
  @IsEmpty()
  website?: string;

  /** Cloudflare Turnstile token when TURNSTILE_SECRET_KEY is set. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  turnstileToken?: string;
}