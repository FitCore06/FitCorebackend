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
import { CreateMemberIssueDto } from './dto/create-member-issue.dto.js';
import { CreateTrainerFeedbackDto } from './dto/create-trainer-feedback.dto.js';
import { UpdateIssueStatusDto } from './dto/update-issue-status.dto.js';
import { FeedbackService } from './feedback.service.js';

type AuthedRequest = Request & { user: AuthUserPayload };

@ApiTags('feedback')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get('feedback/me')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Member trainer ratings' })
  listMyFeedback(@Req() req: AuthedRequest) {
    return this.feedback.listMyFeedback(req.user);
  }

  @Get('feedback')
  @Roles(Role.GYM_ADMIN)
  @ApiOperation({ summary: 'All trainer feedback for a gym' })
  listGymFeedback(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
  ) {
    return this.feedback.listGymFeedback(req.user, gymSlug);
  }

  @Get('feedback/averages')
  @Roles(Role.GYM_ADMIN, Role.MEMBER)
  @ApiOperation({ summary: 'Average trainer ratings by trainer id' })
  averages(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    return this.feedback.trainerAverages(req.user, gymSlug);
  }

  @Post('feedback')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Submit trainer rating' })
  createFeedback(
    @Req() req: AuthedRequest,
    @Body() dto: CreateTrainerFeedbackDto,
  ) {
    return this.feedback.submitTrainerFeedback(req.user, dto);
  }

  @Get('issues/me')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Member issue reports' })
  listMyIssues(@Req() req: AuthedRequest) {
    return this.feedback.listMyIssues(req.user);
  }

  @Get('issues')
  @Roles(Role.GYM_ADMIN)
  @ApiOperation({ summary: 'All member issues for a gym' })
  listGymIssues(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    return this.feedback.listGymIssues(req.user, gymSlug);
  }

  @Post('issues')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Report gym / equipment issue' })
  createIssue(@Req() req: AuthedRequest, @Body() dto: CreateMemberIssueDto) {
    return this.feedback.createIssue(req.user, dto);
  }

  @Patch('issues/:id/status')
  @Roles(Role.GYM_ADMIN)
  @ApiOperation({ summary: 'Update issue workflow status' })
  patchIssueStatus(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateIssueStatusDto,
  ) {
    return this.feedback.updateIssueStatus(req.user, id, dto.status);
  }
}