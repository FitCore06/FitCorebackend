import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

export class CreateTrainerFeedbackDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  feedback!: string;

  @ApiProperty()
  @IsUUID()
  trainerUserId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  gymSlug?: string;
}