import { Injectable } from '@nestjs/common';
import { NutritionDatabaseService } from './nutrition-database.service.js';

@Injectable()
export class FoodCatalogService {
  constructor(private readonly database: NutritionDatabaseService) {}

  search(
    query: string,
    gymId: string,
    localLimit = 30,
    usdaLimit = 50,
  ) {
    return this.database.searchFoods(query, gymId, localLimit, usdaLimit);
  }
}