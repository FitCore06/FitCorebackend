import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  externalCallBlocked,
  recordExternalCallFailure,
  recordExternalCallSuccess,
} from '../../common/external-call-cooldown.js';
import type { FoodSearchHit, Per100gMacros } from '../nutrition.types.js';

const OFF_ATTRIBUTION =
  'Product data from Open Food Facts (ODbL). Macros are per 100g when available.';

type OffSearchHit = {
  code?: string;
  product_name?: string;
  brands?: string[];
  nutriments?: Record<string, number | string | undefined>;
};

@Injectable()
export class OpenFoodFactsProvider {
  private readonly logger = new Logger(OpenFoodFactsProvider.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    const flag = this.config.get<string>('OPEN_FOOD_FACTS_ENABLED');
    return flag !== 'false' && flag !== '0';
  }

  getAttribution(): string {
    return OFF_ATTRIBUTION;
  }

  async searchFoods(query: string, pageSize = 25): Promise<FoodSearchHit[]> {
    if (!this.isEnabled() || !query.trim()) return [];
    if (externalCallBlocked('OPEN_FOOD_FACTS')) {
      this.logger.warn('Open Food Facts search skipped (failure cooldown)');
      return [];
    }

    const base =
      this.config.get<string>('OPEN_FOOD_FACTS_SEARCH_URL') ??
      'https://search.openfoodfacts.org';
    const url = new URL(`${base.replace(/\/$/, '')}/search`);
    url.searchParams.set('q', query.trim());
    url.searchParams.set(
      'page_size',
      String(Math.min(Math.max(pageSize, 1), 50)),
    );
    url.searchParams.set('fields', 'code,product_name,brands,nutriments');

    const timeoutMs = Number(
      this.config.get<string>('OPEN_FOOD_FACTS_TIMEOUT_MS') ?? 12_000,
    );

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': 'Athra-Nutrition/1.0 (member food log)' },
      });
      if (!res.ok) {
        this.logger.warn(`Open Food Facts HTTP ${res.status}`);
        recordExternalCallFailure('OPEN_FOOD_FACTS');
        return [];
      }
      const body = (await res.json()) as { hits?: OffSearchHit[] };
      const products = body.hits ?? [];
      const hits: FoodSearchHit[] = [];
      for (const product of products) {
        const hit = this.mapProduct(product);
        if (hit) hits.push(hit);
      }
      recordExternalCallSuccess('OPEN_FOOD_FACTS');
      return hits;
    } catch (err) {
      this.logger.warn(`Open Food Facts search failed: ${String(err)}`);
      recordExternalCallFailure('OPEN_FOOD_FACTS');
      return [];
    }
  }

  private mapProduct(product: OffSearchHit): FoodSearchHit | null {
    const rawName = product.product_name?.trim();
    if (!rawName) return null;
    const brands = product.brands?.[0]?.trim();
    const nameEn = brands ? `${rawName} (${brands})` : rawName;
    const per100g = extractPer100g(product.nutriments ?? {});
    if (!per100g) return null;

    return {
      source: 'OPEN_FOOD_FACTS',
      nameEn,
      category: 'packaged',
      per100g,
      license: 'Open Food Facts ODbL',
      externalId: product.code,
      dataSource: 'OPEN_FOOD_FACTS',
    };
  }
}

function num(v: number | string | undefined): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function extractPer100g(
  nutriments: Record<string, number | string | undefined>,
): Per100gMacros | null {
  const calories =
    num(nutriments['energy-kcal_100g']) ??
    num(nutriments['energy-kcal']) ??
    (num(nutriments['energy_100g'])
      ? (num(nutriments['energy_100g']) as number) / 4.184
      : undefined);

  const proteinG = num(nutriments.proteins_100g) ?? num(nutriments.proteins);
  const carbsG =
    num(nutriments.carbohydrates_100g) ?? num(nutriments.carbohydrates);
  const fatG = num(nutriments.fat_100g) ?? num(nutriments.fat);

  if (
    typeof calories !== 'number' ||
    typeof proteinG !== 'number' ||
    typeof carbsG !== 'number' ||
    typeof fatG !== 'number'
  ) {
    return null;
  }

  return {
    calories: round2(calories),
    proteinG: round2(proteinG),
    carbsG: round2(carbsG),
    fatG: round2(fatG),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}