import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  externalCallBlocked,
  recordExternalCallFailure,
  recordExternalCallSuccess,
} from '../../common/external-call-cooldown.js';
import type { FoodSearchHit, Per100gMacros } from '../nutrition.types.js';

const USDA_ATTRIBUTION =
  'Food data from USDA FoodData Central (CC0). Athra does not redistribute the full USDA database.';

type FdcNutrient = {
  nutrientId?: number;
  nutrientNumber?: string;
  value?: number;
};

type FdcSearchFood = {
  fdcId: number;
  description?: string;
  dataType?: string;
  foodNutrients?: FdcNutrient[];
};

@Injectable()
export class UsdaProvider {
  private readonly logger = new Logger(UsdaProvider.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.getApiKey());
  }

  getAttribution(): string {
    return USDA_ATTRIBUTION;
  }

  async searchFoods(query: string, pageSize = 10): Promise<FoodSearchHit[]> {
    const key = this.getApiKey();
    if (!key || !query.trim()) return [];
    if (externalCallBlocked('USDA')) {
      this.logger.warn('USDA search skipped (failure cooldown)');
      return [];
    }

    const base =
      this.config.get<string>('USDA_BASE_URL') ??
      'https://api.nal.usda.gov/fdc/v1';
    const url = new URL(`${base.replace(/\/$/, '')}/foods/search`);
    url.searchParams.set('api_key', key);
    url.searchParams.set('query', query.trim());
    url.searchParams.set('pageSize', String(Math.min(pageSize, 50)));
    url.searchParams.set(
      'dataType',
      this.config.get<string>('USDA_SEARCH_DATA_TYPES') ??
        'Foundation,SR Legacy,Branded,Survey (FNDDS)',
    );

    const timeoutMs = Number(this.config.get<string>('USDA_TIMEOUT_MS') ?? 8_000);

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        this.logger.warn(`USDA search HTTP ${res.status}`);
        recordExternalCallFailure('USDA');
        return [];
      }
      const body = (await res.json()) as { foods?: FdcSearchFood[] };
      const foods = body.foods ?? [];
      const hits = foods
        .map((food) => this.mapFood(food))
        .filter((row): row is FoodSearchHit => row !== null);
      recordExternalCallSuccess('USDA');
      return hits;
    } catch (err) {
      this.logger.warn(`USDA search failed: ${String(err)}`);
      recordExternalCallFailure('USDA');
      return [];
    }
  }

  private mapFood(food: FdcSearchFood): FoodSearchHit | null {
    const per100g = extractPer100g(food.foodNutrients ?? []);
    if (!per100g) return null;
    const name = food.description?.trim();
    if (!name) return null;
    return {
      source: 'USDA',
      nameEn: name,
      category: food.dataType ?? 'usda',
      per100g,
      license: 'CC0 1.0 (USDA FoodData Central)',
      externalId: String(food.fdcId),
      dataSource: 'USDA',
    };
  }

  private getApiKey(): string | undefined {
    return this.config.get<string>('USDA_API_KEY')?.trim() || undefined;
  }
}

function extractPer100g(nutrients: FdcNutrient[]): Per100gMacros | null {
  const byId = new Map<number, number>();
  const byNumber = new Map<string, number>();

  for (const n of nutrients) {
    if (typeof n.value !== 'number') continue;
    if (typeof n.nutrientId === 'number') byId.set(n.nutrientId, n.value);
    if (n.nutrientNumber) byNumber.set(String(n.nutrientNumber), n.value);
  }

  const calories =
    byId.get(1008) ??
    byNumber.get('208') ??
    byNumber.get('957');
  const proteinG = byId.get(1003) ?? byNumber.get('203');
  const fatG = byId.get(1004) ?? byNumber.get('204');
  const carbsG = byId.get(1005) ?? byNumber.get('205');

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