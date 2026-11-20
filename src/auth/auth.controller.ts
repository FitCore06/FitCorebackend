import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import type { AuthUserPayload } from './auth.types.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { RegisterAdminDto } from './dto/register-admin.dto.js';
import { RegisterMemberDto } from './dto/register-member.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

type AuthedRequest = Request & { user: AuthUserPayload };

const loginLimit = Number(process.env.AUTH_LOGIN_THROTTLE_LIMIT ?? 10);
const authLimit = Number(process.env.AUTH_PUBLIC_THROTTLE_LIMIT ?? 20);
const AUTH_THROTTLE = { auth: { ttl: 60_000, limit: authLimit } };
const LOGIN_THROTTLE = { auth: { ttl: 60_000, limit: loginLimit } };

@ApiTags('auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register/admin')
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({ summary: 'Gym owner signup — creates gym + admin user' })
  registerAdmin(@Body() dto: RegisterAdminDto) {
    return this.authService.registerAdmin(dto);
  }

  @Post('register/member')
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({ summary: 'Member signup — joins existing gym by slug' })
  registerMember(@Body() dto: RegisterMemberDto) {
    return this.authService.registerMember(dto);
  }

  @Post('login')
  @Throttle(LOGIN_THROTTLE)
  @ApiOperation({ summary: 'Login with email and password' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Rotate access token using refresh token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Revoke refresh token' })
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user profile' })
  me(@Req() req: AuthedRequest) {
    return req.user;
  }

  @Post('forgot-password')
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({ summary: 'Request a password reset email' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Set a new password using reset token' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPasswordWithToken(dto);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password while signed in' })
  changePassword(@Req() req: AuthedRequest, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.id, dto);
  }
}