import { IsIn } from 'class-validator';

export class RespondStreakChallengeDto {
  @IsIn(['accept', 'reject'])
  decision!: 'accept' | 'reject';
}