import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUserPayload } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Role, Roles, RolesGuard } from '../auth/guards/roles.guard.js';
import { WorkoutSessionService } from './workout-session.service.js';
type AuthedRequest = Request & { user: AuthUserPayload };
@ApiTags('workout-history')
@Controller('workout-history')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
@Roles(Role.MEMBER, Role.TRAINER, Role.GYM_ADMIN)
export class WorkoutHistoryController {
  constructor(private readonly sessions: WorkoutSessionService) {}

  @Get('activity-calendar')
  @ApiOperation({
    summary: 'Per-day training time, volume, and sets (sessions + logs)',
  })
  activityCalendar(
    @Req() req: AuthedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.sessions.activityCalendar(req.user, from, to);
  }

  @Get()
  @ApiOperation({ summary: 'Completed workout history for member or trainer clients' })
  list(@Req() req: AuthedRequest, @Query() query: any) {
    return this.sessions.completedHistory(req.user, query);
  }

  @Get('exercises/:exerciseId')
  @ApiOperation({ summary: 'Completed set performance for one exercise' })
  exercise(
    @Req() req: AuthedRequest,
    @Param('exerciseId') id: string,
    @Query('memberUserId') memberUserId?: string,
    @Query('gymSlug') gymSlug?: string,
  ) {
    return this.sessions.exercisePerformance(req.user, id, memberUserId, gymSlug);
  }

  @Get(':sessionId')
  @ApiOperation({ summary: 'Completed workout session detail' })
  detail(
    @Req() req: AuthedRequest,
    @Param('sessionId') id: string,
    @Query('gymSlug') gymSlug?: string,
  ) {
    return this.sessions.completedHistoryDetail(req.user, id, gymSlug);
  }
}
