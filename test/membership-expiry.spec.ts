import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutomationSecretGuard } from '../src/automation/automation-secret.guard.js';
import { AutomationService } from '../src/automation/automation.service.js';
import { expiryDedupeKey } from '../src/automation/membership-expiry-dedupe.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

const NOTIFY_ON = new Date('2026-11-21T00:00:00.000Z');
const ENDS_AT = new Date('2026-11-28T00:00:00.000Z');

const candidateBase = {
  membershipId: 'mem-1',
  memberUserId: 'user-1',
  memberName: 'Demo Member',
  memberEmail: 'member@gym.test',
  phone: '8603968266',
  planName: 'QA Plan',
  endsOn: ENDS_AT.toISOString().slice(0, 10),
  daysUntil: 7,
  message: 'Namaste',
  dedupeKey: expiryDedupeKey('mem-1', ENDS_AT, NOTIFY_ON),
};

function makeService() {
  const expoPush = {
    sendToUser: vi.fn().mockResolvedValue({ ok: true, deviceCount: 1, tickets: 1 }),
  };
  const prisma = {} as PrismaService;
  const config = {
    get: vi.fn((key: string) => {
      if (key === 'FITCORE_MEMBERSHIP_EXPIRY_CHANNELS') return undefined;
      return undefined;
    }),
  } as unknown as ConfigService;
  return { service: new AutomationService(prisma, config, expoPush as never), expoPush };
}

describe('AutomationService.runMembershipExpiryReminders', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('builds dedupe keys from fixed UTC midnight today', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOTIFY_ON);

    const prisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'gym-1',
          name: 'Demo Fitness Club',
          slug: 'demo-gym',
        }),
      },
      memberMembership: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'mem-1',
            memberUserId: 'user-1',
            endsAt: ENDS_AT,
            member: {
              name: 'Demo Member',
              email: 'member@gym.test',
              phone: '8603968266',
            },
            plan: { name: 'QA Plan' },
          },
        ]),
      },
      gymNotification: { findMany: vi.fn().mockResolvedValue([]) },
      gymPayment: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const config = {
      get: vi.fn((key: string) => {
        if (key === 'FITCORE_MEMBERSHIP_EXPIRY_CHANNELS') return undefined;
        return undefined;
      }),
    } as unknown as ConfigService;
    const expoPush = { sendToUser: vi.fn() };
    const service = new AutomationService(prisma, config, expoPush as never);

    const list = await service.listMembershipExpiryCandidates('demo-gym', [7]);

    expect(list.candidates).toHaveLength(1);
    expect(list.candidates[0]?.dedupeKey).toBe(
      expiryDedupeKey('mem-1', ENDS_AT, NOTIFY_ON),
    );
  });

  it('delivers in_app by default', async () => {
    const { service } = makeService();
    vi.spyOn(service, 'listMembershipExpiryCandidates').mockResolvedValue({
      gymSlug: 'demo-gym',
      gymName: 'Demo Fitness Club',
      notifyOnDays: [7],
      candidates: [candidateBase],
    });
    const ack = vi.spyOn(service, 'ackMembershipExpiryReminders').mockResolvedValue({ recorded: 1 });

    const result = await service.runMembershipExpiryReminders('demo-gym', [7]);

    expect(result).toMatchObject({ sent: 1, failed: 0, skipped: 0, channels: ['in_app'] });
    expect(ack).toHaveBeenCalledWith('demo-gym', [candidateBase.dedupeKey]);
    expect(result.results[0]?.deliveredVia).toContain('in_app');
  });

  it('rejects empty gym slug on list', async () => {
    const { service } = makeService();
    await expect(service.listMembershipExpiryCandidates('', [7])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns 404 when gym is missing', async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const config = { get: vi.fn() } as unknown as ConfigService;
    const expoPush = { sendToUser: vi.fn() };
    const service = new AutomationService(prisma, config, expoPush as never);
    await expect(service.listMembershipExpiryCandidates('missing', [7])).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('AutomationSecretGuard', () => {
  it('rejects missing header', () => {
    const config = { get: vi.fn().mockReturnValue('secret') } as unknown as ConfigService;
    const guard = new AutomationSecretGuard(config);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
      }),
    };
    expect(() => guard.canActivate(ctx as never)).toThrow(UnauthorizedException);
  });

  it('accepts matching secret', () => {
    const config = { get: vi.fn().mockReturnValue('secret') } as unknown as ConfigService;
    const guard = new AutomationSecretGuard(config);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'x-fitcore-automation-secret': 'secret' } }),
      }),
    };
    expect(guard.canActivate(ctx as never)).toBe(true);
  });
});