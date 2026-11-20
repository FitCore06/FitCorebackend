import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export const OTHER_EXPENSE_CATEGORIES = [
  'cleaning',
  'electricity',
  'maintenance',
  'water',
  'supplies',
  'rent',
  'other',
] as const;

export type OtherExpenseCategory = (typeof OTHER_EXPENSE_CATEGORIES)[number];

export class CreateOtherExpenseDto {
  @IsIn([...OTHER_EXPENSE_CATEGORIES])
  category!: OtherExpenseCategory;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  @IsInt()
  @Min(1)
  amountInr!: number;

  @IsISO8601()
  paidAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4_000_000)
  proofBase64?: string;

  @ValidateIf((o: CreateOtherExpenseDto) => !!o.proofBase64)
  @IsString()
  @MinLength(3)
  proofMimeType?: string;
}