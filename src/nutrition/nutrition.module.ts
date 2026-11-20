import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { FoodCatalogService } from './food-catalog.service.js';
import { NutritionController } from './nutrition.controller.js';
import { NutritionCalculatorService } from './nutrition-calculator.service.js';
import { NutritionDatabaseService } from './nutrition-database.service.js';
import { NutritionHistoryService } from './nutrition-history.service.js';
import { NutritionScannerService } from './nutrition-scanner.service.js';
import { OllamaVisionService } from './ollama-vision.service.js';
import { OpenFoodFactsProvider } from './providers/open-food-facts.provider.js';
import { UsdaProvider } from './providers/usda.provider.js';

@Module({
  imports: [AuthModule],
  controllers: [NutritionController],
  providers: [
    NutritionScannerService,
    OllamaVisionService,
    NutritionCalculatorService,
    FoodCatalogService,
    NutritionDatabaseService,
    NutritionHistoryService,
    UsdaProvider,
    OpenFoodFactsProvider,
    RolesGuard,
  ],
})
export class NutritionModule {}