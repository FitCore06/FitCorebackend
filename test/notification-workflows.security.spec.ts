import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role, type AuthUserPayload } from '../src/auth/auth.types.js';
import { NotificationsService } from '../src/notifications/notifications.service.js';

const ownerA: AuthUserPayload = {
  id: 'owner-a',
  email: 'owner-a@example.test',
  name: 'Owner A',
  roles: [{ gymId: 'gym-a', gymSlug: 'gym-a', gymName: 'Gym A', role: Role.GYM_ADMIN }],
};

const ownerB: AuthUserPayload = {
  id: 'owner-b',
  email: 'owner-b@example.test',
  name: 'Owner B',
  roles: [{ gymId: 'gym-b', gymSlug: 'gym-b', gymName: 'Gym B', role: Role.GYM_ADMIN }],
};

const memberA: AuthUserPayload = {
  id: 'member-a',
  email: 'member-a@example.test',
  name: 'Member A',
  roles: [{ gymId: 'gym-a', gymSlug: 'gym-a', gymName: 'Gym A', role: Role.MEMBER }],
};

describe('Stage 12: In-App Notification Broadcasts & Idempotency', () => {
  const prisma = {
    tenant: { findUnique: vi.fn() },
    userTenantRole: { findMany: vi.fn() },
    gymNotification: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };

  let service: NotificationsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new NotificationsService(prisma as never);
    prisma.tenant.findUnique.mockImplementation(async ({ where }: { where: { slug: string } }) => {
      if (where.slug === 'gym-a') return { id: 'gym-a', slug: 'gym-a', name: 'Gym A' };
      if (where.slug === 'gym-b') return { id: 'gym-b', slug: 'gym-b', name: 'Gym B' };
      return null;
    });
  });

  it('broadcasts announcement to all tenant members with unique dedupe keys', async () => {
    prisma.userTenantRole.findMany.mockResolvedValue([
      { userId: 'member-1' },
      { userId: 'member-2' },
    ]);
    prisma.gymNotification.createMany.mockResolvedValue({ count: 2 });

    const res = await service.broadcastAnnouncement(ownerA, 'gym-a', {
      title: 'Gym Closure Notice',
      body: 'Gym will remain closed on Sunday for maintenance.',
      dedupePrefix: 'closure-2026-11-22',
    });

    expect(prisma.gymNotification.createMany).toHaveBeenCalledWith({
      data: [
        {
          gymId: 'gym-a',
          userId: 'member-1',
          title: 'Gym Closure Notice',
          body: 'Gym will remain closed on Sunday for maintenance.',
          dedupeKey: 'closure-2026-11-22:member-1',
        },
        {
          gymId: 'gym-a',
          userId: 'member-2',
          title: 'Gym Closure Notice',
          body: 'Gym will remain closed on Sunday for maintenance.',
          dedupeKey: 'closure-2026-11-22:member-2',
        },
      ],
      skipDuplicates: true,
    });
    expect(res).toEqual({ candidates: 2, created: 2 });
  });

  it('repeated broadcasts with same dedupe prefix skip duplicates idempotently', async () => {
    prisma.userTenantRole.findMany.mockResolvedValue([
      { userId: 'member-1' },
      { userId: 'member-2' },
    ]);
    // Second run has 0 new records created because skipDuplicates ignores existing keys
    prisma.gymNotification.createMany.mockResolvedValue({ count: 0 });

    const res = await service.broadcastAnnouncement(ownerA, 'gym-a', {
      title: 'Gym Closure Notice',
      body: 'Gym will remain closed on Sunday for maintenance.',
      dedupePrefix: 'closure-2026-11-22',
    });

    expect(res).toEqual({ candidates: 2, created: 0 });
  });

  it('denies broadcast across tenant boundary', async () => {
    await expect(
      service.broadcastAnnouncement(ownerA, 'gym-b', {
        title: 'Unauthorized announcement',
        body: 'Cross-tenant text',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.gymNotification.createMany).not.toHaveBeenCalled();
  });

  it('denies non-admin member from broadcasting announcements', async () => {
    await expect(
      service.broadcastAnnouncement(memberA, 'gym-a', {
        title: 'Member announcement',
        body: 'Spam',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.gymNotification.createMany).not.toHaveBeenCalled();
  });
});
