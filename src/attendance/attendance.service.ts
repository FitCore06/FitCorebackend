import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, type AuthUserPayload } from '../auth/auth.types.js';
import { gymRole } from '../auth/guards/roles.guard.js';
import { FitnessService } from '../fitness/fitness.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  dayKeyInTz,
  memberStreakResult,
  restDaysFromWeeklyPlan,
} from './member-streak.logic.js';
import type {
  AttendanceRowDto,
  CheckInSessionDto,
  GymStreakLeaderboardDto,
  MemberAttendanceHistoryDto,
  MemberAttendanceStatsDto,
} from './attendance.types.js';
import type { CheckInDto } from './dto/check-in.dto.js';
import { signCheckInQr, verifyCheckInQr } from './checkin-qr.js';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

function formatTime(iso: Date) {
  return iso.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatDate(iso: Date) {
  return iso.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

const STREAK_TZ = 'Asia/Kolkata';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly fitness: FitnessService,
  ) {}

  private qrSecret() {
    return (
      this.config.get<string>('CHECKIN_QR_SECRET') ??
      this.config.get<string>('JWT_SECRET') ??
      'fitcore-dev-checkin-secret'
    );
  }

  private async restDaysForMember(
    gymId: string,
    memberUserId: string,
    memberEmail: string,
  ) {
    try {
      const plan = await this.fitness.resolveWeeklyPlanForMember(
        gymId,
        memberUserId,
        memberEmail,
      );
      return restDaysFromWeeklyPlan(Array.isArray(plan.days) ? plan.days : []);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return restDaysFromWeeklyPlan([]);
      }
      throw error;
    }
  }

  private makeToken() {
    return `FC-${Date.now().toString(36).toUpperCase()}`;
  }

  private toSession(
    row: {
      id: string;
      gymId: string;
      memberUserId: string;
      branchName: string;
      checkInToken: string | null;
      checkInAt: Date;
      checkOutAt: Date | null;
    },
  ): CheckInSessionDto {
    const token = row.checkInToken ?? '';
    const exp = row.checkInAt.getTime() + 4 * 60 * 60_000;
    const qrPayload = signCheckInQr(
      {
        sid: row.id,
        tok: token,
        g: row.gymId,
        m: row.memberUserId,
        exp,
      },
      this.qrSecret(),
    );
    return {
      id: row.id,
      token,
      qrPayload,
      branchName: row.branchName,
      checkInAt: row.checkInAt.toISOString(),
      checkOutAt: row.checkOutAt?.toISOString() ?? null,
    };
  }

  private rowDto(row: {
    id: string;
    branchName: string;
    checkInAt: Date;
    checkOutAt: Date | null;
    member: { name: string; email: string };
  }): AttendanceRowDto {
    return {
      id: row.id,
      memberName: row.member.name,
      memberEmail: row.member.email,
      checkInAt: formatTime(row.checkInAt),
      checkOutAt: row.checkOutAt ? formatTime(row.checkOutAt) : null,
      branch: row.branchName,
    };
  }

  private async resolveCheckInBranch(
    userId: string,
    gymId: string,
    dto: CheckInDto,
  ) {
    const branch = await this.prisma.branch.findFirst({
      where: dto.branchId
        ? { id: dto.branchId, gymId, status: 'active' }
        : {
            gymId,
            name: dto.branchName?.trim() || 'Main branch',
            status: 'active',
          },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    // Existing users have tenant-wide branch access until explicit grants are
    // provisioned. Once grants exist, access is limited to those branches.
    const [grantCount, grant] = await Promise.all([
      this.prisma.userBranchAccess.count({ where: { userId } }),
      this.prisma.userBranchAccess.findFirst({
        where: { userId, branchId: branch.id },
      }),
    ]);
    if (grantCount > 0 && !grant) {
      throw new ForbiddenException('Not authorized for this branch');
    }
    return branch;
  }

  async checkIn(
    user: AuthUserPayload,
    dto: CheckInDto,
  ): Promise<CheckInSessionDto> {
    const memberRole =
      user.roles.find(
        (r) =>
          r.role === Role.MEMBER &&
          (!dto.gymSlug || r.gymSlug === dto.gymSlug.toLowerCase()),
      ) ?? user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Members only');

    const [structuredMembership, legacyMembership] = await Promise.all([
      this.prisma.memberMembership.findFirst({
        where: { gymId: memberRole.gymId, memberUserId: user.id },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.memberTrainerAssignment.findFirst({
        where: {
          gymId: memberRole.gymId,
          memberUserId: user.id,
          active: true,
          membershipStatus: { in: ['active', 'trial'] },
        },
      }),
    ]);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const membershipAllowed = structuredMembership
      ? ['active', 'trial'].includes(structuredMembership.status) && structuredMembership.endsAt >= today
      : Boolean(legacyMembership);
    if (!membershipAllowed) {
      throw new ForbiddenException('Active membership required');
    }

    const branch = await this.resolveCheckInBranch(
      user.id,
      memberRole.gymId,
      dto,
    );

    const open = await this.prisma.memberCheckIn.findFirst({
      where: {
        memberUserId: user.id,
        gymId: memberRole.gymId,
        checkOutAt: null,
      },
    });
    if (open) {
      throw new BadRequestException(
        'Already checked in — check out before a new visit',
      );
    }

    let row;
    try {
      row = await this.prisma.memberCheckIn.create({
        data: {
          gymId: memberRole.gymId,
          memberUserId: user.id,
          branchId: branch.id,
          branchName: branch.name,
          checkInToken: this.makeToken(),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          'Already checked in — check out before a new visit',
        );
      }
      throw error;
    }
    return this.toSession(row);
  }

  async checkOut(user: AuthUserPayload): Promise<CheckInSessionDto> {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Members only');

    const open = await this.prisma.memberCheckIn.findFirst({
      where: {
        memberUserId: user.id,
        gymId: memberRole.gymId,
        checkOutAt: null,
      },
      orderBy: { checkInAt: 'desc' },
    });
    if (!open) throw new NotFoundException('No active check-in');

    const row = await this.prisma.memberCheckIn.update({
      where: { id: open.id },
      data: { checkOutAt: new Date() },
    });
    return this.toSession(row);
  }

  async myActive(user: AuthUserPayload): Promise<CheckInSessionDto | null> {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) return null;

    const open = await this.prisma.memberCheckIn.findFirst({
      where: {
        memberUserId: user.id,
        gymId: memberRole.gymId,
        checkOutAt: null,
      },
      orderBy: { checkInAt: 'desc' },
    });
    return open ? this.toSession(open) : null;
  }

  async myHistory(
    user: AuthUserPayload,
  ): Promise<MemberAttendanceHistoryDto[]> {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) return [];

    const rows = await this.prisma.memberCheckIn.findMany({
      where: { memberUserId: user.id, gymId: memberRole.gymId },
      orderBy: { checkInAt: 'desc' },
      take: 30,
    });

    return rows.map((r) => ({
      id: r.id,
      date: formatDate(r.checkInAt),
      checkIn: formatTime(r.checkInAt),
      checkOut: r.checkOutAt ? formatTime(r.checkOutAt) : '—',
      branch: r.branchName,
    }));
  }

  async myStats(user: AuthUserPayload): Promise<MemberAttendanceStatsDto> {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) {
      return { streakDays: 0, visitsThisMonth: 0 };
    }

    const now = new Date();
    const monthParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: STREAK_TZ,
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(now);
    const year = monthParts.find((p) => p.type === 'year')?.value ?? '1970';
    const month = monthParts.find((p) => p.type === 'month')?.value ?? '01';
    const monthStart = new Date(`${year}-${month}-01T00:00:00+05:30`);

    const rows = await this.prisma.memberCheckIn.findMany({
      where: { memberUserId: user.id, gymId: memberRole.gymId },
      select: { checkInAt: true },
      orderBy: { checkInAt: 'desc' },
      take: 366,
    });

    const visitDays = new Set<string>();
    let visitsThisMonth = 0;
    for (const row of rows) {
      const key = dayKeyInTz(row.checkInAt);
      visitDays.add(key);
      if (row.checkInAt >= monthStart) visitsThisMonth += 1;
    }

    const restByWeekday = await this.restDaysForMember(
      memberRole.gymId,
      user.id,
      user.email,
    );
    const streak = memberStreakResult(visitDays, restByWeekday);

    return {
      streakDays: streak.streakDays,
      visitsThisMonth,
      streakBroken: streak.streakBroken,
      breakMessage: streak.breakMessage,
      missedTrainingDays: streak.missedTrainingDays,
    };
  }

  async gymStreakLeaderboard(
    user: AuthUserPayload,
  ): Promise<GymStreakLeaderboardDto> {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Members only');

    const since = new Date();
    since.setDate(since.getDate() - 400);

    const [memberRoles, checkIns] = await Promise.all([
      this.prisma.userTenantRole.findMany({
        where: { gymId: memberRole.gymId, role: Role.MEMBER },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              profilePhotoData: true,
            },
          },
        },
      }),
      this.prisma.memberCheckIn.findMany({
        where: { gymId: memberRole.gymId, checkInAt: { gte: since } },
        select: { memberUserId: true, checkInAt: true },
      }),
    ]);

    const visitsByMember = new Map<string, Set<string>>();
    for (const row of checkIns) {
      let set = visitsByMember.get(row.memberUserId);
      if (!set) {
        set = new Set<string>();
        visitsByMember.set(row.memberUserId, set);
      }
      set.add(dayKeyInTz(row.checkInAt));
    }

    const scored: {
      userId: string;
      name: string;
      streakDays: number;
      hasProfilePhoto: boolean;
    }[] = [];
    const detailByUser = new Map<
      string,
      ReturnType<typeof memberStreakResult>
    >();

    for (const role of memberRoles) {
      const visitDays = visitsByMember.get(role.userId) ?? new Set<string>();
      const restByWeekday = await this.restDaysForMember(
        memberRole.gymId,
        role.userId,
        role.user.email,
      );
      const result = memberStreakResult(visitDays, restByWeekday);
      detailByUser.set(role.userId, result);
      scored.push({
        userId: role.userId,
        name: role.user.name,
        streakDays: result.streakDays,
        hasProfilePhoto: Boolean(role.user.profilePhotoData),
      });
    }

    scored.sort(
      (a, b) =>
        b.streakDays - a.streakDays ||
        a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
    );

    const rows = scored.map((row, index) => ({
      rank: index + 1,
      userId: row.userId,
      name: row.name,
      streakDays: row.streakDays,
      hasProfilePhoto: row.hasProfilePhoto,
      isYou: row.userId === user.id,
    }));

    const youIdx = scored.findIndex((r) => r.userId === user.id);
    const youRole = memberRoles.find((r) => r.userId === user.id);
    const youDetail = detailByUser.get(user.id) ?? {
      streakDays: 0,
      streakBroken: false,
      missedTrainingDays: 0,
      breakMessage: null,
    };

    return {
      rows,
      you: {
        rank: youIdx >= 0 ? youIdx + 1 : null,
        userId: user.id,
        name: youRole?.user.name ?? user.name ?? 'You',
        streakDays: youDetail.streakDays,
        hasProfilePhoto: Boolean(youRole?.user.profilePhotoData),
        streakBroken: youDetail.streakBroken,
        breakMessage: youDetail.breakMessage,
        missedTrainingDays: youDetail.missedTrainingDays,
      },
    };
  }

  async liveForGym(
    user: AuthUserPayload,
    gymSlug: string,
  ): Promise<AttendanceRowDto[]> {
    const admin = gymRole(user, Role.GYM_ADMIN, gymSlug);
    if (!admin) throw new ForbiddenException('Gym admin only');

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: gymSlug.toLowerCase() },
    });
    if (!tenant) throw new NotFoundException('Gym not found');

    const rows = await this.prisma.memberCheckIn.findMany({
      where: { gymId: tenant.id, checkOutAt: null },
      include: { member: true },
      orderBy: { checkInAt: 'asc' },
    });
    return rows.map((r) => this.rowDto(r));
  }

  async recentForGym(
    user: AuthUserPayload,
    gymSlug: string,
    limit = 40,
  ): Promise<AttendanceRowDto[]> {
    const admin = gymRole(user, Role.GYM_ADMIN, gymSlug);
    if (!admin) throw new ForbiddenException('Gym admin only');

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: gymSlug.toLowerCase() },
    });
    if (!tenant) throw new NotFoundException('Gym not found');

    const rows = await this.prisma.memberCheckIn.findMany({
      where: { gymId: tenant.id },
      include: { member: true },
      orderBy: { checkInAt: 'desc' },
      take: Math.min(limit, 100),
    });
    return rows.map((r) => this.rowDto(r));
  }

  async verifyQrPayload(
    user: AuthUserPayload,
    gymSlug: string,
    qrPayload: string,
  ) {
    const admin = gymRole(user, Role.GYM_ADMIN, gymSlug);
    if (!admin) throw new ForbiddenException('Gym admin only');
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: gymSlug.toLowerCase() },
    });
    if (!tenant) throw new NotFoundException('Gym not found');

    let payload;
    try {
      payload = verifyCheckInQr(qrPayload, this.qrSecret());
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Invalid QR',
      );
    }
    if (payload.g !== tenant.id) {
      throw new BadRequestException('QR is for another gym');
    }

    const session = await this.prisma.memberCheckIn.findFirst({
      where: { id: payload.sid, gymId: tenant.id },
      include: { member: true },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.checkOutAt) {
      throw new BadRequestException('Member already checked out');
    }

    return {
      valid: true,
      sessionId: session.id,
      memberName: session.member.name,
      memberEmail: session.member.email,
      branchName: session.branchName,
      token: payload.tok,
      checkInAt: session.checkInAt.toISOString(),
    };
  }

  async liveCount(gymSlug: string): Promise<number> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: gymSlug.toLowerCase() },
    });
    if (!tenant) return 0;
    return this.prisma.memberCheckIn.count({
      where: { gymId: tenant.id, checkOutAt: null },
    });
  }

  async gymPulseForMember(user: AuthUserPayload): Promise<{ checkedInNow: number }> {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) return { checkedInNow: 0 };
    const checkedInNow = await this.prisma.memberCheckIn.count({
      where: { gymId: memberRole.gymId, checkOutAt: null },
    });
    return { checkedInNow };
  }
}
