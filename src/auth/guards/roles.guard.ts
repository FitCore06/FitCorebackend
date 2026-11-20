import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthUserPayload } from '../auth.types.js';
import { Role, type RoleValue } from '../auth.types.js';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: RoleValue[]) => SetMetadata(ROLES_KEY, roles);

type AuthedRequest = Request & { user: AuthUserPayload };

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleValue[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user;
    if (!user) throw new ForbiddenException('Not authenticated');

    const ok = user.roles.some((r) =>
      required.includes(r.role as RoleValue),
    );
    if (!ok) throw new ForbiddenException('Insufficient role');
    return true;
  }
}

export function gymRole(
  user: AuthUserPayload,
  role: RoleValue,
  gymSlug?: string,
) {
  return user.roles.find(
    (r) =>
      r.role === role && (!gymSlug || r.gymSlug === gymSlug.toLowerCase()),
  );
}

export { Role };