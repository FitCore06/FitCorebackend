import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { getRequestContext } from '../common/security/request-context.js';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class PrismaRlsInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  async intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    if (process.env.DEV_AUTH_STUB === 'true') {
      return next.handle();
    }

    const ctx = getRequestContext();
    await this.prisma.$executeRawUnsafe(
      `SELECT set_config('app.bypass_rls', $1, false)`,
      'on',
    );
    await this.prisma.$executeRawUnsafe(
      `SELECT set_config('app.user_id', $1, false)`,
      ctx?.userId ?? '',
    );

    return next.handle().pipe(
      finalize(() => {
        void this.prisma.$executeRawUnsafe(
          `SELECT set_config('app.user_id', $1, false)`,
          '',
        );
      }),
    );
  }
}