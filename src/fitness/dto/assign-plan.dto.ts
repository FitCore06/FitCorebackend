import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class AssignPlanDto {
  @IsEmail()
  memberEmail!: string;

  @IsString()
  templateId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  gymSlug?: string;
}