import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HealthController } from '../src/health/health.controller.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

describe('HealthController', () => {
  it('reports database connectivity', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const controller = new HealthController(prisma as unknown as PrismaService);

    await expect(controller.check()).resolves.toMatchObject({
      status: 'ok',
      database: 'connected',
    });
  });

  it('returns service unavailable when the database cannot be reached', async () => {
    const prisma = { $queryRaw: vi.fn().mockRejectedValue(new Error('offline')) };
    const controller = new HealthController(prisma as unknown as PrismaService);

    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
