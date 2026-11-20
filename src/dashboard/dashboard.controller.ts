import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUserPayload } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Role, Roles, RolesGuard } from '../auth/guards/roles.guard.js';
import { DashboardService } from './dashboard.service.js';

type AuthedRequest = Request & { user: AuthUserPayload };

@ApiTags('dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @Roles(Role.GYM_ADMIN)
  summary(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    return this.dashboard.summary(req.user, gymSlug);
  }

  @Get('member-home')
  @Roles(Role.MEMBER)
  memberHome(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
    @Query('dayId') dayId: string,
  ) {
    return this.dashboard.memberHome(req.user, gymSlug, dayId);
  }
}
