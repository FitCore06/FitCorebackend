import {
  Body,
  Controller,
  Get,
  Param,
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
import { AttendanceService } from './attendance.service.js';
import { CreateStreakChallengeDto } from './dto/create-streak-challenge.dto.js';
import { DeclareStreakChallengeDto } from './dto/declare-streak-challenge.dto.js';
import { RespondStreakChallengeDto } from './dto/respond-streak-challenge.dto.js';
import { CheckInDto } from './dto/check-in.dto.js';
import { VerifyQrDto } from './dto/verify-qr.dto.js';
import { StreakChallengeService } from './streak-challenge.service.js';

type AuthedRequest = Request & { user: AuthUserPayload };

@ApiTags('attendance')
@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly streakChallenges: StreakChallengeService,
  ) {}

  @Post('check-in')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Member gym check-in (QR token)' })
  checkIn(@Req() req: AuthedRequest, @Body() dto: CheckInDto) {
    return this.attendance.checkIn(req.user, dto);
  }

  @Post('check-out')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'End current visit' })
  checkOut(@Req() req: AuthedRequest) {
    return this.attendance.checkOut(req.user);
  }

  @Get('me/active')
  @Roles(Role.MEMBER)
  active(@Req() req: AuthedRequest) {
    return this.attendance.myActive(req.user);
  }

  @Get('me/history')
  @Roles(Role.MEMBER)
  history(@Req() req: AuthedRequest) {
    return this.attendance.myHistory(req.user);
  }

  @Get('me/stats')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Streak and visits this month from check-ins' })
  myStats(@Req() req: AuthedRequest) {
    return this.attendance.myStats(req.user);
  }

  @Get('me/gym-pulse')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'How many members are checked in right now' })
  gymPulse(@Req() req: AuthedRequest) {
    return this.attendance.gymPulseForMember(req.user);
  }

  @Get('streak-leaderboard')
  @Roles(Role.MEMBER)
  @ApiOperation({
    summary:
      'Gym members ranked by workout-plan-aware check-in streak (name + streak only)',
  })
  streakLeaderboard(@Req() req: AuthedRequest) {
    return this.attendance.gymStreakLeaderboard(req.user);
  }

  @Get('streak-challenges')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Incoming, outgoing, and recent streak challenges' })
  listStreakChallenges(@Req() req: AuthedRequest) {
    return this.streakChallenges.listForMember(req.user);
  }

  @Get('streak-challenges/history')
  @Roles(Role.MEMBER)
  @ApiOperation({
    summary: 'Full archived challenge history with outcomes and set scores',
  })
  streakChallengeHistory(
    @Req() req: AuthedRequest,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const l = limit ? Number(limit) : undefined;
    const o = offset ? Number(offset) : undefined;
    return this.streakChallenges.historyForMember(req.user, {
      limit: Number.isFinite(l) ? l : undefined,
      offset: Number.isFinite(o) ? o : undefined,
    });
  }

  @Post('streak-challenges')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Challenge another gym member to a streak duel' })
  createStreakChallenge(
    @Req() req: AuthedRequest,
    @Body() dto: CreateStreakChallengeDto,
  ) {
    return this.streakChallenges.create(req.user, dto);
  }

  @Post('streak-challenges/:id/respond')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Accept or reject a streak challenge' })
  respondStreakChallenge(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: RespondStreakChallengeDto,
  ) {
    return this.streakChallenges.respond(req.user, id, dto);
  }

  @Post('streak-challenges/:id/cancel')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Challenger withdraws a pending streak challenge' })
  cancelStreakChallenge(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.streakChallenges.cancel(req.user, id);
  }

  @Post('streak-challenges/:id/start')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Start your side of an accepted challenge for today' })
  startStreakChallenge(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.streakChallenges.start(req.user, id);
  }

  @Post('streak-challenges/:id/sets/:setNumber/complete')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Mark one challenge set complete at target terms' })
  completeStreakChallengeSet(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('setNumber') setNumber: string,
  ) {
    return this.streakChallenges.completeSet(
      req.user,
      id,
      Number.parseInt(setNumber, 10),
    );
  }

  @Post('streak-challenges/:id/declare')
  @Roles(Role.MEMBER)
  @ApiOperation({
    summary: 'Claim win or concede when opponent cannot finish sets/weight',
  })
  declareStreakChallenge(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: DeclareStreakChallengeDto,
  ) {
    return this.streakChallenges.declare(req.user, id, dto);
  }

  @Post('verify-qr')
  @Roles(Role.GYM_ADMIN)
  @ApiOperation({ summary: 'Front-desk: validate signed member check-in QR' })
  verifyQr(@Req() req: AuthedRequest, @Body() dto: VerifyQrDto) {
    return this.attendance.verifyQrPayload(
      req.user,
      dto.gymSlug,
      dto.qrPayload,
    );
  }

  @Get('live')
  @Roles(Role.GYM_ADMIN)
  live(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    return this.attendance.liveForGym(req.user, gymSlug);
  }

  @Get()
  @Roles(Role.GYM_ADMIN)
  @ApiOperation({ summary: 'Recent visits for a gym' })
  recent(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
    @Query('limit') limit?: string,
  ) {
    const n = limit ? Number(limit) : 40;
    return this.attendance.recentForGym(req.user, gymSlug, Number.isNaN(n) ? 40 : n);
  }
}