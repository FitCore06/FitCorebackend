import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role, type AuthUserPayload } from '../src/auth/auth.types.js';
import { NutritionCalculatorService } from '../src/nutrition/nutrition-calculator.service.js';
import { NutritionHistoryService } from '../src/nutrition/nutrition-history.service.js';
import { NutritionScannerService } from '../src/nutrition/nutrition-scanner.service.js';
import { OllamaVisionService } from '../src/nutrition/ollama-vision.service.js';

const memberA: AuthUserPayload = {
  id: 'member-a-id',
  email: 'member-a@gym.test',
  name: 'Member A',
  roles: [
    { gymId: 'gym-a-id', gymSlug: 'gym-a', gymName: 'Gym A', role: Role.MEMBER },
  ],
};

const memberB: AuthUserPayload = {
  id: 'member-b-id',
  email: 'member-b@gym.test',
  name: 'Member B',
  roles: [
    { gymId: 'gym-b-id', gymSlug: 'gym-b', gymName: 'Gym B', role: Role.MEMBER },
  ],
};

describe('Nutrition scanner security', () => {
  const mockPrisma = {
    nutritionScanLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    foodIntakeEntry: {
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
    },
    foodCatalog: { findUnique: vi.fn() },
    foodNutrition: { findUnique: vi.fn() },
    dietMealLog: {
      upsert: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn((ops: unknown) => Promise.all(ops as Promise<unknown>[])),
  };

  const mockVision = {
    analyzeImage: vi.fn(),
    ping: vi.fn().mockResolvedValue(false),
    checkReadiness: vi.fn().mockResolvedValue({
      ready: false,
      reason: 'disabled',
    }),
    isEnabled: vi.fn().mockReturnValue(false),
  };

  let calculator: NutritionCalculatorService;
  let scanner: NutritionScannerService;
  let history: NutritionHistoryService;

  beforeEach(() => {
    vi.clearAllMocks();
    calculator = new NutritionCalculatorService(mockPrisma as never);
    scanner = new NutritionScannerService(
      mockPrisma as never,
      mockVision as unknown as OllamaVisionService,
      calculator,
    );
    history = new NutritionHistoryService(mockPrisma as never);
  });

  it('denies member B reading member A scan', async () => {
    mockPrisma.nutritionScanLog.findFirst.mockResolvedValue(null);
    await expect(scanner.getScan(memberB, 'scan-a')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockPrisma.nutritionScanLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'scan-a',
          gymId: 'gym-b-id',
          memberUserId: 'member-b-id',
        },
      }),
    );
  });

  it('denies member B patching member A scan', async () => {
    mockPrisma.nutritionScanLog.findFirst.mockResolvedValue(null);
    await expect(
      scanner.patchItems(memberB, 'scan-a', {
        items: [{ displayName: 'Rice', quantityGrams: 100 }],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('denies member B confirming member A scan', async () => {
    mockPrisma.nutritionScanLog.findFirst.mockResolvedValue(null);
    await expect(scanner.confirmScan(memberB, 'scan-a')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects unknown food catalog id', async () => {
    mockPrisma.foodCatalog.findUnique.mockResolvedValue(null);
    await expect(
      calculator.fromCatalogId('missing-id', 100, 'gym-a-id'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects food catalog from another gym', async () => {
    mockPrisma.foodCatalog.findUnique.mockResolvedValue({
      id: 'cat-b',
      gymId: 'gym-b-id',
      nutrition: {
        per100g: { calories: 100, proteinG: 10, carbsG: 10, fatG: 2 },
        dataSource: 'FITCORE',
      },
    });
    await expect(
      calculator.fromCatalogId('cat-b', 100, 'gym-a-id'),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts global catalog (gymId null)', async () => {
    mockPrisma.foodCatalog.findUnique.mockResolvedValue({
      id: 'cat-global',
      gymId: null,
      nutrition: {
        per100g: { calories: 200, proteinG: 20, carbsG: 10, fatG: 5 },
        dataSource: 'FITCORE',
      },
    });
    const macros = await calculator.fromCatalogId(
      'cat-global',
      150,
      'gym-a-id',
    );
    expect(macros.calories).toBe(300);
    expect(macros.dataSource).toBe('FITCORE');
    expect(macros.isEstimate).toBe(false);
  });

  it('accepts own-gym catalog and ignores client macro spoofing', async () => {
    mockPrisma.foodCatalog.findUnique.mockResolvedValue({
      id: 'cat-a',
      gymId: 'gym-a-id',
      nutrition: {
        per100g: { calories: 100, proteinG: 10, carbsG: 12, fatG: 3 },
        dataSource: 'FITCORE',
      },
    });
    mockPrisma.foodIntakeEntry.create.mockResolvedValue({ id: 'entry-1' });

    await scanner.manualIntake(memberA, {
      displayName: 'Dal',
      quantityGrams: 200,
      foodCatalogId: 'cat-a',
      calories: 9_999,
      proteinG: 9_999,
      carbsG: 9_999,
      fatG: 9_999,
    });

    expect(mockPrisma.foodIntakeEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          calories: 200,
          proteinG: 20,
          carbsG: 24,
          fatG: 6,
          foodCatalogId: 'cat-a',
        }),
      }),
    );
    expect(mockPrisma.dietMealLog.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.dietMealLog.create).not.toHaveBeenCalled();
  });

  it('manual intake works when vision is disabled (no vision calls)', async () => {
    mockPrisma.foodIntakeEntry.create.mockResolvedValue({ id: 'manual-1' });
    const result = await scanner.manualIntake(memberA, {
      displayName: 'Banana',
      quantityGrams: 120,
      calories: 105,
      proteinG: 1,
      carbsG: 27,
      fatG: 0.3,
    });
    expect(result).toEqual({ id: 'manual-1' });
    expect(mockVision.analyzeImage).not.toHaveBeenCalled();
    expect(mockPrisma.dietMealLog.upsert).not.toHaveBeenCalled();
  });

  it('daily summary queries confirmed entries only', async () => {
    mockPrisma.foodIntakeEntry.findMany.mockResolvedValue([
      {
        calories: 300,
        proteinG: 20,
        carbsG: 30,
        fatG: 10,
      },
    ]);
    const summary = await history.dailySummary(memberA, '2026-11-20');
    expect(mockPrisma.foodIntakeEntry.findMany).toHaveBeenCalledWith({
      where: {
        gymId: 'gym-a-id',
        memberUserId: 'member-a-id',
        logDate: '2026-11-20',
        status: 'confirmed',
      },
    });
    expect(summary.calories).toBe(300);
    expect(summary.entryCount).toBe(1);
  });

  it('confirm scan never touches DietMealLog', async () => {
    mockPrisma.nutritionScanLog.findFirst.mockResolvedValue({
      id: 'scan-a',
      gymId: 'gym-a-id',
      memberUserId: 'member-a-id',
      status: 'awaiting_review',
      logDate: '2026-11-20',
      linkedMealId: null,
      errorCode: null,
      entries: [
        {
          id: 'draft-1',
          status: 'draft',
          displayName: 'Rice',
          quantityGrams: 100,
          calories: 130,
          proteinG: 3,
          carbsG: 28,
          fatG: 1,
          dataSource: 'AI_ESTIMATE',
          isEstimate: true,
          portionConfidence: 0.7,
        },
      ],
    });
    mockPrisma.foodIntakeEntry.update.mockResolvedValue({});
    mockPrisma.nutritionScanLog.update.mockResolvedValue({});

    await scanner.confirmScan(memberA, 'scan-a');

    expect(mockPrisma.foodIntakeEntry.update).toHaveBeenCalled();
    expect(mockPrisma.dietMealLog.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.dietMealLog.create).not.toHaveBeenCalled();
    expect(mockPrisma.dietMealLog.deleteMany).not.toHaveBeenCalled();
  });

  it('capabilities reflect readiness, not ping-only', async () => {
    mockVision.checkReadiness.mockResolvedValueOnce({
      ready: false,
      reason: 'model_missing',
    });
    const caps = await scanner.capabilities(memberA);
    expect(caps).toEqual({
      visionAvailable: false,
      manualSearchAvailable: true,
      visionUnavailableReason: 'model_missing',
    });
    expect(mockVision.checkReadiness).toHaveBeenCalled();
  });

  it('maps vision timeout to scan errorCode VISION_TIMEOUT', async () => {
    mockVision.isEnabled.mockReturnValue(true);
    mockVision.checkReadiness.mockResolvedValue({ ready: true });
    mockPrisma.nutritionScanLog.create.mockResolvedValue({ id: 'scan-1' });
    mockVision.analyzeImage.mockRejectedValue(
      new ServiceUnavailableException({
        code: 'VISION_TIMEOUT',
        message: 'Vision inference timed out',
      }),
    );

    const tinyPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );

    await expect(
      scanner.createScan(memberA, {
        imageBase64: tinyPng.toString('base64'),
        imageMimeType: 'image/png',
      }),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(mockPrisma.nutritionScanLog.update).toHaveBeenCalledWith({
      where: { id: 'scan-1' },
      data: { status: 'failed', errorCode: 'VISION_TIMEOUT' },
    });
  });

  it('rejects non-member from nutrition flows via assertMember', async () => {
    const trainer: AuthUserPayload = {
      id: 'trainer-a',
      email: 'trainer-a@gym.test',
      name: 'Trainer',
      roles: [
        {
          gymId: 'gym-a-id',
          gymSlug: 'gym-a',
          gymName: 'Gym A',
          role: Role.TRAINER,
        },
      ],
    };
    await expect(history.dailySummary(trainer, '2026-11-20')).rejects.toThrow(
      ForbiddenException,
    );
  });
});