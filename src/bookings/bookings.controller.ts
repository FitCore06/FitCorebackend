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
import { BookingsService } from './bookings.service.js';
import { AdminCreateBookingDto } from './dto/admin-create-booking.dto.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { RescheduleBookingDto } from './dto/reschedule-booking.dto.js';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto.js';

type AuthedRequest = Request & { user: AuthUserPayload };

@ApiTags('bookings')
@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get('me')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Member session bookings' })
  listMine(@Req() req: AuthedRequest) {
    return this.bookings.listForMember(req.user);
  }

  @Get('trainer')
  @Roles(Role.TRAINER)
  @ApiOperation({ summary: 'Trainer incoming bookings' })
  listTrainer(@Req() req: AuthedRequest) {
    return this.bookings.listForTrainer(req.user);
  }

  @Get()
  @Roles(Role.GYM_ADMIN)
  @ApiOperation({ summary: 'All bookings for a gym' })
  listGym(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    if (!gymSlug?.trim()) return [];
    return this.bookings.listForGym(req.user, gymSlug.trim());
  }

  @Post()
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Request a session' })
  create(@Req() req: AuthedRequest, @Body() dto: CreateBookingDto) {
    return this.bookings.create(req.user, dto);
  }

  @Post('admin')
  @Roles(Role.GYM_ADMIN)
  @ApiOperation({ summary: 'Owner books PT for member + trainer' })
  adminCreate(
    @Req() req: AuthedRequest,
    @Body() dto: AdminCreateBookingDto,
  ) {
    return this.bookings.adminCreate(req.user, dto);
  }

  @Patch(':id/status')
  @Roles(Role.MEMBER, Role.TRAINER, Role.GYM_ADMIN)
  @ApiOperation({ summary: 'Update booking status' })
  updateStatus(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateBookingStatusDto,
  ) {
    return this.bookings.updateStatus(req.user, id, dto.status, dto.note);
  }

  @Patch(':id/reschedule')
  @Roles(Role.MEMBER, Role.TRAINER, Role.GYM_ADMIN)
  @ApiOperation({ summary: 'Reschedule booking time label' })
  reschedule(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: RescheduleBookingDto,
  ) {
    return this.bookings.reschedule(req.user, id, dto.startAtLabel);
  }
}