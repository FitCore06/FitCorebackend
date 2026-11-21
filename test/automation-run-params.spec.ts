import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { resolveMembershipExpiryRunParams } from '../src/automation/automation-run-params.js';

describe('resolveMembershipExpiryRunParams', () => {
  it('uses query gymSlug over env', () => {
    const config = {
      get: vi.fn((key: string) => (key === 'FITCORE_GYM_SLUG' ? 'env-gym' : undefined)),
    } as unknown as ConfigService;
    const params = resolveMembershipExpiryRunParams(config, 'Query-Gym', '7,1');
    expect(params.slug).toBe('query-gym');
    expect(params.daysBefore).toEqual([7, 1]);
  });

  it('throws when slug is missing', () => {
    const config = { get: vi.fn(() => undefined) } as unknown as ConfigService;
    expect(() => resolveMembershipExpiryRunParams(config)).toThrow(BadRequestException);
  });
});