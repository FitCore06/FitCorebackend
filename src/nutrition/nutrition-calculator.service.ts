import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export type MacroTotals = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  isEstimate: boolean;
  dataSource: string;
};

type Per100g = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

@Injectable()
export class NutritionCalculatorService {
  constructor(private readonly prisma: PrismaService) {}

  /** (grams / 100) × per 100g */
  fromPer100g(grams: number, per100g: Per100g): MacroTotals {
    const factor = grams / 100;
    return {
      calories: round2(per100g.calories * factor),
      proteinG: round2(per100g.proteinG * factor),
      carbsG: round2(per100g.carbsG * factor),
      fatG: round2(per100g.fatG * factor),
      isEstimate: false,
      dataSource: 'FITCORE',
    };
  }

  async fromCatalogId(
    foodCatalogId: string,
    grams: number,
    memberGymId: string,
  ): Promise<MacroTotals> {
    const catalog = await this.prisma.foodCatalog.findUnique({
      where: { id: foodCatalogId },
      include: { nutrition: true },
    });
    if (!catalog) {
      throw new BadRequestException('Unknown food catalog id');
    }
    if (catalog.gymId !== null && catalog.gymId !== memberGymId) {
      throw new BadRequestException('Food catalog not available for this gym');
    }
    const row = catalog.nutrition;
    if (!row) {
      throw new BadRequestException('Food catalog has no nutrition data');
    }
    const per = row.per100g as Per100g;
    if (
      typeof per.calories !== 'number' ||
      typeof per.proteinG !== 'number' ||
      typeof per.carbsG !== 'number' ||
      typeof per.fatG !== 'number'
    ) {
      throw new BadRequestException('Invalid catalog nutrition data');
    }
    const totals = this.fromPer100g(grams, per);
    return { ...totals, dataSource: row.dataSource };
  }

  /** P1 fallback until USDA/catalog matching — clearly estimated */
  aiMacroFallback(grams: number): MacroTotals {
    const per100g: Per100g = {
      calories: 140,
      proteinG: 5,
      carbsG: 18,
      fatG: 5,
    };
    const totals = this.fromPer100g(grams, per100g);
    return { ...totals, isEstimate: true, dataSource: 'AI_ESTIMATE' };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}