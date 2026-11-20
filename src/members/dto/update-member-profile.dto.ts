import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateMemberProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4_000_000)
  profilePhotoBase64?: string;

  @ValidateIf((o: UpdateMemberProfileDto) => !!o.profilePhotoBase64)
  @IsString()
  @MinLength(3)
  profilePhotoMimeType?: string;

  @IsOptional()
  @IsBoolean()
  clearProfilePhoto?: boolean;
}