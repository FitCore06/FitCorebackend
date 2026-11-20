import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class RegisterAdminDto {
  @ApiProperty({ example: 'Arjun Patel' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'owner@gym.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Iron Forge Gym' })
  @IsString()
  @MinLength(2)
  gymName!: string;

  @ApiProperty({ example: 'iron-forge' })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'gymSlug must be lowercase letters, numbers, and hyphens only',
  })
  gymSlug!: string;
}