import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUserPayload } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Role, Roles, RolesGuard } from '../auth/guards/roles.guard.js';
import { WorkoutSessionService } from './workout-session.service.js';
type AuthedRequest = Request & { user: AuthUserPayload };
@ApiTags('workout-records')
@Controller('workout-records')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
@Roles(Role.MEMBER, Role.TRAINER, Role.GYM_ADMIN)
export class WorkoutRecordsController {
  constructor(private readonly sessions: WorkoutSessionService) {}

  @Get()
  @ApiOperation({ summary: 'Personal records from completed weighted sets' })
  list(
    @Req() req: AuthedRequest,
    @Query('exerciseId') exerciseId?: string,
    @Query('memberUserId') memberUserId?: string,
    @Query('gymSlug') gymSlug?: string,
  ) {
    return this.sessions.personalRecords(req.user, exerciseId, memberUserId, gymSlug);
  }

  @Get('exercises/:exerciseId')
  @ApiOperation({ summary: 'Personal records for one exercise' })
  exercise(
    @Req() req: AuthedRequest,
    @Param('exerciseId') id: string,
    @Query('memberUserId') memberUserId?: string,
    @Query('gymSlug') gymSlug?: string,
  ) {
    return this.sessions.personalRecords(req.user, id, memberUserId, gymSlug);
  }
}
