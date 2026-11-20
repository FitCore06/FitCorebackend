export const BookingStatus = {
  REQUESTED: 'requested',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  RESCHEDULED: 'rescheduled',
} as const;

export type BookingStatusValue =
  (typeof BookingStatus)[keyof typeof BookingStatus];

export type BookingDto = {
  id: string;
  memberEmail: string;
  memberName: string;
  trainerName: string;
  startAt: string;
  status: BookingStatusValue;
  history: { at: string; status: BookingStatusValue; note?: string }[];
};