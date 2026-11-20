import { IsString, MinLength } from 'class-validator';

export class RescheduleBookingDto {
  @IsString()
  @MinLength(2)
  startAtLabel!: string;
}