import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUserPayload } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Role, Roles, RolesGuard } from '../auth/guards/roles.guard.js';
import { UpdateMemberProfileDto } from '../members/dto/update-member-profile.dto.js';
import { CreateTrainerLeaveRequestDto } from './dto/create-trainer-leave-request.dto.js';
import { CreateGymTrainerDto } from './dto/create-gym-trainer.dto.js';
import { ReviewTrainerLeaveRequestDto } from './dto/review-trainer-leave-request.dto.js';
import { TrainersService } from './trainers.service.js';

type AuthedRequest = Request & { user: AuthUserPayload };

@ApiTags('trainers')
@Controller('trainers')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class TrainersController {
  constructor(private readonly trainers: TrainersService) {}

  @Get()
  @Roles(Role.GYM_ADMIN)
  list(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    if (!gymSlug?.trim()) return [];
    return this.trainers.listForGym(req.user, gymSlug.trim());
  }

  @Post()
  @Roles(Role.GYM_ADMIN)
  create(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
    @Body() dto: CreateGymTrainerDto,
  ) {
    return this.trainers.createForGym(req.user, gymSlug, dto);
  }

  @Get('me/live')
  @Roles(Role.TRAINER)
  myLive(@Req() req: AuthedRequest) {
    return this.trainers.getLiveForTrainer(req.user);
  }

  @Patch('me/live')
  @Roles(Role.TRAINER)
  patchMyLive(
    @Req() req: AuthedRequest,
    @Body() body: { status: string; detail?: string },
  ) {
    return this.trainers.patchLive(req.user, body);
  }

  @Post('me/leave-requests')
  @Roles(Role.TRAINER)
  createLeaveRequest(
    @Req() req: AuthedRequest,
    @Body() dto: CreateTrainerLeaveRequestDto,
  ) {
    return this.trainers.createLeaveRequest(req.user, dto);
  }

  @Get('me/leave-requests')
  @Roles(Role.TRAINER)
  myLeaveRequests(@Req() req: AuthedRequest) {
    return this.trainers.listMyLeaveRequests(req.user);
  }

  @Get('leave-requests')
  @Roles(Role.GYM_ADMIN)
  leaveRequests(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
  ) {
    return this.trainers.listLeaveRequests(req.user, gymSlug);
  }

  @Patch('leave-requests/:requestId')
  @Roles(Role.GYM_ADMIN)
  reviewLeaveRequest(
    @Req() req: AuthedRequest,
    @Param('requestId') requestId: string,
    @Query('gymSlug') gymSlug: string,
    @Body() dto: ReviewTrainerLeaveRequestDto,
  ) {
    return this.trainers.reviewLeaveRequest(req.user, gymSlug, requestId, dto);
  }

  @Get('me/membership-feed')
  @Roles(Role.TRAINER)
  membershipFeed(@Req() req: AuthedRequest) {
    return this.trainers.feedForTrainer(req.user);
  }

  @Get('me/profile')
  @Roles(Role.TRAINER)
  myProfile(@Req() req: AuthedRequest) {
    return this.trainers.getMyProfile(req.user);
  }

  @Patch('me/profile')
  @Roles(Role.TRAINER)
  patchMyProfile(
    @Req() req: AuthedRequest,
    @Body() dto: UpdateMemberProfileDto,
  ) {
    return this.trainers.updateMyProfile(req.user, dto);
  }

  @Get('me/profile/photo')
  @Roles(Role.TRAINER)
  myProfilePhoto(@Req() req: AuthedRequest) {
    return this.trainers.getMyPhoto(req.user);
  }

  @Get(':trainerUserId/profile')
  @Roles(Role.MEMBER)
  trainerProfileForMember(
    @Req() req: AuthedRequest,
    @Param('trainerUserId') trainerUserId: string,
  ) {
    return this.trainers.getProfileForAssignedMember(req.user, trainerUserId);
  }

  @Get(':trainerUserId/profile/photo')
  @Roles(Role.MEMBER)
  trainerPhotoForMember(
    @Req() req: AuthedRequest,
    @Param('trainerUserId') trainerUserId: string,
  ) {
    return this.trainers.getPhotoForAssignedMember(req.user, trainerUserId);
  }

  @Get(':trainerUserId/live')
  @Roles(Role.MEMBER)
  trainerLive(
    @Req() req: AuthedRequest,
    @Param('trainerUserId') trainerUserId: string,
  ) {
    return this.trainers.getLiveByTrainerId(req.user, trainerUserId);
  }
}
