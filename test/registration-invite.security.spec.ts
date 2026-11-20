import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REGISTRATION_INVITE_KIND,
  RegistrationInviteService,
} from '../src/auth/registration-invite.service.js';

describe('RegistrationInviteService', () => {
  const prisma = {
    registrationInvite: {
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    tenant: { findUnique: vi.fn() },
  };
  let service: RegistrationInviteService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RegistrationInviteService(prisma as never);
    prisma.registrationInvite.updateMany.mockResolvedValue({ count: 1 });
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
    expect(prisma.registrationInvite.updateMany).not.toHaveBeenCalled();
  });

  it('rejects unknown owner invite with ForbiddenException (not transaction)', async () => {
    prisma.registrationInvite.findUnique.mockResolvedValue(null);
    await expect(
      service.consumeOwnerInvite('unknown-owner-token-12', 'owner@example.test'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.registrationInvite.updateMany).not.toHaveBeenCalled();
  });

  it('accepts member invite without gym slug when invite has gymId', async () => {
    prisma.registrationInvite.findUnique.mockResolvedValue({
      id: 'invite-m',
      kind: REGISTRATION_INVITE_KIND.GYM_MEMBER,
      gymId: 'gym-a',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      email: null,
    });
    await service.consumeMemberInvite(
      'member-token-1234567890',
      'member@example.test',
    );
    expect(prisma.registrationInvite.updateMany).toHaveBeenCalled();
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('maps missing registration_invites table to ServiceUnavailableException', async () => {
    prisma.registrationInvite.findUnique.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('missing table', {
        code: 'P2021',
        clientVersion: 'test',
      }),
    );
    await expect(
      service.consumeOwnerInvite('unknown-owner-token-12', 'owner@example.test'),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});