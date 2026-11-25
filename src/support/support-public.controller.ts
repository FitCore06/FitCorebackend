import { Body, Controller, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { SubmitContactDto } from './dto/submit-contact.dto.js';
import { SupportService } from './support.service.js';

@ApiTags('public-support')
@Controller('public/support')
export class SupportPublicController {
  constructor(private readonly support: SupportService) {}

  @Post('contact')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  submitContact(@Body() dto: SubmitContactDto, @Req() req: Request) {
    const remoteIp =
      (typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
        : undefined) ?? req.socket.remoteAddress;
    return this.support.submitContact(dto, remoteIp);
  }
}