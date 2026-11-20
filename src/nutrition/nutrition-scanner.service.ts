import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AuthUserPayload } from '../auth/auth.types.js';
import { Role } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NutritionCalculatorService } from './nutrition-calculator.service.js';
import { OllamaVisionService } from './ollama-vision.service.js';
import type { CreateNutritionScanDto } from './dto/create-nutrition-scan.dto.js';
import type { ManualIntakeDto } from './dto/manual-intake.dto.js';
import type { PatchScanItemsDto } from './dto/patch-scan-items.dto.js';

const MAX_PHOTO_BYTES = 2_500_000;
const RATE_LIMIT_PER_HOUR = 30;

@Injectable()
export class NutritionScannerService {
  private readonly scanCounts = new Map<
    string,
    { windowStart: number; count: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly vision: OllamaVisionService,
    private readonly calculator: NutritionCalculatorService,
  ) {}

  async capabilities(user: AuthUserPayload) {
    this.assertMember(user);
    const readiness = await this.vision.checkReadiness();
    return {
      visionAvailable: readiness.ready,
      manualSearchAvailable: true,
      visionUnavailableReason: readiness.ready
        ? undefined
        : (readiness.reason ?? 'unavailable'),
    };
  }

  async createScan(user: AuthUserPayload, dto: CreateNutritionScanDto) {
    const { gymId, memberUserId } = this.assertMember(user);
    this.assertRateLimit(memberUserId);

    const buf = Buffer.from(dto.imageBase64, 'base64');
    if (buf.length > MAX_PHOTO_BYTES) {
      throw new BadRequestException('Image too large (max ~2.5 MB)');
    }
  const imageSha256 = createHash('sha256').update(buf).digest('hex');
    const logDate = dto.logDate?.trim() || this.todayLogDate();

    const scan = await this.prisma.nutritionScanLog.create({
      data: {
        gymId,
        memberUserId,
        status: 'processing',
        imageMimeType: dto.imageMimeType,
        imageSha256,
        linkedMealId: dto.linkedDietMealId ?? null,
        logDate,
      },
    });

    try {
      const analysis = await this.vision.analyzeImage(
        dto.imageBase64,
        dto.imageMimeType,
      );

      const entryCreates = [];
      for (const item of analysis.items) {
        const grams = Math.max(1, item.gramsEstimate);
        const macros = this.calculator.aiMacroFallback(grams);
        entryCreates.push({
          gymId,
          memberUserId,
          scanId: scan.id,
          status: 'draft',
          logDate,
          displayName: item.name,
          quantityGrams: grams,
          calories: macros.calories,
          proteinG: macros.proteinG,
          carbsG: macros.carbsG,
          fatG: macros.fatG,
          dataSource: macros.dataSource,
          matchConfidence: analysis.overallConfidence,
          portionConfidence: item.portionConfidence,
          isEstimate: true,
          estimatedSnapshot: item,
          linkedDietMealId: dto.linkedDietMealId ?? null,
        });
      }

      if (entryCreates.length) {
        await this.prisma.foodIntakeEntry.createMany({ data: entryCreates });
      }

      await this.prisma.nutritionScanLog.update({
        where: { id: scan.id },
        data: {
          status: entryCreates.length ? 'awaiting_review' : 'failed',
          visionModel: analysis.model,
          visionRaw: analysis.raw as object,
          errorCode: entryCreates.length ? null : 'NO_ITEMS',
        },
      });
    } catch (err) {
      const code = this.extractErrorCode(err);
      await this.prisma.nutritionScanLog.update({
        where: { id: scan.id },
        data: { status: 'failed', errorCode: code },
      });
      throw err;
    }

    return this.getScan(user, scan.id);
  }

  async getScan(user: AuthUserPayload, scanId: string) {
    const { gymId, memberUserId } = this.assertMember(user);
    const scan = await this.prisma.nutritionScanLog.findFirst({
      where: { id: scanId, gymId, memberUserId },
      include: { entries: { orderBy: { createdAt: 'asc' } } },
    });
    if (!scan) throw new NotFoundException('Scan not found');
    return this.toScanDto(scan);
  }

