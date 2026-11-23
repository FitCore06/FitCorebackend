import {
  Injectable,
  type ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  ThrottlerGuard,
  ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { SecurityEventsService } from './security-events.service.js';
import { getRequestContext } from './request-context.js';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly securityEvents: SecurityEventsService,
  ) {
    super(options, storageService, reflector);
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const req = context.switchToHttp().getRequest<{
      ip?: string;
      originalUrl?: string;
    }>();
    const ctx = getRequestContext();
    this.securityEvents.record('rate_limit', {
      ip: ctx?.ip ?? req.ip,
      path: ctx?.path ?? req.originalUrl,
      requestId: ctx?.requestId,
      detail: `limit=${throttlerLimitDetail.limit}`,
    });
    throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
  }
}