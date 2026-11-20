import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, type AuthUserPayload } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type ScheduleBlockDto = {
  id: string;
  time: string;
  title: string;
  type: 'session' | 'floor' | 'group' | 'break';
  memberEmail?: string;
  durationMin?: number;
  outcome?: string;
};

@Injectable()
export class ScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  private todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  async mySchedule(user: AuthUserPayload) {
    const trainerRole = user.roles.find((r) => r.role === Role.TRAINER);
    if (!trainerRole) throw new ForbiddenException('Trainer only');

    const logDate = this.todayKey();
    const blocks = await this.prisma.trainerScheduleBlock.findMany({
      where: { gymId: trainerRole.gymId, trainerUserId: user.id },
      orderBy: [{ sortOrder: 'asc' }, { timeLabel: 'asc' }],
      include: {
        outcomes: { where: { logDate } },
      },
    });

    const staticBlocks: ScheduleBlockDto[] = blocks.map((b) => ({
      id: b.id,
      time: b.timeLabel,
      title: b.title,
      type: b.blockType as ScheduleBlockDto['type'],
      durationMin: b.durationMin ?? undefined,
      outcome: b.outcomes[0]?.outcome,
    }));

    return { date: logDate, blocks: staticBlocks };
  }

  async setBlockOutcome(
    user: AuthUserPayload,
    blockId: string,
    outcome: string,
    note?: string,
    logDate?: string,
  ) {
    const trainerRole = user.roles.find((r) => r.role === Role.TRAINER);
    if (!trainerRole) throw new ForbiddenException('Trainer only');

    const block = await this.prisma.trainerScheduleBlock.findFirst({
      where: { id: blockId, trainerUserId: user.id, gymId: trainerRole.gymId },
    });
    if (!block) throw new NotFoundException('Block not found');

    const date = logDate?.trim() || this.todayKey();
    const row = await this.prisma.trainerBlockOutcome.upsert({
      where: { blockId_logDate: { blockId, logDate: date } },
      create: {
        gymId: trainerRole.gymId,
        trainerUserId: user.id,
        blockId,
        logDate: date,
        outcome,
        note: note?.trim() || null,
      },
      update: { outcome, note: note?.trim() || null },
    });
    return { ok: true, outcome: row.outcome, logDate: row.logDate };
  }

  async clearBlockOutcome(user: AuthUserPayload, blockId: string, logDate?: string) {
    const trainerRole = user.roles.find((r) => r.role === Role.TRAINER);
    if (!trainerRole) throw new ForbiddenException('Trainer only');
    const date = logDate?.trim() || this.todayKey();
    await this.prisma.trainerBlockOutcome.deleteMany({
      where: { blockId, trainerUserId: user.id, logDate: date },
    });
    return { ok: true };
  }
}