import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export class AssignMembershipDto {
  @IsString()
  memberUserId!: string;

  @IsString()
  planId!: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsIn(['active', 'trial'])
  status!: 'active' | 'trial';
}

export class RenewMembershipDto {
  @IsOptional()
  @IsString()
  planId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;
}
