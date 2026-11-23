import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { requestContext } from '../../common/security/request-context.js';
import { readAccessTokenCookie } from '../auth-cookies.js';
import { AuthService } from '../auth.service.js';
import type { AuthUserPayload } from '../auth.types.js';

type JwtPayload = { sub: string };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => readAccessTokenCookie(req.cookies) ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUserPayload> {
    const ctx = requestContext.getStore();
    if (ctx) ctx.userId = payload.sub;
    return this.authService.validateUserId(payload.sub);
  }
}