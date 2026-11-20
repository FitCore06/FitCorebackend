import { IsString, MinLength } from 'class-validator';

export class CreateTrialLeadDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(8)
  phone!: string;

  @IsString()
  @MinLength(2)
  source!: string;
}