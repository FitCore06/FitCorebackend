import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: {
    userId?: string;
    gymId?: string;
    action: string;
    resource?: string;
    meta?: Prisma.InputJsonValue;
  }) {
    try {
    await this.prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        gymId: input.gymId ?? null,
        action: input.action.slice(0, 200),
        resource: input.resource?.slice(0, 200),
        meta: input.meta,
      },
    });
    } catch {
      /* non-blocking */
    }
  }

  async listForGym(gymId: string, take = 50) {
    return this.prisma.auditLog.findMany({
      where: { gymId },
      orderBy: { createdAt: 'desc' },
      take,
      include: { user: { select: { email: true, name: true } } },
    });
  }
}