import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import type { AuthUserPayload } from '../auth/auth.types.js';
import { AuditService } from './audit.service.js';

type AuthedRequest = Request & { user?: AuthUserPayload };

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const method = req.method?.toUpperCase() ?? 'GET';
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }
    const path = req.originalUrl ?? req.url ?? '';
    if (path.includes('/health') || path.includes('/auth/refresh')) {
      return next.handle();
    }

    const user = req.user;
    const gymId = user?.roles?.[0]?.gymId;

    return next.handle().pipe(
      tap(() => {
        void this.audit.log({
          userId: user?.id,
          gymId,
          action: `${method} ${path.split('?')[0]}`,
          resource: path,
        });
      }),
    );
  }
}