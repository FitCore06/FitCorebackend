import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUserPayload } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Role, Roles, RolesGuard } from '../auth/guards/roles.guard.js';
import {
  CancelWorkoutSessionDto,
  CompleteWorkoutSessionSetDto,
  FinishWorkoutSessionDto,
  StartWorkoutSessionDto,
  UpdateWorkoutSessionSetDto,
} from './dto/workout-session.dto.js';
import { WorkoutSessionService } from './workout-session.service.js';

type AuthedRequest = Request & { user: AuthUserPayload };

@ApiTags('workout-sessions')
@Controller('workout-sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class WorkoutSessionController {
  constructor(private readonly service: WorkoutSessionService) {}

  @Post('start')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Start a new active workout session' })
  startSession(
    @Req() req: AuthedRequest,
    @Body() dto: StartWorkoutSessionDto,
    @Query('gymSlug') gymSlug?: string,
  ) {
    return this.service.startSession(req.user, dto, gymSlug);
  }

  @Get('active')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Recover currently active or paused workout session' })
  getActiveSession(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug?: string) {
    return this.service.getActiveSession(req.user, gymSlug);
  }

  @Get(':id')
  @Roles(Role.MEMBER, Role.TRAINER, Role.GYM_ADMIN)
  @ApiOperation({ summary: 'Get session details by ID' })
  getSession(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('gymSlug') gymSlug?: string,
  ) {
    return this.service.getSession(req.user, id, gymSlug);
  }

  @Post(':id/pause')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Pause an active workout session' })
  pauseSession(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('gymSlug') gymSlug?: string,
  ) {
    return this.service.pauseSession(req.user, id, gymSlug);
  }

  @Post(':id/resume')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Resume a paused workout session' })
  resumeSession(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('gymSlug') gymSlug?: string,
  ) {
    return this.service.resumeSession(req.user, id, gymSlug);
  }

  @Patch(':id/sets/:setId')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Update actual weight/reps for a session set' })
  updateSet(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('setId') setId: string,
    @Body() dto: UpdateWorkoutSessionSetDto,
    @Query('gymSlug') gymSlug?: string,
  ) {
    return this.service.updateSet(req.user, id, setId, dto, gymSlug);
  }

  @Post(':id/sets/:setId/complete')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Mark set as completed with timestamp' })
  completeSet(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('setId') setId: string,
    @Body() dto: CompleteWorkoutSessionSetDto,
    @Query('gymSlug') gymSlug?: string,
  ) {
    return this.service.completeSet(req.user, id, setId, dto, gymSlug);
  }

  @Post(':id/finish')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Finish and complete workout session' })
  finishSession(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: FinishWorkoutSessionDto,
    @Query('gymSlug') gymSlug?: string,
  ) {
    return this.service.finishSession(req.user, id, dto, gymSlug);
  }

  @Post(':id/cancel')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Cancel active workout session' })
  cancelSession(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: CancelWorkoutSessionDto,
    @Query('gymSlug') gymSlug?: string,
  ) {
    return this.service.cancelSession(req.user, id, dto, gymSlug);
  }
}

