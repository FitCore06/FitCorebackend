import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUserPayload } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { RegisterDeviceDto } from './dto/register-device.dto.js';
import { BroadcastNotificationDto } from './dto/broadcast-notification.dto.js';
import { Role, Roles } from '../auth/guards/roles.guard.js';
import { Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';

type AuthedRequest = Request & { user: AuthUserPayload };

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('me')
  list(@Req() req: AuthedRequest) {
    return this.notifications.listForUser(req.user);
  }

  @Post('devices')
  registerDevice(@Req() req: AuthedRequest, @Body() dto: RegisterDeviceDto) {
    return this.notifications.registerDevice(
      req.user,
      dto.token,
      dto.platform,
    );
  }

  @Patch(':id/read')
  read(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.notifications.markRead(req.user, id);
  }
}