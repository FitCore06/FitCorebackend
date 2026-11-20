import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service.js';
import { REGISTRATION_INVITE_KIND } from '../src/auth/registration-invite.service.js';

describe('Auth security remediation', () => {
  const prisma = {
    $transaction: vi.fn().mockImplementation((callback) => callback(prisma)),
    user: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    tenant: { findUnique: vi.fn(), create: vi.fn() },
    branch: { create: vi.fn() },
    userTenantRole: { create: vi.fn() },
    refreshToken: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    passwordResetToken: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    registrationInvite: {
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const jwt = {
    signAsync: vi.fn().mockResolvedValue('access-token'),
  };
  const config = {
    get: vi.fn(),
    getOrThrow: vi.fn().mockReturnValue('jwt-secret'),
  };
  const mail = {
    sendPasswordResetEmail: vi.fn().mockResolvedValue(true),
  };
  const registrationInvites = {
    consumeOwnerInvite: vi.fn().mockResolvedValue(undefined),
    consumeMemberInvite: vi.fn().mockResolvedValue({ gymId: 'gym-a' }),
    hashToken: vi.fn(),
    issueInvite: vi.fn(),
  };

  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthService(
      prisma as never,
      jwt as never,
      config as never,
      mail as never,
      registrationInvites as never,
    );
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-a',
      email: 'owner-a@example.test',
      passwordHash: 'hash',
    });
    prisma.user.update.mockResolvedValue({});
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });
  });

  it('requires an owner invite before admin registration', async () => {
    registrationInvites.consumeOwnerInvite.mockRejectedValueOnce(
      new ForbiddenException('stop-after-invite-check'),
    );
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.tenant.findUnique.mockResolvedValue(null);
    await expect(
      service.registerAdmin({
        name: 'Owner A',
        email: 'owner-a@example.test',
        password: 'Password!123',
        gymName: 'Gym A',
        gymSlug: 'gym-a',
        inviteToken: 'invite-token-value-123456',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(registrationInvites.consumeOwnerInvite).toHaveBeenCalledWith(
      'invite-token-value-123456',
      'owner-a@example.test',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires a member invite and does not trust gym slug alone', async () => {
    registrationInvites.consumeMemberInvite.mockRejectedValueOnce(
      new ForbiddenException(),
    );
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.registerMember({
        name: 'Member A',
        email: 'member-a@example.test',
        password: 'Password!123',
        gymSlug: 'other-gym',
        inviteToken: 'invalid-token-1234567890',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(registrationInvites.consumeMemberInvite).toHaveBeenCalledWith(
      'invalid-token-1234567890',
      'member-a@example.test',
      'other-gym',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('revokes refresh tokens after a password change', async () => {
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('Current!123', 12);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-a',
      email: 'owner-a@example.test',
      passwordHash: hash,
    });
    const txRefreshUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        user: { update: vi.fn().mockResolvedValue({}) },
        refreshToken: { updateMany: txRefreshUpdateMany },
      }),
    );
    await service.changePassword('user-a', {
      currentPassword: 'Current!123',
      newPassword: 'NewPassword!123',
    });
    expect(txRefreshUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user-a', revokedAt: null },
      data: expect.objectContaining({ revokedAt: expect.any(Date) }),
    });
  });

  it('returns the same forgot-password response for unknown emails', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'APP_PUBLIC_URL') return 'http://localhost:3000';
      if (key === 'NODE_ENV') return 'test';
      return undefined;
    });
    prisma.user.findUnique.mockResolvedValueOnce(null);
    const unknown = await service.requestPasswordReset({
      email: 'missing-a@example.test',
    });
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-a',
      email: 'owner-a@example.test',
      name: 'Owner A',
    });
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    prisma.passwordResetToken.create.mockResolvedValue({ id: 'reset-a' });
    const known = await service.requestPasswordReset({
      email: 'owner-a@example.test',
    });
    expect(unknown).toEqual({
      ok: true,
      message:
        'If this email is registered with FitCore, you will receive password reset instructions shortly.',
    });
    expect(known.message).toBe(unknown.message);
    expect(known.ok).toBe(true);
    expect(known).not.toHaveProperty('registered');
  });

  it('rejects refresh when changePassword left prior tokens revoked', async () => {
    prisma.refreshToken.findUnique.mockResolvedValueOnce({
      id: 'refresh-a',
      userId: 'user-a',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'user-a' },
    });
    await expect(service.refresh('old-refresh-token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('documents invite kinds used in registration gating', () => {
    expect(REGISTRATION_INVITE_KIND.GYM_OWNER).toBe('gym_owner');
    expect(REGISTRATION_INVITE_KIND.GYM_MEMBER).toBe('gym_member');
  });
});