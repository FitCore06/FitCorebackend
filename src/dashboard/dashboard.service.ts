import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, type AuthUserPayload } from '../auth/auth.types.js';
import { gymRole } from '../auth/guards/roles.guard.js';
import { AssignmentsService } from '../assignments/assignments.service.js';
import { AttendanceService } from '../attendance/attendance.service.js';
import { FitnessService } from '../fitness/fitness.service.js';
import { MembersService } from '../members/members.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments: AssignmentsService,
    private readonly attendance: AttendanceService,
    private readonly fitness: FitnessService,
    private readonly members: MembersService,
  ) {}

  async memberHome(user: AuthUserPayload, gymSlug: string, dayId: string) {
    const safe = async <T>(work: Promise<T>): Promise<T | null> =>
      work.catch(() => null);

    const [
      assignment,
      attendance,
      pulse,
      active,
      profile,
      workout,
      diet,
      dietDoneIds,
      setLogs,
    ] = await Promise.all([
      safe(this.assignments.getMyAssignment(user)),
      safe(this.attendance.myStats(user)),
      safe(this.attendance.gymPulseForMember(user)),
      safe(this.attendance.myActive(user)),
      safe(this.members.getMyProfile(user, gymSlug.trim())),
      safe(this.fitness.myWorkoutPlan(user)),
      safe(this.fitness.myDietPlan(user)),
      safe(this.fitness.listDietMealLogs(user)),
      safe(this.fitness.listWorkoutSetLogs(user, dayId)),
    ]);

    return {
      assignment,
      attendance,
      pulse,
      active,
      profile,
      workout,
      diet,
      dietDoneIds,
      setLogs,
    };
  }

  async summary(user: AuthUserPayload, gymSlug: string) {
    const admin = gymRole(user, Role.GYM_ADMIN, gymSlug);
    if (!admin) throw new ForbiddenException('Gym admin only');
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: gymSlug.toLowerCase() },
    });
    if (!tenant) throw new NotFoundException('Gym not found');

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const horizon7 = new Date(today);
    horizon7.setUTCDate(horizon7.getUTCDate() + 7);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const [
      memberCount,
      trials,
      attendanceToday,
      paidMtd,
      pending,
      pendingCount,
      expiringMemberships,
      onFloor,
      onLeave,
      recentPayments,
    ] = await Promise.all([
      this.prisma.userTenantRole.count({
        where: { gymId: tenant.id, role: Role.MEMBER },
      }),
      this.prisma.trialLead.findMany({ where: { gymId: tenant.id } }),
      this.prisma.memberCheckIn.count({
        where: { gymId: tenant.id, checkInAt: { gte: today } },
      }),
      this.prisma.gymPayment.aggregate({
        where: {
          gymId: tenant.id,
          status: 'paid',
          createdAt: { gte: monthStart },
        },
        _sum: { amountInr: true },
      }),
      this.prisma.gymPayment.aggregate({
        where: { gymId: tenant.id, status: 'pending' },
        _sum: { amountInr: true },
      }),
      this.prisma.gymPayment.count({
        where: { gymId: tenant.id, status: 'pending' },
      }),
      this.prisma.memberMembership.count({
        where: {
          gymId: tenant.id,
          status: { in: ['active', 'trial'] },
          endsAt: { gte: today, lte: horizon7 },
        },
      }),
      this.prisma.trainerProfile.count({
        where: { gymId: tenant.id, floorStatus: 'on-floor' },
      }),
      this.prisma.trainerProfile.count({
        where: { gymId: tenant.id, floorStatus: 'leave' },
      }),
      this.prisma.gymPayment.findMany({
        where: { gymId: tenant.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { member: true },
      }),
    ]);
    const activeTrials = trials.filter((t) =>
      ['active', 'expiring'].includes(t.status),
    ).length;
    const expiringTrials = trials.filter((t) => t.status === 'expiring').length;

    return {
      activeMembers: memberCount,
      activeTrials,
      expiringTrials,
      attendanceToday,
      revenueMtdInr: paidMtd._sum.amountInr ?? 0,
      outstandingInr: pending._sum.amountInr ?? 0,
      pendingPaymentsCount: pendingCount,
      expiringMemberships7d: expiringMemberships,
      trainersOnFloor: onFloor,
      trainersOnLeave: onLeave,
      recentActivity: recentPayments.map((p) => ({
        id: p.id,
        text: `${p.status === 'paid' ? 'Payment received' : 'Payment'} — ${p.member.name} ₹${p.amountInr}`,
        time: formatWhen(p.createdAt),
      })),
    };
  }
}

function formatWhen(iso: Date) {
  const diff = Date.now() - iso.getTime();
  if (diff < 3600_000) return `${Math.max(1, Math.floor(diff / 60_000))} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)} hr ago`;
  return 'Today';
}
