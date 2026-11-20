import { IsIn } from 'class-validator';

export class DeclareStreakChallengeDto {
  @IsIn(['claim_win', 'concede'])
  outcome!: 'claim_win' | 'concede';
}