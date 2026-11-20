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
  CreateExerciseDto,
  QueryExerciseDto,
  UpdateExerciseDto,
} from './dto/exercise.dto.js';
import { ExerciseService } from './exercise.service.js';

type AuthedRequest = Request & { user: AuthUserPayload };

@ApiTags('exercises')
@Controller('exercises')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ExerciseController {
  constructor(private readonly exerciseService: ExerciseService) {}

  @Get()
  @Roles(Role.GYM_ADMIN, Role.TRAINER, Role.MEMBER)
  @ApiOperation({ summary: 'List standard and gym-custom exercises with filters' })
  listExercises(
    @Req() req: AuthedRequest,
    @Query() query: QueryExerciseDto,
  ) {
    return this.exerciseService.listExercises(req.user, query);
  }

  @Get(':id')
  @Roles(Role.GYM_ADMIN, Role.TRAINER, Role.MEMBER)
  @ApiOperation({ summary: 'Get exercise details' })
  getExercise(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('gymSlug') gymSlug?: string,
  ) {
    return this.exerciseService.getExercise(req.user, id, gymSlug);
  }

  @Post()
  @Roles(Role.GYM_ADMIN, Role.TRAINER)
  @ApiOperation({ summary: 'Create custom exercise scoped to gym' })
  createGymExercise(
    @Req() req: AuthedRequest,
    @Body() dto: CreateExerciseDto,
  ) {
    return this.exerciseService.createGymExercise(req.user, dto);
  }

  @Patch(':id')
  @Roles(Role.GYM_ADMIN, Role.TRAINER)
  @ApiOperation({ summary: 'Update custom exercise' })
  updateGymExercise(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateExerciseDto,
  ) {
    return this.exerciseService.updateGymExercise(req.user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.GYM_ADMIN, Role.TRAINER)
  @ApiOperation({ summary: 'Delete custom exercise' })
  deleteGymExercise(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('gymSlug') gymSlug?: string,
  ) {
    return this.exerciseService.deleteGymExercise(req.user, id, gymSlug);
  }
}

