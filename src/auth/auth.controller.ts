import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { SecurityEventsService } from '../common/security/security-events.service.js';
import { getRequestContext } from '../common/security/request-context.js';
import {
  clearAuthCookies,
  readRefreshTokenCookie,
  setAuthCookies,
} from './auth-cookies.js';
import { AuthService } from './auth.service.js';
import type { AuthUserPayload } from './auth.types.js';
import type { AuthSession } from './auth.types.js';
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
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  private attachCookies(res: Response, session: AuthSession) {
    setAuthCookies(res, session, this.config);
  }

  private resolveRefreshToken(req: Request, dto: RefreshTokenDto): string {
    const token =
      dto.refreshToken?.trim() ?? readRefreshTokenCookie(req.cookies);
    if (!token) {
      throw new BadRequestException('Refresh token required');
    }
    return token;
  }

  @Get('signup-policy')
  @ApiOperation({ summary: 'Whether signup requires invite codes (public)' })
  signupPolicy() {
    return this.authService.getSignupPolicy();
  }

  @Post('register/admin')
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({ summary: 'Gym owner signup — creates gym + admin user' })
  async registerAdmin(
    @Body() dto: RegisterAdminDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.registerAdmin(dto);
    this.attachCookies(res, session);
    this.securityEvents.record('auth_success', {
      ip: getRequestContext()?.ip,
      path: '/auth/register/admin',
      requestId: getRequestContext()?.requestId,
    });
    return session;
  }

  @Post('register/member')
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({ summary: 'Member signup — joins existing gym by slug' })
  async registerMember(
    @Body() dto: RegisterMemberDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.registerMember(dto);
    this.attachCookies(res, session);
    this.securityEvents.record('auth_success', {
      ip: getRequestContext()?.ip,
      path: '/auth/register/member',
      requestId: getRequestContext()?.requestId,
    });
    return session;
  }

  @Post('login')
  @Throttle(LOGIN_THROTTLE)
  @ApiOperation({ summary: 'Login with email and password' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const session = await this.authService.login(dto);
      this.attachCookies(res, session);
      this.securityEvents.record('auth_success', {
        ip: getRequestContext()?.ip,
        path: '/auth/login',
        requestId: getRequestContext()?.requestId,
      });
      return session;
    } catch (e) {
      if (e instanceof UnauthorizedException) {
        this.securityEvents.record('auth_failure', {
          ip: getRequestContext()?.ip,
          path: '/auth/login',
          requestId: getRequestContext()?.requestId,
          detail: 'invalid_credentials',
        });
      }
      throw e;
    }
  }

  @Post('refresh')
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({ summary: 'Rotate access token using refresh token' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.refresh(this.resolveRefreshToken(req, dto));
    this.attachCookies(res, session);
    return session;
  }

  @Post('logout')
  @ApiOperation({ summary: 'Revoke refresh token' })
  async logout(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = this.resolveRefreshToken(req, dto);
    const result = await this.authService.logout(token);
    clearAuthCookies(res, this.config);
    return result;
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