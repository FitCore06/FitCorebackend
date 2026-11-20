import { describe, expect, it } from 'vitest';
import {
  foodSearchTokens,
  normalizeFoodSearchQuery,
} from '../src/nutrition/food-search-normalize.js';

describe('food search normalize', () => {
  it('fixes pani purri typo', () => {
    expect(normalizeFoodSearchQuery('pani purri')).toBe('pani puri');
  });

  it('expands gol gappa alias', () => {
    expect(normalizeFoodSearchQuery('gol gappa')).toBe('pani puri');
  });

  it('tokenizes normalized query', () => {
    expect(foodSearchTokens('pani puri')).toEqual(['pani', 'puri']);
  });

  it('fixes pickel typo', () => {
    expect(normalizeFoodSearchQuery('pickel')).toBe('pickle');
  });

  it('fixes susi typo', () => {
    expect(normalizeFoodSearchQuery('susi')).toBe('sushi');
  });
});