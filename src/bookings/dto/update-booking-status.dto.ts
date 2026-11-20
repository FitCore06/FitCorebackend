import { IsIn, IsOptional, IsString } from 'class-validator';
import { BookingStatus, type BookingStatusValue } from '../booking.types.js';

const STATUSES = Object.values(BookingStatus);

export class UpdateBookingStatusDto {
  @IsIn(STATUSES)
  status!: BookingStatusValue;

  @IsOptional()
  @IsString()
  note?: string;
}