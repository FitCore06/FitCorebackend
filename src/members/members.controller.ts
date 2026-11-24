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
import { UpdateMemberProfileDto } from './dto/update-member-profile.dto.js';
import { CreateGymMemberDto } from './dto/create-gym-member.dto.js';
import { MembersService } from './members.service.js';

type AuthedRequest = Request & { user: AuthUserPayload };

@ApiTags('members')
@Controller('members')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @Roles(Role.GYM_ADMIN)
  @ApiOperation({ summary: 'Members enrolled at a gym' })
  list(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    if (!gymSlug?.trim()) return [];
    return this.members.listForGym(req.user, gymSlug.trim());
  }

  @Post()
  @Roles(Role.GYM_ADMIN)
  @ApiOperation({ summary: 'Gym admin creates a member in their own tenant' })
  create(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
    @Body() dto: CreateGymMemberDto,
  ) {
    return this.members.createForGym(req.user, gymSlug.trim(), dto);
  }

  @Post('registration-invites')
  @Roles(Role.GYM_ADMIN)
  @ApiOperation({ summary: 'Issue a single-use invite for public member signup' })
  createRegistrationInvite(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
    @Body() body: { email?: string },
  ) {
    return this.members.createMemberRegistrationInvite(
      req.user,
      gymSlug.trim(),
      body.email,
    );
  }

  @Get('me/body-weight')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Body weight log history for progress charts' })
  listMyBodyWeight(
    @Req() req: AuthedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.members.listMyBodyWeight(req.user, from, to);
  }

  @Post('me/body-weight')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Log or update body weight for a date' })
  logMyBodyWeight(
    @Req() req: AuthedRequest,
    @Body() body: { logDate: string; weightKg: number; targetKg?: number },
  ) {
    return this.members.upsertMyBodyWeight(req.user, body);
  }

  @Get('me/membership-renewal')
  @Roles(Role.MEMBER)
  @ApiOperation({
    summary: 'Active gym membership plan and renewal amount for billing',
  })
  myMembershipRenewal(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
  ) {
    return this.members.getMyMembershipRenewal(req.user, gymSlug.trim());
  }

  @Get('me/membership-plans')
  @Roles(Role.MEMBER)
  @ApiOperation({
    summary: 'Gym membership plans available for purchase at this gym',
  })
  myMembershipPlans(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
  ) {
    return this.members.listMyMembershipPlans(req.user, gymSlug.trim());
  }

  @Get('me/profile')
  @Roles(Role.MEMBER)
  myProfile(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    return this.members.getMyProfile(req.user, gymSlug.trim());
  }

  @Patch('me/profile')
  @Roles(Role.MEMBER)
  updateMyProfile(
    @Req() req: AuthedRequest,
    @Body() dto: UpdateMemberProfileDto,
  ) {
    return this.members.updateMyProfile(req.user, dto);
  }

  @Get('me/profile/photo')
  @Roles(Role.MEMBER)
  myPhoto(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    return this.members.getMyPhoto(req.user, gymSlug.trim());
  }

  @Get('gym-peers/:userId/profile/photo')
  @Roles(Role.MEMBER)
  @ApiOperation({
    summary: 'Profile photo of another member in the same gym (e.g. streak board)',
  })
  gymPeerPhoto(
    @Req() req: AuthedRequest,
    @Param('userId') userId: string,
  ) {
    return this.members.getGymPeerPhoto(req.user, userId);
  }

  @Get(':userId/profile')
  @Roles(Role.GYM_ADMIN)
  memberProfile(
    @Req() req: AuthedRequest,
    @Param('userId') userId: string,
    @Query('gymSlug') gymSlug: string,
  ) {
    return this.members.getMemberProfile(req.user, gymSlug.trim(), userId);
  }

  @Get(':userId/profile/photo')
  @Roles(Role.GYM_ADMIN)
  memberPhoto(
    @Req() req: AuthedRequest,
    @Param('userId') userId: string,
    @Query('gymSlug') gymSlug: string,
  ) {
    return this.members.getMemberPhoto(req.user, gymSlug.trim(), userId);
  }
}
