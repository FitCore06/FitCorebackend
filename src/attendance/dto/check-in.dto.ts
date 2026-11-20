import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CheckInDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  gymSlug?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  branchName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
