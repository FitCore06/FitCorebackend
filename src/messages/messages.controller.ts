import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUserPayload } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Role, Roles, RolesGuard } from '../auth/guards/roles.guard.js';
import { MessagesService } from './messages.service.js';

type AuthedRequest = Request & { user: AuthUserPayload };

@ApiTags('messages')
@Controller('messages')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  @Roles(Role.MEMBER, Role.TRAINER)
  list(
    @Req() req: AuthedRequest,
    @Query('memberEmail') memberEmail?: string,
    @Query('trainerUserId') trainerUserId?: string,
  ) {
    return this.messages.listThread(req.user, { memberEmail, trainerUserId });
  }

  @Post()
  @Roles(Role.MEMBER, Role.TRAINER)
  send(
    @Req() req: AuthedRequest,
    @Body() body: { text: string; memberEmail?: string; trainerUserId?: string },
  ) {
    return this.messages.send(req.user, body);
  }
}