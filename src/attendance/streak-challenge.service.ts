import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUserPayload } from '../auth/auth.types.js';
import { Role } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateStreakChallengeDto } from './dto/create-streak-challenge.dto.js';
import type { DeclareStreakChallengeDto } from './dto/declare-streak-challenge.dto.js';
import type { RespondStreakChallengeDto } from './dto/respond-streak-challenge.dto.js';
import { streakChallengeGymTodayYmd } from './streak-challenge-day.js';

export type StreakChallengeProgressDto = {
  started: boolean;
  completedSetNumbers: number[];
  finishedAllSets: boolean;
};

export type StreakChallengeDto = {
  id: string;
  status:
    | 'pending'
    | 'accepted'
    | 'rejected'
    | 'cancelled'
    | 'active'
    | 'completed'
    | 'expired';
  createdAt: string;
  respondedAt: string | null;
  activeDay: string | null;
  completedAt: string | null;
  exerciseId: string | null;
  exerciseName: string;
  setCount: number;
  targetWeightKg: number;
  challenger: { userId: string; name: string };
  challenged: { userId: string; name: string };
  opponent: { userId: string; name: string };
  youAreChallenger: boolean;
  winnerUserId: string | null;
  winReason: string | null;
  yourProgress: StreakChallengeProgressDto;
  theirProgress: StreakChallengeProgressDto;
  finalScore: { challenger: number; challenged: number };
  winner: { userId: string; name: string } | null;
  loser: { userId: string; name: string } | null;
  outcomeForYou:
    | 'won'
    | 'lost'
    | 'tie'
    | 'cancelled'
    | 'rejected'
    | 'declined'
    | 'in_progress'
    | 'awaiting_response'
    | null;
  statusLabel: string;
  winReasonLabel: string | null;
  cancelledBy: { userId: string; name: string } | null;
};

const challengeInclude = {
  challenger: { select: { id: true, name: true } },
  challenged: { select: { id: true, name: true } },
  cancelledBy: { select: { id: true, name: true } },
  setCompletions: { select: { userId: true, setNumber: true } },
} as const;

type ChallengeWithRelations = {
  id: string;
  status: string;
  createdAt: Date;
  respondedAt: Date | null;
  activeDay: string | null;
  completedAt: Date | null;
  exerciseId: string | null;
  exerciseName: string;
  setCount: number;
  targetWeightKg: number;
  challengerUserId: string;
  challengedUserId: string;
  winnerUserId: string | null;
  winReason: string | null;
  cancelledByUserId: string | null;
  challengerStartedAt: Date | null;
  challengedStartedAt: Date | null;
  challenger: { id: string; name: string };
  challenged: { id: string; name: string };
  cancelledBy: { id: string; name: string } | null;
  setCompletions: { userId: string; setNumber: number }[];
};

@Injectable()
export class StreakChallengeService {
  constructor(private readonly prisma: PrismaService) {}

