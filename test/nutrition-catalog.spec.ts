import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NutritionCalculatorService } from '../src/nutrition/nutrition-calculator.service.js';
import { NutritionDatabaseService } from '../src/nutrition/nutrition-database.service.js';
import { OpenFoodFactsProvider } from '../src/nutrition/providers/open-food-facts.provider.js';
import { UsdaProvider } from '../src/nutrition/providers/usda.provider.js';
import { GLOBAL_FOOD_CATALOG_SEEDS } from '../src/nutrition/food-catalog.seed-data.js';

describe('Nutrition P2 — catalog search & USDA', () => {
  const mockPrisma = {
    foodCatalog: { findMany: vi.fn() },
    externalFoodCache: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
    },
  };

  const mockConfig = {
    get: vi.fn((key: string) => {
      if (key === 'USDA_API_KEY') return undefined;
      if (key === 'USDA_BASE_URL') return 'https://api.nal.usda.gov/fdc/v1';
      return undefined;
    }),
  };

  let usda: UsdaProvider;
  let off: OpenFoodFactsProvider;
  let database: NutritionDatabaseService;

  const offConfig = {
    get: vi.fn((key: string) =>
      key === 'OPEN_FOOD_FACTS_ENABLED' ? 'false' : undefined,
    ),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    usda = new UsdaProvider(mockConfig as never);
    off = new OpenFoodFactsProvider(offConfig as never);
    database = new NutritionDatabaseService(mockPrisma as never, usda, off);
  });

  it('exposes expected curated catalog item count', () => {
    expect(GLOBAL_FOOD_CATALOG_SEEDS.length).toBeGreaterThanOrEqual(28);
  });

  it('returns local catalog hits first with per-100g macros', async () => {
    mockPrisma.foodCatalog.findMany.mockResolvedValue([
      {
        id: 'cat-roti',
        nameEn: 'Roti (wheat, plain)',
        nameHi: 'रोटी',
        category: 'indian_bread',
        nutrition: {
          per100g: { calories: 297, proteinG: 9, carbsG: 46, fatG: 8 },
          dataSource: 'FITCORE',
          license: 'FitCore curated',
        },
      },
    ]);

    const res = await database.searchFoods('roti', 'gym-a-id');
    expect(res.local).toHaveLength(1);
    expect(res.local[0].source).toBe('FITCORE');
    expect(res.local[0].id).toBe('cat-roti');
    expect(res.local[0].per100g.calories).toBe(297);
    expect(res.usda).toEqual([]);
    expect(res.openFoodFacts).toEqual([]);
    expect(res.usdaAvailable).toBe(false);
    expect(res.openFoodFactsAvailable).toBe(false);

    expect(mockPrisma.foodCatalog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ gymId: null }, { gymId: 'gym-a-id' }],
          AND: [
            {
              OR: [
                { nameEn: { contains: 'roti', mode: 'insensitive' } },
                { nameHi: { contains: 'roti', mode: 'insensitive' } },
              ],
            },
          ],
        }),
      }),
    );
  });

  it('scopes local search to member gym plus global rows', async () => {
    mockPrisma.foodCatalog.findMany.mockResolvedValue([]);
    await database.searchFoods('dal', 'tenant-gym-123');
    expect(mockPrisma.foodCatalog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ gymId: null }, { gymId: 'tenant-gym-123' }],
        }),
      }),
    );
  });

  it('skips USDA when API key missing', async () => {
    mockConfig.get.mockImplementation((key: string) =>
      key === 'USDA_API_KEY' ? '' : undefined,
    );
    mockPrisma.foodCatalog.findMany.mockResolvedValue([]);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const res = await database.searchFoods('chicken', 'gym-a');
    expect(res.usda).toEqual([]);
    expect(res.openFoodFacts).toEqual([]);
    expect(res.usdaAvailable).toBe(false);
    expect(res.openFoodFactsAvailable).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('includes USDA results when key present and API succeeds', async () => {
    const configWithKey = {
      get: vi.fn((key: string) => {
        if (key === 'USDA_API_KEY') return 'test-key';
        if (key === 'USDA_BASE_URL') return 'https://api.nal.usda.gov/fdc/v1';
        if (key === 'USDA_TIMEOUT_MS') return '8000';
        return undefined;
      }),
    };
    const usdaLive = new UsdaProvider(configWithKey as never);
    const db = new NutritionDatabaseService(mockPrisma as never, usdaLive, off);
    mockPrisma.foodCatalog.findMany.mockResolvedValue([]);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          foods: [
            {
              fdcId: 171077,
              description: 'Chicken, breast, meat only, cooked, roasted',
              dataType: 'SR Legacy',
              foodNutrients: [
                { nutrientId: 1008, value: 165 },
                { nutrientId: 1003, value: 31 },
                { nutrientId: 1004, value: 3.6 },
                { nutrientId: 1005, value: 0 },
              ],
            },
          ],
        }),
      }),
    );

    const res = await db.searchFoods('chicken breast', 'gym-a');
    expect(res.usdaAvailable).toBe(true);
    expect(res.usda).toHaveLength(1);
    expect(res.usda[0].externalId).toBe('171077');
    expect(res.usda[0].license).toContain('CC0');
    expect(res.usda[0].per100g.proteinG).toBe(31);
    expect(res.attribution).toContain('USDA');
  });

  it('continues with local-only when USDA fetch fails', async () => {
    const configWithKey = {
      get: vi.fn((key: string) => {
        if (key === 'USDA_API_KEY') return 'test-key';
        return undefined;
      }),
    };
    const usdaLive = new UsdaProvider(configWithKey as never);
    const db = new NutritionDatabaseService(mockPrisma as never, usdaLive, off);
    mockPrisma.foodCatalog.findMany.mockResolvedValue([
      {
        id: 'c1',
        nameEn: 'Rice (white, cooked)',
        nameHi: null,
        category: 'grain',
        nutrition: {
          per100g: { calories: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 },
          dataSource: 'FITCORE',
          license: 'FitCore curated',
        },
      },
    ]);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

    const res = await db.searchFoods('rice', 'gym-a');
    expect(res.local).toHaveLength(1);
    expect(res.usda).toEqual([]);
    expect(res.usdaAvailable).toBe(true);
  });

  it('calculates macros from per-100g catalog values', () => {
    const calc = new NutritionCalculatorService({} as never);
    const macros = calc.fromPer100g(200, {
      calories: 130,
      proteinG: 2.7,
      carbsG: 28,
      fatG: 0.3,
    });
    expect(macros.calories).toBe(260);
    expect(macros.proteinG).toBe(5.4);
    expect(macros.isEstimate).toBe(false);
  });
});