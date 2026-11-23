import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { AuthTokens } from './auth.types.js';

export const ACCESS_COOKIE = 'athra_at';
export const REFRESH_COOKIE = 'athra_rt';

const REFRESH_TTL_SEC = 7 * 24 * 60 * 60;

function cookieBase(config: ConfigService) {
  const prod = config.get<string>('NODE_ENV') === 'production';
  return {
    httpOnly: true,
    secure: prod,
    sameSite: prod ? ('none' as const) : ('lax' as const),
  };
}

export function setAuthCookies(
  res: Response,
  tokens: Pick<AuthTokens, 'accessToken' | 'refreshToken' | 'expiresIn'>,
  config: ConfigService,
) {
  const base = cookieBase(config);
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base,
    path: '/api/v1',
    maxAge: tokens.expiresIn * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base,
    path: '/api/v1/auth',
    maxAge: REFRESH_TTL_SEC * 1000,
  });
}

export function clearAuthCookies(res: Response, config: ConfigService) {
  const base = cookieBase(config);
  res.clearCookie(ACCESS_COOKIE, { ...base, path: '/api/v1' });
  res.clearCookie(REFRESH_COOKIE, { ...base, path: '/api/v1/auth' });
}

export function readRefreshTokenCookie(
  cookies: Record<string, string> | undefined,
): string | undefined {
  return cookies?.[REFRESH_COOKIE]?.trim() || undefined;
}

export function readAccessTokenCookie(
  cookies: Record<string, string> | undefined,
): string | undefined {
  return cookies?.[ACCESS_COOKIE]?.trim() || undefined;
}