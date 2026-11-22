import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUserPayload } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Role, Roles, RolesGuard } from '../auth/guards/roles.guard.js';
import { ModerateDirectoryReviewDto } from './dto/moderate-review.dto.js';
import { UpsertDirectoryProfileDto } from './dto/upsert-directory-profile.dto.js';
import { GymDirectoryService } from './gym-directory.service.js';

type AuthedRequest = Request & { user: AuthUserPayload };

@ApiTags('gym-directory-admin')
@Controller('gym-ops/directory')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class GymDirectoryAdminController {
  constructor(private readonly directory: GymDirectoryService) {}

  @Get('profile')
  @Roles(Role.GYM_ADMIN)
  getProfile(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    return this.directory.getOwnerProfile(req.user, gymSlug);
  }

  @Post('activate-subscription')
  @Roles(Role.GYM_ADMIN)
  activateSubscription(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    return this.directory.activateDirectorySubscription(req.user, gymSlug);
  }

  @Put('profile')
  @Roles(Role.GYM_ADMIN)
  upsertProfile(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
    @Body() dto: UpsertDirectoryProfileDto,
  ) {
    return this.directory.upsertOwnerProfile(req.user, gymSlug, dto);
  }

  @Get('reviews')
  @Roles(Role.GYM_ADMIN)
  listReviews(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    return this.directory.listOwnerReviews(req.user, gymSlug);
  }

  @Patch('reviews/:reviewId')
  @Roles(Role.GYM_ADMIN)
  moderateReview(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
    @Param('reviewId') reviewId: string,
    @Body() dto: ModerateDirectoryReviewDto,
  ) {
    return this.directory.moderateReview(req.user, gymSlug, reviewId, dto);
  }
}