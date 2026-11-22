import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { fuzzyRankCatalog } from './food-search-fuzzy.js';
import {
  foodSearchTokens,
  normalizeFoodSearchQuery,
} from './food-search-normalize.js';
import type { FoodSearchHit, FoodSearchResponse } from './nutrition.types.js';
import { OpenFoodFactsProvider } from './providers/open-food-facts.provider.js';
import { UsdaProvider } from './providers/usda.provider.js';

const CATALOG_LICENSE = 'Athra curated catalog (in-house per-100g estimates)';

@Injectable()
export class NutritionDatabaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usda: UsdaProvider,
    private readonly openFoodFacts: OpenFoodFactsProvider,
  ) {}

  async searchFoods(
    query: string,
    gymId: string,
    localLimit = 30,
    usdaLimit = 50,
  ): Promise<FoodSearchResponse> {
    const raw = query.trim();
    const q = normalizeFoodSearchQuery(raw);
    const offAvailable = this.openFoodFacts.isEnabled();
    const usdaAvailable = this.usda.isConfigured();

    if (!q) {
      return {
        query: raw,
        local: [],
        usda: [],
        openFoodFacts: [],
        usdaAvailable,
        openFoodFactsAvailable: offAvailable,
      };
    }

    const tokens = foodSearchTokens(q);
    const tokenFilters =
      tokens.length > 0
        ? tokens.map((token) => ({
            OR: [
              { nameEn: { contains: token, mode: 'insensitive' as const } },
              { nameHi: { contains: token, mode: 'insensitive' as const } },
            ],
          }))
        : [
            {
              OR: [
                { nameEn: { contains: q, mode: 'insensitive' as const } },
                { nameHi: { contains: q, mode: 'insensitive' as const } },
              ],
            },
          ];

    const localRows = await this.prisma.foodCatalog.findMany({
      where: {
        OR: [{ gymId: null }, { gymId }],
        AND: tokenFilters,
      },
      take: localLimit,
      include: { nutrition: true },
      orderBy: { nameEn: 'asc' },
    });

    const local: FoodSearchHit[] = [];
    const seenLocal = new Set<string>();
    for (const row of localRows) {
      const hit = this.mapCatalogRow(row);
      if (hit?.id) {
        seenLocal.add(hit.id);
        local.push(hit);
      }
    }

    if (local.length < localLimit) {
      const pool = await this.prisma.foodCatalog.findMany({
        where: { OR: [{ gymId: null }, { gymId }] },
        include: { nutrition: true },
        take: 400,
      });
      const fuzzyRows = fuzzyRankCatalog(q, pool);
      for (const row of fuzzyRows) {
        if (seenLocal.has(row.id)) continue;
        const hit = this.mapCatalogRow(row);
        if (hit?.id) {
          seenLocal.add(hit.id);
          local.push(hit);
        }
        if (local.length >= localLimit) break;
      }
    }

    let usda: FoodSearchHit[] = [];
    if (usdaAvailable) {
      const cached = await this.readExternalCache('USDA', q);
      if (cached) {
        usda = cached;
      } else {
        usda = await this.usda.searchFoods(q, usdaLimit);
        if (usda.length) {
          await this.writeExternalCache(
            'USDA',
            q,
            usda,
            'CC0 1.0 (USDA FoodData Central)',
          ).catch(() => undefined);
        }
      }
    }

    let openFoodFacts: FoodSearchHit[] = [];
    if (offAvailable) {
      const cached = await this.readExternalCache('OPEN_FOOD_FACTS', q);
      if (cached) {
        openFoodFacts = cached;
      } else {
        openFoodFacts = await this.openFoodFacts.searchFoods(
          q,
          Math.min(usdaLimit, 50),
        );
        if (openFoodFacts.length) {
          await this.writeExternalCache(
            'OPEN_FOOD_FACTS',
            q,
            openFoodFacts,
            'Open Food Facts ODbL',
          ).catch(() => undefined);
        }
      }
    }

    const attributions: string[] = [];
    if (usda.length) attributions.push(this.usda.getAttribution());
    if (openFoodFacts.length) attributions.push(this.openFoodFacts.getAttribution());

    return {
      query: q,
      normalizedFrom: raw !== q ? raw : undefined,
      local,
      usda,
      openFoodFacts,
      usdaAvailable,
      openFoodFactsAvailable: offAvailable,
      attribution: attributions.length ? attributions.join(' ') : undefined,
    };
  }

  private mapCatalogRow(row: {
    id: string;
    nameEn: string;
    nameHi: string | null;
    category: string;
    nutrition: {
      per100g: unknown;
      dataSource: string;
      license: string | null;
    } | null;
  }): FoodSearchHit | null {
    if (!row.nutrition) return null;
    const per = row.nutrition.per100g as {
      calories?: number;
      proteinG?: number;
      carbsG?: number;
      fatG?: number;
    };
    if (
      typeof per.calories !== 'number' ||
      typeof per.proteinG !== 'number' ||
      typeof per.carbsG !== 'number' ||
      typeof per.fatG !== 'number'
    ) {
      return null;
    }
    return {
      id: row.id,
      source: 'FITCORE',
      nameEn: row.nameEn,
      nameHi: row.nameHi,
      category: row.category,
      per100g: {
        calories: per.calories,
        proteinG: per.proteinG,
        carbsG: per.carbsG,
        fatG: per.fatG,
      },
      license: row.nutrition.license ?? CATALOG_LICENSE,
      dataSource: row.nutrition.dataSource,
    };
  }

  private cacheKey(provider: string, query: string): string {
    const hash = createHash('sha256').update(query.toLowerCase()).digest('hex');
    return `${provider.toLowerCase()}:search:${hash}`;
  }

  private async readExternalCache(
    provider: string,
    query: string,
  ): Promise<FoodSearchHit[] | null> {
    const row = await this.prisma.externalFoodCache.findUnique({
      where: { cacheKey: this.cacheKey(provider, query) },
    });
    if (!row || row.expiresAt < new Date()) return null;
    const payload = row.payload as { items?: FoodSearchHit[] };
    return Array.isArray(payload.items) ? payload.items : null;
  }

  private async writeExternalCache(
    provider: string,
    query: string,
    items: FoodSearchHit[],
    license: string,
  ) {
    const ttlHours = Number(process.env.NUTRITION_CACHE_TTL_HOURS ?? 168);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    const key = this.cacheKey(provider, query);
    await this.prisma.externalFoodCache.upsert({
      where: { cacheKey: key },
      create: {
        cacheKey: key,
        provider,
        payload: { items },
        license,
        expiresAt,
      },
      update: {
        payload: { items },
        expiresAt,
        license,
      },
    });
  }
}