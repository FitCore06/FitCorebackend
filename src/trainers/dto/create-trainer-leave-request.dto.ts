import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTrainerLeaveRequestDto {
  @IsDateString()
  fromDate!: string;

  @IsDateString()
  toDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
