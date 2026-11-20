export type Per100gMacros = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type FoodSearchHit = {
  /** Present for FitCore catalog rows */
  id?: string;
  source: 'FITCORE' | 'USDA' | 'OPEN_FOOD_FACTS';
  nameEn: string;
  nameHi?: string | null;
  category: string;
  per100g: Per100gMacros;
  license: string;
  /** USDA FDC id */
  externalId?: string;
  dataSource: string;
};

export type FoodSearchResponse = {
  query: string;
  /** Original text when typo normalization changed the query */
  normalizedFrom?: string;
  local: FoodSearchHit[];
  usda: FoodSearchHit[];
  openFoodFacts: FoodSearchHit[];
  usdaAvailable: boolean;
  openFoodFactsAvailable: boolean;
  attribution?: string;
};