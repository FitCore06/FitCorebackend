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
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    if (process.env.DEV_AUTH_STUB === 'true') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<{ user?: { id: string } }>();
    const ctx = getRequestContext();
    const userId = req.user?.id ?? ctx?.userId ?? '';
    if (ctx && userId && !ctx.userId) {
      ctx.userId = userId;
    }

    const strict = process.env.ATHRA_RLS_STRICT === 'true';
    const bypass = strict && userId ? 'off' : 'on';

    await this.prisma.$executeRawUnsafe(
      `SELECT set_config('app.bypass_rls', $1, false)`,
      bypass,
    );
    await this.prisma.$executeRawUnsafe(
      `SELECT set_config('app.user_id', $1, false)`,
      userId,
    );

    return next.handle().pipe(
      finalize(() => {
        void this.prisma.$executeRawUnsafe(
          `SELECT set_config('app.bypass_rls', $1, false)`,
          'on',
        );
        void this.prisma.$executeRawUnsafe(
          `SELECT set_config('app.user_id', $1, false)`,
          '',
        );
      }),
    );
  }
}