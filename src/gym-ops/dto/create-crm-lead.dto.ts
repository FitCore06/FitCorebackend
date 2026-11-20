import { IsOptional, IsString, MinLength } from 'class-validator';

export const CRM_STAGES = [
  'new',
  'follow-up',
  'demo',
  'negotiation',
  'converted',
  'lost',
] as const;

export type CrmStage = (typeof CRM_STAGES)[number];

export class CreateCrmLeadDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  source!: string;

  @IsString()
  stage!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  referredBy?: string;

  @IsOptional()
  @IsString()
  nextAction?: string;

  @IsOptional()
  @IsString()
  assignedUserId?: string;
}