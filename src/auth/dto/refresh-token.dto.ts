import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiPropertyOptional({ description: 'Optional when refresh httpOnly cookie is set (web)' })
  @IsOptional()
  @IsString()
  @MinLength(20)
  refreshToken?: string;
}