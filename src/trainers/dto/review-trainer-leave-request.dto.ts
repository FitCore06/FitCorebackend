import { IsIn } from 'class-validator';

export class ReviewTrainerLeaveRequestDto {
  @IsIn(['approved', 'rejected'])
  status!: 'approved' | 'rejected';
}
