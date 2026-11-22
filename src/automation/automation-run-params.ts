import type { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { DEFAULT_EXPIRY_NOTIFY_DAYS, parseExpiryNotifyDays } from './automation-days.js';

export function resolveMembershipExpiryRunParams(
  config: ConfigService,
  gymSlug?: string,
  days?: string,
): { slug: string; daysBefore: number[] } {
  const slug =
    gymSlug?.trim().toLowerCase() ||
    config.get<string>('ATHRA_GYM_SLUG')?.trim().toLowerCase() ||
    config.get<string>('FITCORE_GYM_SLUG')?.trim().toLowerCase() ||
    '';
  if (!slug) {
    throw new BadRequestException('Provide gymSlug query or set ATHRA_GYM_SLUG on the API');
  }
  const daysBefore = parseExpiryNotifyDays(
    days?.trim() ||
      config.get<string>('ATHRA_EXPIRY_NOTIFY_DAYS')?.trim() ||
      config.get<string>('FITCORE_EXPIRY_NOTIFY_DAYS')?.trim() ||
      DEFAULT_EXPIRY_NOTIFY_DAYS.join(','),
  );
  return { slug, daysBefore };
}