  async patchItems(
    user: AuthUserPayload,
    scanId: string,
    dto: PatchScanItemsDto,
  ) {
    const { gymId, memberUserId } = this.assertMember(user);
    const scan = await this.prisma.nutritionScanLog.findFirst({
      where: { id: scanId, gymId, memberUserId },
    });
    if (!scan) throw new NotFoundException('Scan not found');
    if (!['awaiting_review', 'processing'].includes(scan.status)) {
      throw new BadRequestException('Scan cannot be edited');
    }

    await this.prisma.foodIntakeEntry.deleteMany({
      where: { scanId, status: 'draft' },
    });

    for (const item of dto.items) {
      const macros = await this.resolveMacros(gymId, item);
      await this.prisma.foodIntakeEntry.create({
        data: {
          gymId,
          memberUserId,
          scanId,
          status: 'draft',
          logDate: scan.logDate,
          displayName: item.displayName,
          quantityGrams: item.quantityGrams,
          calories: macros.calories,
          proteinG: macros.proteinG,
          carbsG: macros.carbsG,
          fatG: macros.fatG,
          dataSource: macros.dataSource,
          foodCatalogId: item.foodCatalogId ?? null,
          isEstimate: macros.isEstimate,
          linkedDietMealId: scan.linkedMealId,
        },
      });
    }

    await this.prisma.nutritionScanLog.update({
      where: { id: scanId },
      data: { status: 'awaiting_review' },
    });

    return this.getScan(user, scanId);
  }

  async confirmScan(user: AuthUserPayload, scanId: string) {
    const { gymId, memberUserId } = this.assertMember(user);
    const scan = await this.prisma.nutritionScanLog.findFirst({
      where: { id: scanId, gymId, memberUserId },
      include: { entries: true },
    });
    if (!scan) throw new NotFoundException('Scan not found');
    if (scan.status !== 'awaiting_review') {
      throw new BadRequestException('Scan not ready to confirm');
    }
    const draft = scan.entries.filter((e) => e.status === 'draft');
    if (!draft.length) {
      throw new BadRequestException('No draft items to confirm');
    }

    const now = new Date();
    await this.prisma.$transaction([
      ...draft.map((e) =>
        this.prisma.foodIntakeEntry.update({
          where: { id: e.id },
          data: {
            status: 'confirmed',
            confirmedAt: now,
            confirmedSnapshot: {
              displayName: e.displayName,
              quantityGrams: Number(e.quantityGrams),
              calories: Number(e.calories),
              proteinG: Number(e.proteinG),
              carbsG: Number(e.carbsG),
              fatG: Number(e.fatG),
            },
          },
        }),
      ),
      this.prisma.nutritionScanLog.update({
        where: { id: scanId },
        data: { status: 'confirmed' },
      }),
    ]);

    return this.getScan(user, scanId);
  }

  async discardScan(user: AuthUserPayload, scanId: string) {
    const { gymId, memberUserId } = this.assertMember(user);
    const scan = await this.prisma.nutritionScanLog.findFirst({
      where: { id: scanId, gymId, memberUserId },
    });
    if (!scan) throw new NotFoundException('Scan not found');
    await this.prisma.foodIntakeEntry.deleteMany({
      where: { scanId, status: 'draft' },
    });
    await this.prisma.nutritionScanLog.update({
      where: { id: scanId },
      data: { status: 'discarded' },
    });
    return { ok: true };
  }

