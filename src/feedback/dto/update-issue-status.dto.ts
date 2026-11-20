import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

const STATUSES = ['open', 'in-progress', 'resolved'] as const;

export class UpdateIssueStatusDto {
  @ApiProperty({ enum: STATUSES })
  @IsIn(STATUSES)
  status!: (typeof STATUSES)[number];
}
