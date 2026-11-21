import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class AutomationSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>('FITCORE_AUTOMATION_SECRET')?.trim();
    if (!secret) {
      throw new ServiceUnavailableException(
        'FITCORE_AUTOMATION_SECRET is not configured on the API',
      );
    }
    const req = context.switchToHttp().getRequest<Request>();
    const provided = String(req.headers['x-fitcore-automation-secret'] ?? '').trim();
    if (!provided) throw new UnauthorizedException('Missing automation secret');
    const a = Buffer.from(secret);
    const b = Buffer.from(provided);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid automation secret');
    }
    return true;
  }
}