import { ConflictException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role, type AuthUserPayload } from '../src/auth/auth.types.js';
import { MembersService } from '../src/members/members.service.js';

describe('MembersService admin creation security', () => {
  const owner: AuthUserPayload = {
    id: 'owner-a',
    email: 'owner-a@example.test',
    name: 'Owner A',
    roles: [{ gymId: 'gym-a', gymSlug: 'gym-a', gymName: 'Gym A', role: Role.GYM_ADMIN }],
  };
  const prisma = {
    tenant: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn() },
    userTenantRole: { create: vi.fn() },
    $transaction: vi.fn(async (callback: (tx: typeof prisma) => unknown) => callback(prisma)),
  };
  const service = new MembersService(prisma as never);

  beforeEach(() => vi.clearAllMocks());

  it('creates member and role only inside authenticated owner tenant', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: 'gym-a', slug: 'gym-a' });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'member-a', name: 'Member A', email: 'member-a@example.test' });
    const result = await service.createForGym(owner, 'gym-a', {
      name: 'Member A', email: 'MEMBER-A@example.test', password: 'StrongPass123', phone: '+911234567890',
    });
    expect(result.userId).toBe('member-a');
    expect(prisma.userTenantRole.create).toHaveBeenCalledWith({
      data: { userId: 'member-a', gymId: 'gym-a', role: Role.MEMBER },
    });
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: 'member-a@example.test' }),
    }));
  });

  it('denies owner creating a member in another tenant', async () => {
    await expect(service.createForGym(owner, 'gym-b', {
      name: 'Member B', email: 'member-b@example.test', password: 'StrongPass123',
    })).rejects.toThrow(ForbiddenException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate email without changing membership roles', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: 'gym-a', slug: 'gym-a' });
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(service.createForGym(owner, 'gym-a', {
      name: 'Existing', email: 'existing@example.test', password: 'StrongPass123',
    })).rejects.toThrow(ConflictException);
    expect(prisma.userTenantRole.create).not.toHaveBeenCalled();
  });
});
