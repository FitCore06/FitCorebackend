import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const CATEGORIES = ['gym', 'equipment', 'staff', 'other'] as const;

export class CreateMemberIssueDto {
  @ApiProperty({ enum: CATEGORIES })
  @IsIn(CATEGORIES)
  category!: (typeof CATEGORIES)[number];

  @ApiProperty({ minLength: 3 })
  @IsString()
  @MinLength(3)
  subject!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10)
  description!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  equipmentName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  gymSlug?: string;
}