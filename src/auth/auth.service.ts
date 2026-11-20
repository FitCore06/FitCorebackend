import {
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
import { PrismaService } from '../prisma/prisma.service.js';
import { type AuthTokens, type AuthUserPayload, Role } from './auth.types.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterAdminDto } from './dto/register-admin.dto.js';
import type { RegisterMemberDto } from './dto/register-member.dto.js';
import {
  devAuthLogin,
  devAuthResolveSub,
  devAuthRevoke,
  devAuthRotateRefresh,
  isDevAuthStubEnabled,
} from './dev-auth.stub.js';

const ACCESS_TTL_SECONDS = 60 * 15;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async registerAdmin(dto: RegisterAdminDto) {
    if (isDevAuthStubEnabled()) {
      throw new ServiceUnavailableException(
        'Postgres is offline. Use test logins (DEV_AUTH_STUB) or start Docker and run db:migrate.',
      );
    }
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
    await this.assertEmailAvailable(dto.email);

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.gymSlug.toLowerCase() },
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

  async validateUserId(userId: string): Promise<AuthUserPayload> {
    if (isDevAuthStubEnabled()) {
      const stub = devAuthResolveSub(userId);
      if (!stub) {
        throw new UnauthorizedException();
      }
      return stub;
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
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
}