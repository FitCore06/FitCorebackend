import { Body, Controller, Delete, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUserPayload } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Role, Roles, RolesGuard } from '../auth/guards/roles.guard.js';
import { ScheduleService } from './schedule.service.js';

type AuthedRequest = Request & { user: AuthUserPayload };

@ApiTags('schedule')
@Controller('schedule')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ScheduleController {
  constructor(private readonly schedule: ScheduleService) {}

  @Get('me')
  @Roles(Role.TRAINER)
  mySchedule(@Req() req: AuthedRequest) {
    return this.schedule.mySchedule(req.user);
  }

  @Patch('blocks/:id/outcome')
  @Roles(Role.TRAINER)
  setOutcome(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: { outcome: string; note?: string; logDate?: string },
  ) {
    return this.schedule.setBlockOutcome(req.user, id, body.outcome, body.note, body.logDate);
  }

  @Delete('blocks/:id/outcome')
  @Roles(Role.TRAINER)
  clearOutcome(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body?: { logDate?: string },
  ) {
    return this.schedule.clearBlockOutcome(req.user, id, body?.logDate);
  }
}