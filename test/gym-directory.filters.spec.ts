import { describe, expect, it } from 'vitest';
import { buildListedGymWhere } from '../src/gym-directory/gym-directory.filters.js';

describe('buildListedGymWhere', () => {
  it('always requires listed active gyms', () => {
    expect(buildListedGymWhere({})).toEqual({
      isListed: true,
      tenant: { status: 'active', directorySubscriptionActive: true },
    });
  });

  it('filters state and city case-insensitively', () => {
    expect(buildListedGymWhere({ state: 'Delhi', city: 'New Delhi' })).toMatchObject({
      state: { equals: 'Delhi', mode: 'insensitive' },
      city: { equals: 'New Delhi', mode: 'insensitive' },
    });
  });

  it('searches name and location fields when q is set', () => {
    const where = buildListedGymWhere({ q: 'iron' });
    expect(where.OR).toHaveLength(4);
  });
});