  async listForMember(user: AuthUserPayload) {
    const { gymId, memberUserId } = this.assertMember(user);
    await this.expireStaleForGym(gymId);

    const rows = await this.prisma.memberStreakChallenge.findMany({
      where: {
        gymId,
        OR: [{ challengerUserId: memberUserId }, { challengedUserId: memberUserId }],
      },
      include: challengeInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const incoming = rows.filter(
      (r) => r.challengedUserId === memberUserId && r.status === 'pending',
    );
    const outgoing = rows.filter(
      (r) => r.challengerUserId === memberUserId && r.status === 'pending',
    );
    const active = rows.filter((r) =>
      ['accepted', 'active'].includes(r.status),
    );
    const history = rows.filter((r) =>
      ['rejected', 'cancelled', 'completed', 'expired'].includes(r.status),
    );

    return {
      incoming: incoming.map((r) => this.toDto(r, memberUserId)),
      outgoing: outgoing.map((r) => this.toDto(r, memberUserId)),
      active: active.map((r) => this.toDto(r, memberUserId)),
      history: history.map((r) => this.toDto(r, memberUserId)),
    };
  }

  async historyForMember(
    user: AuthUserPayload,
    opts?: { limit?: number; offset?: number },
  ) {
    const { gymId, memberUserId } = this.assertMember(user);
    await this.expireStaleForGym(gymId);

    const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 200);
    const offset = Math.max(opts?.offset ?? 0, 0);

    const where = {
      gymId,
      OR: [{ challengerUserId: memberUserId }, { challengedUserId: memberUserId }],
      status: {
        in: ['rejected', 'cancelled', 'completed', 'expired'],
      },
    };

    const [total, rows] = await Promise.all([
      this.prisma.memberStreakChallenge.count({ where }),
      this.prisma.memberStreakChallenge.findMany({
        where,
        include: challengeInclude,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);

    return {
      total,
      items: rows.map((r) => this.toDto(r, memberUserId)),
    };
  }

  async create(user: AuthUserPayload, dto: CreateStreakChallengeDto) {
    const { gymId, memberUserId } = this.assertMember(user);
    const challengedId = dto.challengedUserId.trim();

    if (challengedId === memberUserId) {
      throw new BadRequestException('Cannot challenge yourself');
    }

    const peer = await this.prisma.userTenantRole.findFirst({
      where: { gymId, userId: challengedId, role: Role.MEMBER },
      include: { user: { select: { name: true } } },
    });
    if (!peer) {
      throw new BadRequestException('Member not found in your gym');
    }

    const challenger = await this.prisma.user.findUnique({
      where: { id: memberUserId },
      select: { name: true },
    });
    const challengerName = challenger?.name ?? 'A member';

    const existing = await this.prisma.memberStreakChallenge.findFirst({
      where: {
        gymId,
        challengerUserId: memberUserId,
        challengedUserId: challengedId,
        status: 'pending',
      },
    });
    if (existing) {
      throw new BadRequestException('Challenge already pending for this member');
    }

    const exerciseId = dto.exerciseId?.trim() || null;
    let exerciseName = dto.exerciseName.trim();
    if (exerciseId) {
      const exercise = await this.prisma.exercise.findFirst({
        where: {
          id: exerciseId,
          OR: [{ gymId: null }, { gymId }],
        },
        select: { name: true },
      });
      if (!exercise) {
        throw new BadRequestException('Exercise not found');
      }
      exerciseName = exercise.name;
    }
    if (!exerciseName) {
      throw new BadRequestException('Exercise is required');
    }

    const setCount = dto.setCount;
    const targetWeightKg = dto.targetWeightKg;
    const terms = this.formatTerms(exerciseName, setCount, targetWeightKg);

    const note = dto.message?.trim();
    const row = await this.prisma.memberStreakChallenge.create({
      data: {
        gymId,
        challengerUserId: memberUserId,
        challengedUserId: challengedId,
        exerciseId,
        exerciseName,
        setCount,
        targetWeightKg,
        status: 'pending',
      },
      include: challengeInclude,
    });

    const body = note
      ? `${challengerName} challenged you: ${terms}. "${note}" — open Streaks to accept or reject.`
      : `${challengerName} challenged you: ${terms}. Open Streaks to accept or reject.`;

    await this.prisma.gymNotification.create({
      data: {
        gymId,
        userId: challengedId,
        title: 'Streak challenge',
        body,
        dedupeKey: `streak-challenge:invite:${row.id}`,
      },
    });

    return this.toDto(row, memberUserId);
  }

  async respond(
    user: AuthUserPayload,
    challengeId: string,
    dto: RespondStreakChallengeDto,
  ) {
    const { gymId, memberUserId } = this.assertMember(user);

    const row = await this.prisma.memberStreakChallenge.findFirst({
      where: { id: challengeId, gymId, challengedUserId: memberUserId },
      include: challengeInclude,
    });
    if (!row) throw new NotFoundException('Challenge not found');
    if (row.status !== 'pending') {
      throw new BadRequestException('Challenge already answered');
    }

    const status = dto.decision === 'accept' ? 'accepted' : 'rejected';
    const updated = await this.prisma.memberStreakChallenge.update({
      where: { id: row.id },
      data: { status, respondedAt: new Date() },
      include: challengeInclude,
    });

    const challengedName = row.challenged.name;
    const terms = this.formatTerms(
      row.exerciseName,
      row.setCount,
      row.targetWeightKg,
    );
    const title =
      status === 'accepted' ? 'Challenge accepted' : 'Challenge declined';
    const body =
      status === 'accepted'
        ? `${challengedName} accepted your challenge (${terms}). Both of you can Start on Streaks today — finish all sets before midnight.`
        : `${challengedName} declined your challenge (${terms}).`;

    await this.prisma.gymNotification.create({
      data: {
        gymId,
        userId: row.challengerUserId,
        title,
        body,
        dedupeKey: `streak-challenge:${status}:${row.id}`,
      },
    });

    return this.toDto(updated, memberUserId);
  }

  async cancel(user: AuthUserPayload, challengeId: string) {
    const { gymId, memberUserId } = this.assertMember(user);

    const row = await this.prisma.memberStreakChallenge.findFirst({
      where: { id: challengeId, gymId, challengerUserId: memberUserId },
      include: challengeInclude,
    });
    if (!row) throw new NotFoundException('Challenge not found');
    if (row.status !== 'pending') {
      throw new BadRequestException('Only pending challenges can be cancelled');
    }

    const updated = await this.prisma.memberStreakChallenge.update({
      where: { id: row.id },
      data: {
        status: 'cancelled',
        respondedAt: new Date(),
        cancelledByUserId: memberUserId,
      },
      include: challengeInclude,
    });

    const challengerName = row.challenger.name;
    const terms = this.formatTerms(
      row.exerciseName,
      row.setCount,
      row.targetWeightKg,
    );

    await this.prisma.gymNotification.create({
      data: {
        gymId,
        userId: row.challengedUserId,
        title: 'Challenge cancelled',
        body: `${challengerName} cancelled the streak challenge (${terms}).`,
        dedupeKey: `streak-challenge:cancelled:${row.id}`,
      },
    });

    return this.toDto(updated, memberUserId);
  }

  async start(user: AuthUserPayload, challengeId: string) {
    const { gymId, memberUserId } = this.assertMember(user);
    await this.expireStaleForGym(gymId);

    const row = await this.loadParticipantChallenge(challengeId, gymId, memberUserId);
    if (!['accepted', 'active'].includes(row.status)) {
      throw new BadRequestException('Challenge is not ready to start');
    }

    const today = streakChallengeGymTodayYmd();
    if (row.activeDay && row.activeDay !== today) {
      throw new BadRequestException('This challenge day has ended');
    }

    const isChallenger = row.challengerUserId === memberUserId;
    const alreadyStarted = isChallenger
      ? row.challengerStartedAt
      : row.challengedStartedAt;
    if (alreadyStarted) {
      return this.toDto(row, memberUserId);
    }

    const data: {
      status: string;
      activeDay: string;
      challengerStartedAt?: Date;
      challengedStartedAt?: Date;
    } = {
      status: 'active',
      activeDay: row.activeDay ?? today,
    };
    if (isChallenger) data.challengerStartedAt = new Date();
    else data.challengedStartedAt = new Date();

    const updated = await this.prisma.memberStreakChallenge.update({
      where: { id: row.id },
      data,
      include: challengeInclude,
    });

    const opponentId = this.opponentUserId(row, memberUserId);
    const userName = isChallenger ? row.challenger.name : row.challenged.name;
    await this.prisma.gymNotification.create({
      data: {
        gymId,
        userId: opponentId,
        title: 'Challenge started',
        body: `${userName} started today's duel. Mark each set when you hit ${this.formatTerms(row.exerciseName, row.setCount, row.targetWeightKg)}.`,
        dedupeKey: `streak-challenge:started:${row.id}:${memberUserId}`,
      },
    });

    return this.toDto(updated, memberUserId);
  }

  async completeSet(
    user: AuthUserPayload,
    challengeId: string,
    setNumber: number,
  ) {
    const { gymId, memberUserId } = this.assertMember(user);
    await this.expireStaleForGym(gymId);

    if (!Number.isInteger(setNumber) || setNumber < 1) {
      throw new BadRequestException('Invalid set number');
    }

    const row = await this.loadParticipantChallenge(challengeId, gymId, memberUserId);
    if (row.status !== 'active') {
      throw new BadRequestException('Challenge is not live');
    }
    const today = streakChallengeGymTodayYmd();
    if (row.activeDay !== today) {
      throw new BadRequestException('Challenge day has ended');
    }

    const isChallenger = row.challengerUserId === memberUserId;
    const startedAt = isChallenger
      ? row.challengerStartedAt
      : row.challengedStartedAt;
    if (!startedAt) {
      throw new BadRequestException('Tap Start before logging sets');
    }

    if (setNumber > row.setCount) {
      throw new BadRequestException('Set number exceeds challenge');
    }

    const existing = row.setCompletions.find(
      (s) => s.userId === memberUserId && s.setNumber === setNumber,
    );
    if (existing) {
      return this.toDto(row, memberUserId);
    }

    await this.prisma.memberStreakChallengeSetCompletion.create({
      data: {
        challengeId: row.id,
        userId: memberUserId,
        setNumber,
      },
    });

    const refreshed = await this.prisma.memberStreakChallenge.findFirst({
      where: { id: row.id },
      include: challengeInclude,
    });
    if (!refreshed) throw new NotFoundException('Challenge not found');

    const finished = this.userFinished(refreshed, memberUserId);
    if (finished) {
      const opponentId = this.opponentUserId(refreshed, memberUserId);
      const userName = isChallenger
        ? refreshed.challenger.name
        : refreshed.challenged.name;
      await this.prisma.gymNotification.create({
        data: {
          gymId,
          userId: opponentId,
          title: 'Opponent finished sets',
          body: `${userName} logged all ${row.setCount} sets. Finish yours to close the duel.`,
          dedupeKey: `streak-challenge:all-sets:${row.id}:${memberUserId}`,
        },
      });
    }

    const finalized = await this.tryFinalizeIfBothDone(refreshed, gymId);
    return this.toDto(finalized ?? refreshed, memberUserId);
  }

  async declare(
    user: AuthUserPayload,
    challengeId: string,
    dto: DeclareStreakChallengeDto,
  ) {
    const { gymId, memberUserId } = this.assertMember(user);
    await this.expireStaleForGym(gymId);

    const row = await this.loadParticipantChallenge(challengeId, gymId, memberUserId);
    if (!['accepted', 'active'].includes(row.status)) {
      throw new BadRequestException('Challenge is not live');
    }
    const today = streakChallengeGymTodayYmd();
    if (row.activeDay && row.activeDay !== today) {
      throw new BadRequestException('Challenge day has ended');
    }

    const opponentId = this.opponentUserId(row, memberUserId);
    let winnerId: string;
    let reason: string;
    if (dto.outcome === 'concede') {
      winnerId = opponentId;
      reason = 'conceded';
    } else {
      winnerId = memberUserId;
      reason = 'claimed_win';
    }

    const updated = await this.finalizeChallenge(row, {
      gymId,
      status: 'completed',
      winnerUserId: winnerId,
      winReason: reason,
      notifyBoth: true,
    });

    return this.toDto(updated, memberUserId);
  }

  private async expireStaleForGym(gymId: string) {
    const today = streakChallengeGymTodayYmd();
    const stale = await this.prisma.memberStreakChallenge.findMany({
      where: {
        gymId,
        status: 'active',
        activeDay: { not: null, lt: today },
      },
      include: challengeInclude,
    });
    for (const row of stale) {
      await this.finalizeChallenge(row, {
        gymId,
        status: 'expired',
        winnerUserId: this.pickWinnerBySetCount(row),
        winReason: 'day_ended',
        notifyBoth: true,
      });
    }
  }

  private pickWinnerBySetCount(row: ChallengeWithRelations): string | null {
    const a = this.completedSetCount(row, row.challengerUserId);
    const b = this.completedSetCount(row, row.challengedUserId);
    if (a === b) return null;
    return a > b ? row.challengerUserId : row.challengedUserId;
  }

  private async tryFinalizeIfBothDone(
    row: ChallengeWithRelations,
    gymId: string,
  ) {
    const challengerDone = this.userFinished(row, row.challengerUserId);
    const challengedDone = this.userFinished(row, row.challengedUserId);
    if (!challengerDone || !challengedDone) return null;

    return this.finalizeChallenge(row, {
      gymId,
      status: 'completed',
      winnerUserId: this.pickWinnerBySetCount(row),
      winReason: 'all_sets_done',
      notifyBoth: true,
    });
  }

  private async finalizeChallenge(
    row: ChallengeWithRelations,
    opts: {
      gymId: string;
      status: 'completed' | 'expired';
      winnerUserId: string | null;
      winReason: string;
      notifyBoth: boolean;
    },
  ) {
    const updated = await this.prisma.memberStreakChallenge.update({
      where: { id: row.id },
      data: {
        status: opts.status,
        winnerUserId: opts.winnerUserId,
        winReason: opts.winReason,
        completedAt: new Date(),
      },
      include: challengeInclude,
    });

    if (!opts.notifyBoth) return updated;

    const terms = this.formatTerms(
      row.exerciseName,
      row.setCount,
      row.targetWeightKg,
    );
    const challengerSets = this.completedSetCount(row, row.challengerUserId);
    const challengedSets = this.completedSetCount(row, row.challengedUserId);
    let resultLine: string;
    if (!opts.winnerUserId) {
      resultLine = `Tie (${challengerSets} vs ${challengedSets} sets) on ${terms}.`;
    } else {
      const winnerName =
        opts.winnerUserId === row.challengerUserId
          ? row.challenger.name
          : row.challenged.name;
      resultLine = `${winnerName} wins (${challengerSets}–${challengedSets} sets) — ${terms}.`;
    }

    const title =
      opts.status === 'expired' ? 'Challenge day ended' : 'Challenge result';
    for (const userId of [row.challengerUserId, row.challengedUserId]) {
      await this.prisma.gymNotification.create({
        data: {
          gymId: opts.gymId,
          userId,
          title,
          body: resultLine,
          dedupeKey: `streak-challenge:result:${row.id}:${opts.winReason}`,
        },
      });
    }

    return updated;
  }

  private async loadParticipantChallenge(
    challengeId: string,
    gymId: string,
    memberUserId: string,
  ) {
    const row = await this.prisma.memberStreakChallenge.findFirst({
      where: {
        id: challengeId,
        gymId,
        OR: [
          { challengerUserId: memberUserId },
          { challengedUserId: memberUserId },
        ],
      },
      include: challengeInclude,
    });
    if (!row) throw new NotFoundException('Challenge not found');
    return row;
  }

  private completedSetCount(row: ChallengeWithRelations, userId: string) {
    return row.setCompletions.filter((s) => s.userId === userId).length;
  }

  private userFinished(row: ChallengeWithRelations, userId: string) {
    return this.completedSetCount(row, userId) >= row.setCount;
  }

  private opponentUserId(row: ChallengeWithRelations, viewerId: string) {
    return row.challengerUserId === viewerId
      ? row.challengedUserId
      : row.challengerUserId;
  }

  private progressFor(
    row: ChallengeWithRelations,
    userId: string,
  ): StreakChallengeProgressDto {
    const isChallenger = row.challengerUserId === userId;
    const started = Boolean(
      isChallenger ? row.challengerStartedAt : row.challengedStartedAt,
    );
    const completedSetNumbers = row.setCompletions
      .filter((s) => s.userId === userId)
      .map((s) => s.setNumber)
      .sort((a, b) => a - b);
    return {
      started,
      completedSetNumbers,
      finishedAllSets: completedSetNumbers.length >= row.setCount,
    };
  }

  private formatTerms(
    exerciseName: string,
    setCount: number,
    targetWeightKg: number,
  ): string {
    const weight =
      targetWeightKg > 0 ? `up to ${targetWeightKg} kg` : 'bodyweight';
    return `${exerciseName} · ${setCount} sets · ${weight}`;
  }

  private resolveOutcomeForYou(
    row: ChallengeWithRelations,
    viewerUserId: string,
  ): StreakChallengeDto['outcomeForYou'] {
    if (row.status === 'pending') {
      return row.challengedUserId === viewerUserId
        ? 'awaiting_response'
        : 'in_progress';
    }
    if (['accepted', 'active'].includes(row.status)) return 'in_progress';
    if (row.status === 'cancelled') return 'cancelled';
    if (row.status === 'rejected') {
      return row.challengerUserId === viewerUserId ? 'declined' : 'rejected';
    }
    if (!row.winnerUserId) return 'tie';
    return row.winnerUserId === viewerUserId ? 'won' : 'lost';
  }

  private statusLabel(status: string): string {
    const map: Record<string, string> = {
      pending: 'Pending',
      accepted: 'Accepted',
      active: 'Live',
      rejected: 'Declined',
      cancelled: 'Cancelled',
      completed: 'Completed',
      expired: 'Day ended',
    };
    return map[status] ?? status;
  }

  private winReasonLabel(reason: string | null): string | null {
    if (!reason) return null;
    const map: Record<string, string> = {
      all_sets_done: 'Both finished sets',
      day_ended: 'Midnight cutoff',
      claimed_win: 'Declared win',
      conceded: 'Conceded loss',
    };
    return map[reason] ?? reason;
  }

  private toDto(
    row: ChallengeWithRelations,
    viewerUserId: string,
  ): StreakChallengeDto {
    const youAreChallenger = row.challengerUserId === viewerUserId;
    const opponent = youAreChallenger ? row.challenged : row.challenger;
    const yourProgress = this.progressFor(
      row,
      viewerUserId,
    );
    const theirProgress = this.progressFor(row, opponent.id);

    const challengerScore = this.completedSetCount(row, row.challengerUserId);
    const challengedScore = this.completedSetCount(row, row.challengedUserId);

    let winner: StreakChallengeDto['winner'] = null;
    let loser: StreakChallengeDto['loser'] = null;
    if (row.winnerUserId) {
      if (row.winnerUserId === row.challengerUserId) {
        winner = {
          userId: row.challenger.id,
          name: row.challenger.name,
        };
        loser = {
          userId: row.challenged.id,
          name: row.challenged.name,
        };
      } else {
        winner = {
          userId: row.challenged.id,
          name: row.challenged.name,
        };
        loser = {
          userId: row.challenger.id,
          name: row.challenger.name,
        };
      }
    }

    return {
      id: row.id,
      status: row.status as StreakChallengeDto['status'],
      createdAt: row.createdAt.toISOString(),
      respondedAt: row.respondedAt?.toISOString() ?? null,
      activeDay: row.activeDay,
      completedAt: row.completedAt?.toISOString() ?? null,
      exerciseId: row.exerciseId,
      exerciseName: row.exerciseName,
      setCount: row.setCount,
      targetWeightKg: row.targetWeightKg,
      challenger: { userId: row.challenger.id, name: row.challenger.name },
      challenged: { userId: row.challenged.id, name: row.challenged.name },
      opponent: { userId: opponent.id, name: opponent.name },
      youAreChallenger,
      winnerUserId: row.winnerUserId,
      winReason: row.winReason,
      yourProgress,
      theirProgress,
      finalScore: { challenger: challengerScore, challenged: challengedScore },
      winner,
      loser,
      outcomeForYou: this.resolveOutcomeForYou(row, viewerUserId),
      statusLabel: this.statusLabel(row.status),
      winReasonLabel: this.winReasonLabel(row.winReason),
      cancelledBy: row.cancelledBy
        ? { userId: row.cancelledBy.id, name: row.cancelledBy.name }
        : row.status === 'cancelled'
          ? {
              userId: row.challengerUserId,
              name: row.challenger.name,
            }
          : null,
    };
  }

  private assertMember(user: AuthUserPayload) {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Members only');
    return { gymId: memberRole.gymId, memberUserId: user.id };
  }
}