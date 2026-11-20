import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, type AuthUserPayload } from '../auth/auth.types.js';
import { gymRole } from '../auth/guards/roles.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(user: AuthUserPayload, gymSlug: string) {
    const admin = gymRole(user, Role.GYM_ADMIN, gymSlug);
    if (!admin) throw new ForbiddenException('Gym admin only');
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: gymSlug.toLowerCase() },
    });
    if (!tenant) throw new NotFoundException('Gym not found');

    const memberCount = await this.prisma.userTenantRole.count({
      where: { gymId: tenant.id, role: Role.MEMBER },
    });
    const trials = await this.prisma.trialLead.findMany({
      where: { gymId: tenant.id },
    });
    const activeTrials = trials.filter((t) =>
      ['active', 'expiring'].includes(t.status),
    ).length;
    const expiringTrials = trials.filter((t) => t.status === 'expiring').length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const attendanceToday = await this.prisma.memberCheckIn.count({
      where: { gymId: tenant.id, checkInAt: { gte: today } },
    });

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const paidMtd = await this.prisma.gymPayment.aggregate({
      where: {
        gymId: tenant.id,
        status: 'paid',
        createdAt: { gte: monthStart },
      },
      _sum: { amountInr: true },
    });
    const pending = await this.prisma.gymPayment.aggregate({
      where: { gymId: tenant.id, status: 'pending' },
      _sum: { amountInr: true },
    });

    const onFloor = await this.prisma.trainerProfile.count({
      where: { gymId: tenant.id, floorStatus: 'on-floor' },
    });
    const onLeave = await this.prisma.trainerProfile.count({
      where: { gymId: tenant.id, floorStatus: 'leave' },
    });

    const recentPayments = await this.prisma.gymPayment.findMany({
      where: { gymId: tenant.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { member: true },
    });

    return {
      activeMembers: memberCount,
      activeTrials,
      expiringTrials,
      attendanceToday,
      revenueMtdInr: paidMtd._sum.amountInr ?? 0,
      outstandingInr: pending._sum.amountInr ?? 0,
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