import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type AuthTokens, type AuthUserPayload, Role } from './auth.types.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterAdminDto } from './dto/register-admin.dto.js';
import type { RegisterMemberDto } from './dto/register-member.dto.js';
import {
  devAuthChangePassword,
  devAuthForgotPassword,
  devAuthLogin,
  devAuthResetPassword,
  devAuthResolveSub,
  devAuthRevoke,
  devAuthRotateRefresh,
  isDevAuthStubEnabled,
} from './dev-auth.stub.js';
import type { ChangePasswordDto } from './dto/change-password.dto.js';
import type { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import type { ResetPasswordDto } from './dto/reset-password.dto.js';
import { RegistrationInviteService } from './registration-invite.service.js';

const ACCESS_TTL_SECONDS = 60 * 15;
const FORGOT_PASSWORD_GENERIC_MESSAGE =
  'If this email is registered with Athra, you will receive password reset instructions shortly.';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly registrationInvites: RegistrationInviteService,
  ) {}

  isOwnerInviteRequired() {
    return this.config.get<string>('ALLOW_OWNER_REGISTRATION_WITHOUT_INVITE') !== 'true';
  }

  getSignupPolicy() {
    return {
      ownerInviteRequired: this.isOwnerInviteRequired(),
      /** Gym invite code required (same value as owner gym URL id / slug). */
      memberInviteRequired: true,
    };
  }

  async registerAdmin(dto: RegisterAdminDto) {
    if (isDevAuthStubEnabled()) {
      throw new ServiceUnavailableException(
        'Postgres is offline. Use test logins (DEV_AUTH_STUB) or start Docker and run db:migrate.',
      );
    }
    await this.enforceOwnerInviteForRegistration(dto.inviteToken, dto.email);
    await this.assertEmailAvailable(dto.email);
    await this.assertSlugAvailable(dto.gymSlug);

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          name: dto.name.trim(),
          passwordHash,
        },
      });

      const tenant = await tx.tenant.create({
        data: {
          name: dto.gymName.trim(),
          slug: dto.gymSlug.toLowerCase(),
        },
      });

      await tx.branch.create({
        data: {
          gymId: tenant.id,
          name: 'Main branch',
        },
      });

      await tx.userTenantRole.create({
        data: {
          userId: user.id,
          gymId: tenant.id,
          role: Role.GYM_ADMIN,
        },
      });

      return user;
    });

    return this.issueSession(result.id);
  }

  async registerMember(dto: RegisterMemberDto) {
    if (isDevAuthStubEnabled()) {
      throw new ServiceUnavailableException(
        'Postgres is offline. Use test logins or start Docker and run db:seed.',
      );
    }
    const gymId = await this.resolveMemberRegistrationGymId(dto);
    await this.assertEmailAvailable(dto.email);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: gymId },
    });
    if (!tenant) {
      throw new NotFoundException('Gym not found for this code');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          name: dto.name.trim(),
          phone: dto.phone?.trim(),
          passwordHash,
        },
      });

      await tx.userTenantRole.create({
        data: {
          userId: created.id,
          gymId: tenant.id,
          role: Role.MEMBER,
        },
      });

      return created;
    });

    return this.issueSession(user.id);
  }

  private async resolveMemberRegistrationGymId(
    dto: RegisterMemberDto,
  ): Promise<string> {
    const inviteTrimmed = dto.inviteToken?.trim() ?? '';
    if (!inviteTrimmed) {
      throw new BadRequestException(
        'Gym invite code is required — the same code the owner chose at signup (Settings → Gym URL id).',
      );
    }
    const { gymId } = await this.registrationInvites.consumeMemberInvite(
      inviteTrimmed,
      dto.email,
      dto.gymSlug,
    );
    return gymId;
  }

  async login(dto: LoginDto) {
    if (isDevAuthStubEnabled()) {
      try {
        const { user, tokens } = devAuthLogin(dto.email, dto.password);
        const accessToken = await this.signAccessToken(user.id);
        return {
          user,
          accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: ACCESS_TTL_SECONDS,
        };
      } catch {
        throw new UnauthorizedException('Invalid email or password');
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.issueSession(user.id);
  }

  async refresh(refreshToken: string) {
    if (isDevAuthStubEnabled()) {
      const rotated = devAuthRotateRefresh(refreshToken);
      if (!rotated) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      const accessToken = await this.signAccessToken(rotated.user.id);
      return {
        user: rotated.user,
        accessToken,
        refreshToken: rotated.refreshToken,
        expiresIn: ACCESS_TTL_SECONDS,
      };
    }

    const hash = this.hashToken(refreshToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hash },
      include: { user: true },
    });

    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    return this.issueSession(record.userId);
  }

  async logout(refreshToken: string) {
    if (isDevAuthStubEnabled()) {
      devAuthRevoke(refreshToken);
      return { ok: true };
    }

    const hash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async getProfile(userId: string): Promise<AuthUserPayload> {
    return this.buildUserPayload(userId);
  }

  async requestPasswordReset(dto: ForgotPasswordDto) {
    const email = dto.email.toLowerCase().trim();
    const exposeLink = this.shouldExposeResetLink();

    if (isDevAuthStubEnabled()) {
      const { issued, token } = devAuthForgotPassword(email);
      if (!issued || !token) {
        return this.uniformForgotPasswordResponse();
      }
      const base = this.getPublicAppUrl();
      if (!base) {
        throw new ServiceUnavailableException(
          'Set APP_PUBLIC_URL on the API to build reset links.',
        );
      }
      const resetLink = `${base}/reset-password?token=${encodeURIComponent(token)}`;
      await this.mail.sendPasswordResetEmail({
        to: email,
        name: email.split('@')[0] ?? 'there',
        resetLink,
      });
      return this.uniformForgotPasswordResponse(
        exposeLink ? { resetLink } : undefined,
      );
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return this.uniformForgotPasswordResponse();
    }

    const base = this.getPublicAppUrl();
    if (!base) {
      throw new ServiceUnavailableException(
        'Password reset is not configured. Set APP_PUBLIC_URL on the API server.',
      );
    }

    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });

    const resetLink = `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
    const emailSent = await this.mail.sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetLink,
    });

    return this.uniformForgotPasswordResponse(
      exposeLink && !emailSent ? { resetLink } : undefined,
    );
  }

  async resetPasswordWithToken(dto: ResetPasswordDto) {
    if (isDevAuthStubEnabled()) {
      const ok = devAuthResetPassword(dto.token, dto.password);
      if (!ok) {
        throw new UnauthorizedException('Reset link is invalid or expired');
      }
      return { ok: true as const };
    }

    const tokenHash = this.hashToken(dto.token);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !record ||
      record.usedAt ||
      record.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Reset link is invalid or expired');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      });
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      await tx.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    return { ok: true as const };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    if (isDevAuthStubEnabled()) {
      const stub = devAuthResolveSub(userId);
      if (!stub) {
        throw new UnauthorizedException();
      }
      const ok = devAuthChangePassword(
        stub.email,
        dto.currentPassword,
        dto.newPassword,
      );
      if (!ok) {
        throw new UnauthorizedException('Current password is incorrect');
      }
      return { ok: true as const };
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    return { ok: true as const };
  }

  async validateUserId(userId: string): Promise<AuthUserPayload> {
    if (isDevAuthStubEnabled()) {
      const stub = devAuthResolveSub(userId);
      if (!stub) {
        throw new UnauthorizedException();
      }
      return stub;
    }

    return this.buildUserPayload(userId);
  }

  private async issueSession(userId: string) {
    const user = await this.buildUserPayload(userId);
    const tokens = await this.createTokens(userId);
    return { user, ...tokens };
  }

  private async buildUserPayload(userId: string): Promise<AuthUserPayload> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        tenantRoles: {
          include: { tenant: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      roles: user.tenantRoles.map((r) => ({
        gymId: r.gymId,
        gymSlug: r.tenant.slug,
        gymName: r.tenant.name,
        role: r.role,
      })),
    };
  }

  private signAccessToken(userId: string) {
    return this.jwt.signAsync(
      { sub: userId },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: ACCESS_TTL_SECONDS,
      },
    );
  }

  private async createTokens(userId: string): Promise<AuthTokens> {
    const accessToken = await this.signAccessToken(userId);

    const refreshToken = randomBytes(48).toString('base64url');
    const tokenHash = this.hashToken(refreshToken);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TTL_SECONDS,
    };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async enforceOwnerInviteForRegistration(
    inviteToken: string | undefined,
    email: string,
  ) {
    const trimmed = inviteToken?.trim() ?? '';
    if (!this.isOwnerInviteRequired()) {
      if (trimmed) {
        await this.registrationInvites.consumeOwnerInvite(trimmed, email);
      }
      return;
    }
    if (!trimmed) {
      throw new BadRequestException(
        'Owner invite code is required. Use the code Athra sent you, or ask support to enable open owner signup.',
      );
    }
    await this.registrationInvites.consumeOwnerInvite(trimmed, email);
  }

  private async assertEmailAvailable(email: string) {
    const exists = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (exists) {
      throw new ConflictException('Email is already registered');
    }
  }

  private async assertSlugAvailable(slug: string) {
    const exists = await this.prisma.tenant.findUnique({
      where: { slug: slug.toLowerCase() },
    });
    if (exists) {
      throw new ConflictException('Gym URL slug is already taken');
    }
  }

  private uniformForgotPasswordResponse(extras?: { resetLink?: string }) {
    return {
      ok: true as const,
      message: FORGOT_PASSWORD_GENERIC_MESSAGE,
      ...(extras?.resetLink ? { resetLink: extras.resetLink } : {}),
    };
  }

  private getPublicAppUrl(): string | null {
    const raw =
      this.config.get<string>('APP_PUBLIC_URL') ??
      this.config.get<string>('PASSWORD_RESET_APP_URL');
    if (!raw?.trim()) return null;
    return raw.replace(/\/$/, '');
  }

  private shouldExposeResetLink(): boolean {
    if (this.config.get<string>('PASSWORD_RESET_EXPOSE_LINK') === 'true') {
      return true;
    }
    return this.config.get<string>('NODE_ENV') !== 'production';
  }
}
