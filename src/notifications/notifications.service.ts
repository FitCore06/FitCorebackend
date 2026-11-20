import { Injectable } from '@nestjs/common';
import { type AuthUserPayload } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(user: AuthUserPayload) {
    const gymRole = user.roles[0];
    if (!gymRole) return [];
    const rows = await this.prisma.gymNotification.findMany({
      where: { gymId: gymRole.gymId, userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      read: r.read,
      at: formatAt(r.createdAt),
    }));
  }

  async registerDevice(
    user: AuthUserPayload,
    token: string,
    platform = 'expo',
  ) {
    const gymId = user.roles[0]?.gymId;
    await this.prisma.pushDeviceToken.upsert({
      where: {
        userId_token: { userId: user.id, token },
      },
      create: {
        userId: user.id,
        gymId: gymId ?? null,
        token,
        platform,
      },
      update: { platform, gymId: gymId ?? null },
    });
    return { ok: true };
  }

  async broadcastAnnouncement(
    user: AuthUserPayload,
    gymSlug: string,
    dto: { title: string; body: string; dedupePrefix?: string },
  ) {
    const admin = user.roles.find(
      (r) => r.gymSlug.toLowerCase() === gymSlug.toLowerCase() && r.role === "GYM_ADMIN",
    );
    if (!admin) {
      const { ForbiddenException } = require("@nestjs/common");
      throw new ForbiddenException("Gym admin only");
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: gymSlug.toLowerCase() },
    });
    if (!tenant) {
      const { NotFoundException } = require("@nestjs/common");
      throw new NotFoundException("Gym not found");
    }

    const memberRoles = await this.prisma.userTenantRole.findMany({
      where: { gymId: tenant.id, role: "MEMBER" },
      select: { userId: true },
    });

    if (!memberRoles.length) return { candidates: 0, created: 0 };

    const prefix = dto.dedupePrefix?.trim() || "announcement:" + Date.now();
    const result = await this.prisma.gymNotification.createMany({
      data: memberRoles.map((m) => ({
        gymId: tenant.id,
        userId: m.userId,
        title: dto.title.trim(),
        body: dto.body.trim(),
        dedupeKey: `${prefix}:${m.userId}`,
      })),
      skipDuplicates: true,
    });

    return { candidates: memberRoles.length, created: result.count };
  }

  async markRead(user: AuthUserPayload, id: string) {
    const row = await this.prisma.gymNotification.findFirst({
      where: { id, userId: user.id },
    });
    if (!row) return { ok: false };
    await this.prisma.gymNotification.update({
      where: { id },
      data: { read: true },
    });
    return { ok: true };
  }
}

function formatAt(d: Date) {
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 3600_000) return `${Math.max(1, Math.floor(diff / 60_000))} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)} hr ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
