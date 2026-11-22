import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, type AuthUserPayload } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  assignmentScheduleId,
  parseAssignmentScheduleId,
  scheduleDayLabel,
  sortScheduleBlocksByTime,
  timeLabelFromNextSessionNote,
  upcomingDateKeys,
} from './schedule-time.util.js';

export type ScheduleBlockDto = {
  id: string;
  time: string;
  title: string;
  type: 'session' | 'floor' | 'group' | 'break';
  memberEmail?: string;
  durationMin?: number;
  outcome?: string;
  fromAssignment?: boolean;
  sortOrder?: number;
  logDate?: string;
};

export type ScheduleDayDto = {
  date: string;
  label: string;
  blocks: ScheduleBlockDto[];
};

const ACTIVE_ASSIGNMENT_STATUSES = ['active', 'trial'] as const;

@Injectable()
export class ScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  private todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  async mySchedule(user: AuthUserPayload, dayCount = 3) {
    const trainerRole = user.roles.find((r) => r.role === Role.TRAINER);
    if (!trainerRole) throw new ForbiddenException('Trainer only');

    const today = this.todayKey();
    const dateKeys = upcomingDateKeys(today, dayCount);

    const [assignments, staticSchedule] = await Promise.all([
      this.prisma.memberTrainerAssignment.findMany({
        where: {
          gymId: trainerRole.gymId,
          trainerUserId: user.id,
          active: true,
          membershipStatus: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
          OR: [
            { planEndsAt: null },
            { planEndsAt: { gte: new Date(`${today}T00:00:00.000Z`) } },
          ],
        },
        include: {
          member: { select: { name: true, email: true } },
          sessionOutcomes: { where: { logDate: { in: dateKeys } } },
        },
        orderBy: { member: { name: 'asc' } },
      }),
      this.prisma.trainerScheduleBlock.findMany({
        where: { gymId: trainerRole.gymId, trainerUserId: user.id },
        orderBy: [{ sortOrder: 'asc' }, { timeLabel: 'asc' }],
        include: {
          outcomes: { where: { logDate: { in: dateKeys } } },
        },
      }),
    ]);

    const days: ScheduleDayDto[] = dateKeys.map((logDate) => {
      const dayAssignments = assignments.filter((a) => {
        if (!a.planEndsAt) return true;
        const ends = a.planEndsAt.toISOString().slice(0, 10);
        return logDate <= ends;
      });

      const assignmentBlocks: ScheduleBlockDto[] = dayAssignments.map((a, index) => {
        const outcome = a.sessionOutcomes.find((o) => o.logDate === logDate);
        return {
          id: assignmentScheduleId(a.id),
          time: timeLabelFromNextSessionNote(a.nextSessionNote),
          title: `PT — ${a.member.name}`,
          type: 'session' as const,
          memberEmail: a.member.email,
          durationMin: 60,
          outcome: outcome?.outcome,
          fromAssignment: true,
          sortOrder: index,
          logDate,
        };
      });

      const staticBlocks: ScheduleBlockDto[] = staticSchedule.map((b) => {
        const outcome = b.outcomes.find((o) => o.logDate === logDate);
        return {
          id: b.id,
          time: b.timeLabel,
          title: b.title,
          type: b.blockType as ScheduleBlockDto['type'],
          durationMin: b.durationMin ?? undefined,
          outcome: outcome?.outcome,
          sortOrder: 100 + b.sortOrder,
          logDate,
        };
      });

      const blocks = sortScheduleBlocksByTime([...assignmentBlocks, ...staticBlocks]);
      return {
        date: logDate,
        label: scheduleDayLabel(logDate, today),
        blocks,
      };
    });

    return {
      date: today,
      days,
      blocks: days[0]?.blocks ?? [],
    };
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

    const date = logDate?.trim() || this.todayKey();
    const assignmentId = parseAssignmentScheduleId(blockId);

    if (assignmentId) {
      const assignment = await this.prisma.memberTrainerAssignment.findFirst({
        where: {
          id: assignmentId,
          trainerUserId: user.id,
          gymId: trainerRole.gymId,
          active: true,
        },
      });
      if (!assignment) throw new NotFoundException('Assignment session not found');

      const row = await this.prisma.trainerAssignmentSessionOutcome.upsert({
        where: { assignmentId_logDate: { assignmentId, logDate: date } },
        create: {
          gymId: trainerRole.gymId,
          trainerUserId: user.id,
          assignmentId,
          logDate: date,
          outcome,
          note: note?.trim() || null,
        },
        update: { outcome, note: note?.trim() || null },
      });
      return { ok: true, outcome: row.outcome, logDate: row.logDate };
    }

    const block = await this.prisma.trainerScheduleBlock.findFirst({
      where: { id: blockId, trainerUserId: user.id, gymId: trainerRole.gymId },
    });
    if (!block) throw new NotFoundException('Block not found');

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

    const assignmentId = parseAssignmentScheduleId(blockId);
    if (assignmentId) {
      await this.prisma.trainerAssignmentSessionOutcome.deleteMany({
        where: { assignmentId, trainerUserId: user.id, logDate: date },
      });
      return { ok: true };
    }

    await this.prisma.trainerBlockOutcome.deleteMany({
      where: { blockId, trainerUserId: user.id, logDate: date },
    });
    return { ok: true };
  }
}