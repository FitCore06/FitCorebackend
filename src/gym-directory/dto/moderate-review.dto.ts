import { IsIn } from 'class-validator';

export class ModerateDirectoryReviewDto {
  @IsIn(['published', 'hidden'])
  status!: 'published' | 'hidden';
}