  async manualIntake(user: AuthUserPayload, dto: ManualIntakeDto) {
    const { gymId, memberUserId } = this.assertMember(user);
    const logDate = dto.logDate?.trim() || this.todayLogDate();
    const macros = await this.resolveMacros(gymId, dto);

    const entry = await this.prisma.foodIntakeEntry.create({
      data: {
        gymId,
        memberUserId,
        status: 'confirmed',
        logDate,
        displayName: dto.displayName,
        quantityGrams: dto.quantityGrams,
        calories: macros.calories,
        proteinG: macros.proteinG,
        carbsG: macros.carbsG,
        fatG: macros.fatG,
        dataSource: dto.foodCatalogId ? 'FITCORE' : 'USER_MANUAL',
        foodCatalogId: dto.foodCatalogId ?? null,
        isEstimate: macros.isEstimate,
        linkedDietMealId: dto.linkedDietMealId ?? null,
        confirmedAt: new Date(),
        confirmedSnapshot: {
          displayName: dto.displayName,
          quantityGrams: dto.quantityGrams,
          ...macros,
        },
      },
    });

    return entry;
  }

  private async resolveMacros(
    memberGymId: string,
    input: {
      quantityGrams: number;
      foodCatalogId?: string;
      calories?: number;
      proteinG?: number;
      carbsG?: number;
      fatG?: number;
    },
  ) {
    if (input.foodCatalogId) {
      return this.calculator.fromCatalogId(
        input.foodCatalogId,
        input.quantityGrams,
        memberGymId,
      );
    }
    if (
      input.calories !== undefined &&
      input.proteinG !== undefined &&
      input.carbsG !== undefined &&
      input.fatG !== undefined
    ) {
      return {
        calories: input.calories,
        proteinG: input.proteinG,
        carbsG: input.carbsG,
        fatG: input.fatG,
        isEstimate: false,
        dataSource: 'USER_MANUAL',
      };
    }
    return this.calculator.aiMacroFallback(input.quantityGrams);
  }

  private extractErrorCode(err: unknown): string {
    if (err instanceof HttpException) {
      const body = err.getResponse();
      if (typeof body === 'object' && body !== null) {
        const code = (body as { code?: string }).code;
        if (typeof code === 'string') return code;
        const nested = (body as { message?: { code?: string } }).message;
        if (typeof nested === 'object' && nested && typeof nested.code === 'string') {
          return nested.code;
        }
      }
      if (err.getStatus() === 503) return 'VISION_UNAVAILABLE';
      if (err.getStatus() === 400) return 'INVALID_IMAGE';
    }
    return 'VISION_FAILED';
  }

  private assertMember(user: AuthUserPayload) {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Members only');
    return { gymId: memberRole.gymId, memberUserId: user.id };
  }

  private assertRateLimit(memberUserId: string) {
    const now = Date.now();
    const hour = 60 * 60 * 1000;
    const row = this.scanCounts.get(memberUserId);
    if (!row || now - row.windowStart > hour) {
      this.scanCounts.set(memberUserId, { windowStart: now, count: 1 });
      return;
    }
    if (row.count >= RATE_LIMIT_PER_HOUR) {
      throw new BadRequestException('Scan rate limit exceeded');
    }
    row.count += 1;
  }

  private todayLogDate(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private toScanDto(scan: {
    id: string;
    status: string;
    logDate: string;
    errorCode: string | null;
    linkedMealId: string | null;
    entries: Array<{
      id: string;
      displayName: string;
      quantityGrams: unknown;
      calories: unknown;
      proteinG: unknown;
      carbsG: unknown;
      fatG: unknown;
      dataSource: string;
      isEstimate: boolean;
      portionConfidence: number | null;
      status: string;
    }>;
  }) {
    return {
      id: scan.id,
      status: scan.status,
      logDate: scan.logDate,
      errorCode: scan.errorCode,
      linkedDietMealId: scan.linkedMealId,
      items: scan.entries.map((e) => ({
        id: e.id,
        displayName: e.displayName,
        quantityGrams: Number(e.quantityGrams),
        calories: Number(e.calories),
        proteinG: Number(e.proteinG),
        carbsG: Number(e.carbsG),
        fatG: Number(e.fatG),
        dataSource: e.dataSource,
        isEstimate: e.isEstimate,
        portionConfidence: e.portionConfidence,
        status: e.status,
      })),
      disclaimer: 'Portion weight from photos is approximate, not exact.',
    };
  }
}