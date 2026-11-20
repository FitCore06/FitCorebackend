import { describe, expect, it } from 'vitest';
import { fuzzyRankCatalog } from '../src/nutrition/food-search-fuzzy.js';

describe('fuzzy catalog search', () => {
  const catalog = [
    { id: '1', nameEn: 'Sushi roll (California)', nameHi: null },
    { id: '2', nameEn: 'Pickle (mango achar)', nameHi: 'अचार' },
    { id: '3', nameEn: 'Pani puri (gol gappa)', nameHi: 'पानी पूरी' },
  ];

  it('matches susi to sushi', () => {
    const hits = fuzzyRankCatalog('susi', catalog);
    expect(hits[0]?.nameEn).toContain('Sushi');
  });

  it('matches pickel to pickle', () => {
    const hits = fuzzyRankCatalog('pickel', catalog);
    expect(hits[0]?.nameEn).toContain('Pickle');
  });
});