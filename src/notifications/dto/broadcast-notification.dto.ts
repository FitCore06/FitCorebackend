import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class BroadcastNotificationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  dedupePrefix?: string;
}
