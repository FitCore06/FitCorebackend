import type { PrismaClient } from '@prisma/client';
import { GLOBAL_FOOD_CATALOG_SEEDS } from './food-catalog.seed-data.js';

const CATALOG_LICENSE = 'FitCore curated catalog (in-house per-100g estimates)';

export async function seedGlobalFoodCatalog(prisma: PrismaClient): Promise<number> {
  let count = 0;
  for (const item of GLOBAL_FOOD_CATALOG_SEEDS) {
    const existing = await prisma.foodCatalog.findFirst({
      where: { gymId: null, slug: item.slug },
    });

    const catalogData = {
      gymId: null as string | null,
      slug: item.slug,
      nameEn: item.nameEn,
      nameHi: item.nameHi ?? null,
      category: item.category,
      servingG: item.defaultServingG ?? null,
      verified: true,
      sourceNote: item.sourceNote,
    };

    const nutritionData = {
      per100g: item.per100g,
      dataSource: 'FITCORE',
      license: CATALOG_LICENSE,
      retrievedAt: new Date(),
    };

    if (!existing) {
      await prisma.foodCatalog.create({
        data: {
          ...catalogData,
          nutrition: { create: nutritionData },
        },
      });
    } else {
      await prisma.foodCatalog.update({
        where: { id: existing.id },
        data: catalogData,
      });
      await prisma.foodNutrition.upsert({
        where: { foodCatalogId: existing.id },
        create: { foodCatalogId: existing.id, ...nutritionData },
        update: nutritionData,
      });
    }
    count += 1;
  }
  return count;
}