import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUserPayload } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Role, Roles, RolesGuard } from '../auth/guards/roles.guard.js';
import { gymRole } from '../auth/guards/roles.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from './audit.service.js';

type AuthedRequest = Request & { user: AuthUserPayload };

@ApiTags('audit')
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AuditController {
  constructor(
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Roles(Role.GYM_ADMIN)
  async list(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
    @Query('limit') limit?: string,
  ) {
    const admin = gymRole(req.user, Role.GYM_ADMIN, gymSlug);
    if (!admin) return [];
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: gymSlug.toLowerCase() },
    });
    if (!tenant) return [];
    const n = limit ? Number(limit) : 40;
    const rows = await this.audit.listForGym(
      tenant.id,
      Number.isNaN(n) ? 40 : Math.min(n, 100),
    );
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      resource: r.resource,
      at: r.createdAt.toISOString(),
      user: r.user
        ? { name: r.user.name, email: r.user.email }
        : null,
    }));
  }
}