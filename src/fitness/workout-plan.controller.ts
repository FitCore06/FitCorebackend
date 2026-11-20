import {
  Body,
  Controller,
  Delete,
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
  CreateWorkoutPlanAssignmentDto,
  CreateWorkoutPlanDto,
  QueryWorkoutPlanAssignmentDto,
  QueryWorkoutPlanDto,
  UpdateWorkoutPlanAssignmentDto,
  UpdateWorkoutPlanDto,
} from './dto/workout-plan.dto.js';
import { WorkoutPlanService } from './workout-plan.service.js';

type AuthedRequest = Request & { user: AuthUserPayload };

@ApiTags('workout-plans')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class WorkoutPlanController {
  constructor(private readonly service: WorkoutPlanService) {}

  // --- WORKOUT PLANS ---

  @Get('workout-plans')
  @Roles(Role.GYM_ADMIN, Role.TRAINER, Role.MEMBER)
  @ApiOperation({ summary: 'List workout plans' })
  listWorkoutPlans(@Req() req: AuthedRequest, @Query() query: QueryWorkoutPlanDto) {
    return this.service.listWorkoutPlans(req.user, query);
  }

  @Post('workout-plans')
  @Roles(Role.GYM_ADMIN, Role.TRAINER)
  @ApiOperation({ summary: 'Create a new workout plan' })
  createWorkoutPlan(
    @Req() req: AuthedRequest,
    @Body() dto: CreateWorkoutPlanDto,
    @Query('gymSlug') gymSlug?: string,
  ) {
    return this.service.createWorkoutPlan(req.user, dto, gymSlug);
  }

  @Get('workout-plans/:id')
  @Roles(Role.GYM_ADMIN, Role.TRAINER, Role.MEMBER)
  @ApiOperation({ summary: 'Get workout plan by ID' })
  getWorkoutPlan(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('gymSlug') gymSlug?: string,
  ) {
    return this.service.getWorkoutPlan(req.user, id, gymSlug);
  }

  @Patch('workout-plans/:id')
  @Roles(Role.GYM_ADMIN, Role.TRAINER)
  @ApiOperation({ summary: 'Update an existing workout plan' })
  updateWorkoutPlan(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateWorkoutPlanDto,
    @Query('gymSlug') gymSlug?: string,
  ) {
    return this.service.updateWorkoutPlan(req.user, id, dto, gymSlug);
  }

  @Delete('workout-plans/:id')
  @Roles(Role.GYM_ADMIN, Role.TRAINER)
  @ApiOperation({ summary: 'Delete or archive a workout plan' })
  deleteWorkoutPlan(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('gymSlug') gymSlug?: string,
  ) {
    return this.service.deleteWorkoutPlan(req.user, id, gymSlug);
  }

  @Post('workout-plans/:id/duplicate')
  @Roles(Role.GYM_ADMIN, Role.TRAINER)
  @ApiOperation({ summary: 'Duplicate a workout plan' })
  duplicateWorkoutPlan(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('gymSlug') gymSlug?: string,
  ) {
    return this.service.duplicateWorkoutPlan(req.user, id, gymSlug);
  }

  @Post('workout-plans/:id/publish')
  @Roles(Role.GYM_ADMIN, Role.TRAINER)
  @ApiOperation({ summary: 'Publish a draft workout plan' })
  publishWorkoutPlan(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('gymSlug') gymSlug?: string,
  ) {
    return this.service.publishWorkoutPlan(req.user, id, gymSlug);
  }

  // --- WORKOUT ASSIGNMENTS ---

  @Get('workout-assignments')
  @Roles(Role.GYM_ADMIN, Role.TRAINER, Role.MEMBER)
  @ApiOperation({ summary: 'List workout plan assignments' })
  listAssignments(
    @Req() req: AuthedRequest,
    @Query() query: QueryWorkoutPlanAssignmentDto,
  ) {
    return this.service.listAssignments(req.user, query);
  }

  @Get('workout-assignments/my-plan')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Get current member active assigned workout plan' })
  getMyPlan(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug?: string) {
    return this.service.getMyCurrentWorkoutPlan(req.user, gymSlug);
  }

  @Post('workout-assignments')
  @Roles(Role.GYM_ADMIN, Role.TRAINER)
  @ApiOperation({ summary: 'Assign a workout plan to a member' })
  createAssignment(
    @Req() req: AuthedRequest,
    @Body() dto: CreateWorkoutPlanAssignmentDto,
    @Query('gymSlug') gymSlug?: string,
  ) {
    return this.service.createAssignment(req.user, dto, gymSlug);
  }

  @Get('workout-assignments/:id')
  @Roles(Role.GYM_ADMIN, Role.TRAINER, Role.MEMBER)
  @ApiOperation({ summary: 'Get assignment by ID' })
  getAssignment(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('gymSlug') gymSlug?: string,
  ) {
    return this.service.getAssignment(req.user, id, gymSlug);
  }

  @Patch('workout-assignments/:id')
  @Roles(Role.GYM_ADMIN, Role.TRAINER)
  @ApiOperation({ summary: 'Update assignment details' })
  updateAssignment(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateWorkoutPlanAssignmentDto,
    @Query('gymSlug') gymSlug?: string,
  ) {
    return this.service.updateAssignment(req.user, id, dto, gymSlug);
  }

  @Post('workout-assignments/:id/end')
  @Roles(Role.GYM_ADMIN, Role.TRAINER)
  @ApiOperation({ summary: 'End or complete an active workout assignment' })
  endAssignment(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('gymSlug') gymSlug?: string,
  ) {
    return this.service.endAssignment(req.user, id, gymSlug);
  }
}

