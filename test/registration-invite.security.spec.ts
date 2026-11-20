import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REGISTRATION_INVITE_KIND,
  RegistrationInviteService,
} from '../src/auth/registration-invite.service.js';

describe('RegistrationInviteService', () => {
  const prisma = {
    $transaction: vi.fn(),
    registrationInvite: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    tenant: { findUnique: vi.fn() },
  };
  let service: RegistrationInviteService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RegistrationInviteService(prisma as never);
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    prisma.registrationInvite.updateMany = vi.fn().mockResolvedValue({ count: 1 });
  });

  it('rejects member signup when invite gym does not match slug', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: 'gym-b', slug: 'gym-b' });
    prisma.registrationInvite.findUnique.mockResolvedValue({
      id: 'invite-a',
      kind: REGISTRATION_INVITE_KIND.GYM_MEMBER,
      gymId: 'gym-a',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      email: null,
    });
    await expect(
      service.consumeMemberInvite('member-token-1234567890', 'member@example.test', 'gym-b'),
    ).rejects.toThrow(ForbiddenException);
  });
});