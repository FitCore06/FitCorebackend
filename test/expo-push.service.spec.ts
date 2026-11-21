import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { ExpoPushService } from '../src/notifications/expo-push.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

describe('ExpoPushService', () => {
  it('skips when user has no device tokens', async () => {
    const prisma = {
      pushDeviceToken: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const config = { get: vi.fn() } as unknown as ConfigService;
    const service = new ExpoPushService(prisma, config);

    const result = await service.sendToUser('user-1', {
      title: 'Test',
      body: 'Hello',
    });

    expect(result).toMatchObject({ ok: false, detail: 'no_device_tokens', deviceCount: 0 });
  });

  it('posts to Expo when tokens exist', async () => {
    const prisma = {
      pushDeviceToken: {
        findMany: vi.fn().mockResolvedValue([{ token: 'ExponentPushToken[abc]' }]),
      },
    } as unknown as PrismaService;
    const config = { get: vi.fn() } as unknown as ConfigService;
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: 'ok' }] }),
    });
    const service = new ExpoPushService(prisma, config);

    const result = await service.sendToUser(
      'user-1',
      { title: 'Membership expiry reminder', body: 'Namaste' },
      fetch,
    );

    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});