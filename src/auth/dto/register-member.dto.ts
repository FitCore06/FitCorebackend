import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class RegisterMemberDto {
  @ApiProperty({ example: 'Rahul Sharma' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'member@gym.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({
    example: 'iron-forge',
    description:
      'Optional — member invite already identifies the gym. Only needed for legacy clients.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  gymSlug?: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    example: 'gold-gym-06',
    description: 'Gym invite code — same as the owner gym URL id (slug)',
  })
  @IsString()
  @MinLength(3)
  inviteToken!: string;
}