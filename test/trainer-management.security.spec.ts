import { ConflictException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role, type AuthUserPayload } from '../src/auth/auth.types.js';
import { TrainersService } from '../src/trainers/trainers.service.js';

const owner: AuthUserPayload = {
  id: 'owner-a',
  email: 'owner-a@example.test',
  name: 'Owner A',
  roles: [{ gymId: 'gym-a', gymSlug: 'gym-a', gymName: 'Gym A', role: Role.GYM_ADMIN }],
};

describe('Trainer account creation', () => {
  const tx = {
    user: { create: vi.fn() },
    userTenantRole: { create: vi.fn() },
    trainerProfile: { create: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn().mockImplementation((callback) => callback(tx)),
    tenant: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  };
  let service: TrainersService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TrainersService(prisma as never);
    prisma.tenant.findUnique.mockResolvedValue({ id: 'gym-a', slug: 'gym-a' });
    prisma.user.findUnique.mockResolvedValue(null);
    tx.user.create.mockResolvedValue({ id: 'trainer-a', name: 'Trainer A', email: 'trainer@example.test' });
  });

  it('creates user, tenant role and profile atomically in owner tenant', async () => {
    await service.createForGym(owner, 'gym-a', {
      name: 'Trainer A',
      email: 'TRAINER@example.test',
      password: 'StrongPassword!123',
      specialty: 'Strength',
    });

    expect(tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: 'trainer@example.test', name: 'Trainer A' }),
    });
    expect(tx.userTenantRole.create).toHaveBeenCalledWith({
      data: { userId: 'trainer-a', gymId: 'gym-a', role: Role.TRAINER },
    });
    expect(tx.trainerProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'trainer-a', gymId: 'gym-a', specialty: 'Strength' }),
    });
  });

  it('denies cross-tenant owner input before database writes', async () => {
    await expect(
      service.createForGym(owner, 'gym-b', {
        name: 'Trainer B',
        email: 'trainer-b@example.test',
        password: 'StrongPassword!123',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects duplicate email without partial writes', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(
      service.createForGym(owner, 'gym-a', {
        name: 'Trainer A',
        email: 'trainer@example.test',
        password: 'StrongPassword!123',
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
