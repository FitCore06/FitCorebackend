import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthUserPayload } from '../auth/auth.types.js';
import { Role } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class NutritionHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  private memberScope(user: AuthUserPayload) {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Members only');
    return { gymId: memberRole.gymId, memberUserId: user.id };
  }

  async dailySummary(user: AuthUserPayload, logDate: string) {
    const { gymId, memberUserId } = this.memberScope(user);
    const rows = await this.prisma.foodIntakeEntry.findMany({
      where: {
        gymId,
        memberUserId,
        logDate,
        status: 'confirmed',
      },
    });
    let calories = 0;
    let proteinG = 0;
    let carbsG = 0;
    let fatG = 0;
    for (const r of rows) {
      calories += Number(r.calories);
      proteinG += Number(r.proteinG);
      carbsG += Number(r.carbsG);
      fatG += Number(r.fatG);
    }
    return {
      logDate,
      entryCount: rows.length,
      calories: round2(calories),
      proteinG: round2(proteinG),
      carbsG: round2(carbsG),
      fatG: round2(fatG),
    };
  }

  async history(
    user: AuthUserPayload,
    from: string,
    to: string,
    cursor?: string,
    take = 30,
  ) {
    const { gymId, memberUserId } = this.memberScope(user);
    const rows = await this.prisma.foodIntakeEntry.findMany({
      where: {
        gymId,
        memberUserId,
        status: 'confirmed',
        logDate: { gte: from, lte: to },
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: [{ logDate: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });
    const page = rows.slice(0, take);
    const nextCursor = rows.length > take ? page[page.length - 1]?.id : null;
    return { items: page, nextCursor };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}