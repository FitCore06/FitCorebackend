import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role, type AuthUserPayload } from '../src/auth/auth.types.js';
import { GymOpsService } from '../src/gym-ops/gym-ops.service.js';

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

describe('Stage 14: Multi-Branch Management & Authorization Policy', () => {
  const prisma = {
    tenant: { findUnique: vi.fn() },
    branch: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    userTenantRole: {
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    gymPayment: {
      aggregate: vi.fn(),
    },
    userBranchAccess: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  };

  let service: GymOpsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GymOpsService(prisma as never);
    prisma.tenant.findUnique.mockImplementation(async ({ where }: { where: { slug: string } }) => {
      if (where.slug === 'gym-a') return { id: 'gym-a', slug: 'gym-a', name: 'Gym A' };
      if (where.slug === 'gym-b') return { id: 'gym-b', slug: 'gym-b', name: 'Gym B' };
      return null;
    });
  });

  describe('Branch CRUD & Tenant Isolation', () => {
    it('creates branch under authenticated tenant only', async () => {
      prisma.branch.create.mockResolvedValue({ id: 'branch-1', name: 'Downtown', gymId: 'gym-a', status: 'active' });

      const res = await service.createBranch(ownerA, 'gym-a', { name: 'Downtown' });
      expect(prisma.branch.create).toHaveBeenCalledWith({
        data: {
          gymId: 'gym-a',
          name: 'Downtown',
          status: 'active',
        },
      });
      expect(res.name).toBe('Downtown');
    });

    it('rejects cross-tenant branch creation attempts', async () => {
      await expect(
        service.createBranch(ownerA, 'gym-b', { name: 'Downtown' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.branch.create).not.toHaveBeenCalled();
    });

    it('updates branch name and status within tenant', async () => {
      prisma.branch.findFirst.mockResolvedValue({ id: 'branch-1', gymId: 'gym-a', name: 'Downtown', status: 'active' });
      prisma.branch.update.mockResolvedValue({ id: 'branch-1', gymId: 'gym-a', name: 'Uptown', status: 'inactive' });

      const res = await service.updateBranch(ownerA, 'gym-a', 'branch-1', { name: 'Uptown', status: 'inactive' });
      expect(prisma.branch.update).toHaveBeenCalledWith({
        where: { id: 'branch-1' },
        data: { name: 'Uptown', status: 'inactive' },
      });
      expect(res.name).toBe('Uptown');
    });

    it('rejects updating branch belonging to another tenant', async () => {
      prisma.branch.findFirst.mockResolvedValue(null);

      await expect(
        service.updateBranch(ownerA, 'gym-a', 'branch-b', { name: 'Hacked' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.branch.update).not.toHaveBeenCalled();
    });
  });

  describe('Branch Access Grants & Revocation Policy', () => {
    it('grants branch access to a member belonging to the tenant', async () => {
      prisma.branch.findFirst.mockResolvedValue({ id: 'branch-1', gymId: 'gym-a' });
      prisma.userTenantRole.findFirst.mockResolvedValue({ userId: 'member-a', gymId: 'gym-a', role: Role.MEMBER });
      prisma.userBranchAccess.upsert.mockResolvedValue({ id: 'grant-1', userId: 'member-a', branchId: 'branch-1' });

      const res = await service.grantBranchAccess(ownerA, 'gym-a', 'branch-1', { userId: 'member-a' });
      expect(prisma.userBranchAccess.upsert).toHaveBeenCalledWith({
        where: { userId_branchId: { userId: 'member-a', branchId: 'branch-1' } },
        create: { userId: 'member-a', branchId: 'branch-1' },
        update: {},
      });
      expect(res.id).toBe('grant-1');
    });

    it('rejects granting branch access to a user from another gym', async () => {
      prisma.branch.findFirst.mockResolvedValue({ id: 'branch-1', gymId: 'gym-a' });
      prisma.userTenantRole.findFirst.mockResolvedValue(null);

      await expect(
        service.grantBranchAccess(ownerA, 'gym-a', 'branch-1', { userId: 'member-b' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.userBranchAccess.upsert).not.toHaveBeenCalled();
    });

    it('revokes branch access cleanly', async () => {
      prisma.branch.findFirst.mockResolvedValue({ id: 'branch-1', gymId: 'gym-a' });
      prisma.userBranchAccess.deleteMany.mockResolvedValue({ count: 1 });

      const res = await service.revokeBranchAccess(ownerA, 'gym-a', 'branch-1', 'member-a');
      expect(prisma.userBranchAccess.deleteMany).toHaveBeenCalledWith({
        where: { branchId: 'branch-1', userId: 'member-a' },
      });
      expect(res.revoked).toBe(true);
    });

    it('rejects revoking branch grant across tenant boundary', async () => {
      prisma.branch.findFirst.mockResolvedValue(null);

      await expect(
        service.revokeBranchAccess(ownerA, 'gym-a', 'branch-2', 'member-a'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.userBranchAccess.deleteMany).not.toHaveBeenCalled();
    });
  });
});
