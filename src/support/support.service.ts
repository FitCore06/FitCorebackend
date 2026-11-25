import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service.js';
import type { SubmitContactDto } from './dto/submit-contact.dto.js';
import { verifyTurnstileToken } from './turnstile.verify.js';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async submitContact(
    dto: SubmitContactDto,
    remoteIp?: string,
  ): Promise<{ ok: true }> {
    if (dto.website?.trim()) {
      throw new BadRequestException('Invalid submission');
    }

    const secret = this.config.get<string>('TURNSTILE_SECRET_KEY')?.trim() ?? '';
    if (secret) {
      const ok = await verifyTurnstileToken(
        dto.turnstileToken,
        secret,
        remoteIp,
      );
      if (!ok) {
        throw new BadRequestException('Captcha verification failed');
      }
    }

    const meta = {
      name: dto.name.trim(),
      email: dto.email.trim().toLowerCase(),
      message: dto.message.trim(),
      ip: remoteIp ?? null,
    };

    await this.audit.log({
      action: 'public.contact',
      resource: 'support',
      meta,
    });

    this.logger.log(`Contact form: ${meta.email} (${meta.name})`);

    return { ok: true };
  }
}