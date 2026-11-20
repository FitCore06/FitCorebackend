import {
  Body,
  Controller,
  Delete,
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
import { AssignmentsService } from './assignments.service.js';
import { UpsertAssignmentDto } from './dto/upsert-assignment.dto.js';

type AuthedRequest = Request & { user: AuthUserPayload };

@ApiTags('assignments')
@Controller('assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get('me')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Active trainer assignment for the logged-in member' })
  async me(@Req() req: AuthedRequest) {
    const assignment = await this.assignments.getMyAssignment(req.user);
    return { assignment };
  }

  @Get('clients')
  @Roles(Role.TRAINER)
  @ApiOperation({ summary: 'Members assigned to the logged-in trainer' })
  listTrainerClients(@Req() req: AuthedRequest) {
    return this.assignments.listTrainerClients(req.user);
  }

  @Get()
  @Roles(Role.GYM_ADMIN)
  @ApiOperation({ summary: 'List member–trainer assignments for a gym' })
  list(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    if (!gymSlug?.trim()) {
      return [];
    }
    return this.assignments.listForGym(req.user, gymSlug.trim());
  }

  @Post()
  @Roles(Role.GYM_ADMIN)
  @ApiOperation({ summary: 'Assign or update member trainer' })
  upsert(@Req() req: AuthedRequest, @Body() dto: UpsertAssignmentDto) {
    return this.assignments.upsert(req.user, dto);
  }

  @Delete(':id')
  @Roles(Role.GYM_ADMIN)
  @ApiOperation({ summary: 'Deactivate assignment' })
  remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.assignments.deactivate(req.user, id);
  }
}