import { describe, expect, it } from 'vitest';
import {
  expiryDedupeKey,
  expiryDedupeKeyVariants,
  membershipIdFromExpiryDedupe,
} from '../src/automation/membership-expiry-dedupe.js';

describe('membership-expiry-dedupe', () => {
  it('builds a stable wa-prefixed key', () => {
    const key = expiryDedupeKey(
      'mem-1',
      new Date('2026-11-25T00:00:00.000Z'),
      new Date('2026-11-19T00:00:00.000Z'),
    );
    expect(key).toBe('membership-expiry-wa:mem-1:2026-11-25:2026-11-19');
  });

  it('includes legacy 3-part keys in lookup variants', () => {
    const variants = expiryDedupeKeyVariants(
      'mem-1',
      new Date('2026-11-25T00:00:00.000Z'),
      new Date('2026-11-19T00:00:00.000Z'),
    );
    expect(variants).toContain('membership-expiry-wa:mem-1:2026-11-25:2026-11-19');
    expect(variants).toContain('membership-expiry-wa:mem-1:2026-11-25');
  });

  it('parses wa and legacy gym-ops prefixes', () => {
    expect(
      membershipIdFromExpiryDedupe(
        'membership-expiry-wa:mem-1:2026-11-25:2026-11-19',
      ),
    ).toBe('mem-1');
    expect(
      membershipIdFromExpiryDedupe(
        'membership-expiry:mem-legacy:2026-11-25:2026-11-19',
      ),
    ).toBe('mem-legacy');
  });
});