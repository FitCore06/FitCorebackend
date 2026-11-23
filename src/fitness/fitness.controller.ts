import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUserPayload } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Role, Roles, RolesGuard } from '../auth/guards/roles.guard.js';
import { AssignPlanDto } from './dto/assign-plan.dto.js';
import { PatchDietMealDto } from './dto/patch-diet-meal.dto.js';
import { PatchWorkoutSetDto } from './dto/patch-workout-set.dto.js';
import { UpsertDietTemplateDto } from './dto/upsert-diet-template.dto.js';
import { UpsertWorkoutTemplateDto } from './dto/upsert-workout-template.dto.js';
import { FitnessService } from './fitness.service.js';

type AuthedRequest = Request & { user: AuthUserPayload };

@ApiTags('fitness')
@Controller('fitness')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class FitnessController {
  constructor(private readonly fitness: FitnessService) {}

  @Get('workout-templates')
  @Roles(Role.GYM_ADMIN, Role.TRAINER)
  listWorkout(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
  ) {
    return this.fitness.listWorkoutTemplates(req.user, gymSlug);
  }

  @Post('workout-templates')
  @Roles(Role.GYM_ADMIN, Role.TRAINER)
  upsertWorkout(
    @Req() req: AuthedRequest,
    @Body() dto: UpsertWorkoutTemplateDto,
  ) {
    return this.fitness.upsertWorkoutTemplate(req.user, dto);
  }

  @Delete('workout-templates/:id')
  @Roles(Role.GYM_ADMIN, Role.TRAINER)
  deleteWorkout(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('gymSlug') gymSlug?: string,
  ) {
    return this.fitness.deleteWorkoutTemplate(req.user, id, gymSlug);
  }

  @Get('diet-templates')
  @Roles(Role.GYM_ADMIN, Role.TRAINER)
  listDiet(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    return this.fitness.listDietTemplates(req.user, gymSlug);
  }

  @Post('diet-templates')
  @Roles(Role.GYM_ADMIN, Role.TRAINER)
  upsertDiet(@Req() req: AuthedRequest, @Body() dto: UpsertDietTemplateDto) {
    return this.fitness.upsertDietTemplate(req.user, dto);
  }

  @Delete('diet-templates/:id')
  @Roles(Role.GYM_ADMIN, Role.TRAINER)
  deleteDiet(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('gymSlug') gymSlug?: string,
  ) {
    return this.fitness.deleteDietTemplate(req.user, id, gymSlug);
  }

  @Post('assignments/workout')
  @Roles(Role.GYM_ADMIN, Role.TRAINER)
  assignWorkout(@Req() req: AuthedRequest, @Body() dto: AssignPlanDto) {
    return this.fitness.assignWorkout(req.user, dto);
  }

  @Post('assignments/diet')
  @Roles(Role.GYM_ADMIN, Role.TRAINER)
  assignDiet(@Req() req: AuthedRequest, @Body() dto: AssignPlanDto) {
    return this.fitness.assignDiet(req.user, dto);
  }

  @Get('plans/me/workout')
  @Roles(Role.MEMBER)
  myWorkout(@Req() req: AuthedRequest) {
    return this.fitness.myWorkoutPlan(req.user);
  }

  @Get('weekly-plan/me/builder')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Member custom draft + whether trainer plan is active' })
  myWeeklyBuilder(@Req() req: AuthedRequest) {
    return this.fitness.myWeeklyPlanBuilderState(req.user);
  }

  @Put('weekly-plan/me')
  @Roles(Role.MEMBER)
  saveWeekly(
    @Req() req: AuthedRequest,
    @Body() plan: import('./fitness.types.js').WeeklyWorkoutPlanDto,
  ) {
    return this.fitness.saveMyWeeklyPlan(req.user, plan);
  }

  @Put('weekly-plan/assign')
  @Roles(Role.GYM_ADMIN, Role.TRAINER)
  assignWeekly(
    @Req() req: AuthedRequest,
    @Body()
    body: {
      memberEmail: string;
      gymSlug?: string;
      plan: import('./fitness.types.js').WeeklyWorkoutPlanDto;
    },
  ) {
    return this.fitness.assignMemberWeeklyPlan(
      req.user,
      body.memberEmail,
      body.plan,
      body.gymSlug,
    );
  }

  @Get('plans/me/diet')
  @Roles(Role.MEMBER)
  myDiet(@Req() req: AuthedRequest) {
    return this.fitness.myDietPlan(req.user);
  }

  @Get('logs/workout/activity')
  @Roles(Role.MEMBER)
  workoutActivity(
    @Req() req: AuthedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.fitness.workoutSetActivityByDate(req.user, from, to);
  }

  @Get('logs/workout/weight-total')
  @Roles(Role.MEMBER)
  workoutWeightTotal(
    @Req() req: AuthedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.fitness.sumLoggedWeightKg(req.user, from, to);
  }

  @Get('logs/workout')
  @Roles(Role.MEMBER)
  workoutLogs(
    @Req() req: AuthedRequest,
    @Query('dayId') dayId: string,
    @Query('date') date?: string,
  ) {
    return this.fitness.listWorkoutSetLogs(req.user, dayId, date);
  }

  @Patch('logs/workout')
  @Roles(Role.MEMBER)
  patchWorkoutLog(@Req() req: AuthedRequest, @Body() dto: PatchWorkoutSetDto) {
    return this.fitness.patchWorkoutSet(req.user, dto);
  }

  @Get('logs/diet')
  @Roles(Role.MEMBER)
  dietLogs(@Req() req: AuthedRequest, @Query('date') date?: string) {
    return this.fitness.listDietMealLogs(req.user, date);
  }

  @Patch('logs/diet')
  @Roles(Role.MEMBER)
  patchDietLog(@Req() req: AuthedRequest, @Body() dto: PatchDietMealDto) {
    return this.fitness.patchDietMeal(req.user, dto);
  }

  @Get('logs/workout/member')
  @Roles(Role.TRAINER, Role.GYM_ADMIN)
  memberWorkoutLogs(
    @Req() req: AuthedRequest,
    @Query('memberEmail') memberEmail: string,
    @Query('dayId') dayId: string,
    @Query('date') date?: string,
  ) {
    return this.fitness.trainerMemberWorkoutStatus(
      req.user,
      memberEmail,
      dayId,
      date,
    );
  }

  @Get('logs/diet/member')
  @Roles(Role.TRAINER, Role.GYM_ADMIN)
  memberDietLogs(
    @Req() req: AuthedRequest,
    @Query('memberEmail') memberEmail: string,
    @Query('date') date?: string,
  ) {
    return this.fitness.trainerMemberDietStatus(req.user, memberEmail, date);
  }
}