import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { Role, type AuthUserPayload } from '../src/auth/auth.types.js';
import { AttendanceService } from '../src/attendance/attendance.service.js';
import { BookingsService } from '../src/bookings/bookings.service.js';
import { PaymentsService } from '../src/payments/payments.service.js';

const owner: AuthUserPayload = {
  id: 'owner-a', email: 'owner@example.test', roles: [{ role: Role.GYM_ADMIN, gymId: 'gym-a', gymSlug: 'gym-a' }],
};
const member: AuthUserPayload = {
  id: 'member-a', email: 'member@example.test', roles: [{ role: Role.MEMBER, gymId: 'gym-a', gymSlug: 'gym-a' }],
};

describe('tenant security service rules', () => {
  it('PaymentsService rejects a foreign member and never creates a payment', async () => {
    const prisma = { tenant: { findUnique: vi.fn().mockResolvedValue({ id: 'gym-a', slug: 'gym-a' }) }, userTenantRole: { findFirst: vi.fn().mockResolvedValue(null) }, gymPayment: { create: vi.fn() } };
    const service = new PaymentsService(prisma as never, {} as never);
    await expect(service.create(owner, { gymSlug: 'gym-a', memberEmail: 'foreign@example.test', title: 'Fee', amountInr: 10, method: 'cash', status: 'paid' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.gymPayment.create).not.toHaveBeenCalled();
    expect(prisma.userTenantRole.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ gymId: 'gym-a', role: Role.MEMBER }) }));
  });

  it('PaymentsService writes the tenant-scoped member identity', async () => {
    const tx = {
      gymPayment: { create: vi.fn().mockResolvedValue({ id: 'p1', title: 'Fee', amountInr: 10, method: 'cash', status: 'paid', createdAt: new Date(), member: { name: 'Member', email: 'member@example.test' } }) },
      paymentLedgerEntry: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: 'gym-a', slug: 'gym-a' }) },
      userTenantRole: { findFirst: vi.fn().mockResolvedValue({ userId: 'member-a' }) },
      gymPayment: { findFirst: vi.fn() },
      $transaction: vi.fn((callback: (value: typeof tx) => unknown) => callback(tx)),
    };
    const service = new PaymentsService(prisma as never, {} as never);
    await service.create(owner, { gymSlug: 'gym-a', memberEmail: 'member@example.test', title: ' Fee ', amountInr: 10, method: ' cash ', status: 'paid' });
    expect(tx.gymPayment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ gymId: 'gym-a', memberUserId: 'member-a', title: 'Fee', method: 'cash' }) }));
  });

  it('BookingsService rejects a foreign member before booking creation', async () => {
    const tx = { tenant: { findUnique: vi.fn().mockResolvedValue({ id: 'gym-a' }) }, branch: { findFirst: vi.fn().mockResolvedValue({ id: 'branch-a' }) }, userTenantRole: { findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ userId: 'trainer-a' }) }, userBranchAccess: { count: vi.fn().mockResolvedValue(0), findFirst: vi.fn() }, memberTrainerAssignment: { findFirst: vi.fn() }, sessionBooking: { findFirst: vi.fn(), create: vi.fn() } };
    const prisma = { $transaction: vi.fn((cb: (value: typeof tx) => unknown) => cb(tx)) };
    const service = new BookingsService(prisma as never);
    await expect(service.adminCreate(owner, { gymSlug: 'gym-a', memberEmail: 'foreign@example.test', trainerEmail: 'trainer@example.test', startAtLabel: '10:00' })).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.sessionBooking.create).not.toHaveBeenCalled();
  });

  it('AttendanceService permits zero grants and denies an ungranted explicit branch', async () => {
    const prisma = {
      memberMembership: { findFirst: vi.fn().mockResolvedValue(null) },
      memberTrainerAssignment: { findFirst: vi.fn().mockResolvedValue({ id: 'assignment' }) },
      branch: { findFirst: vi.fn().mockResolvedValue({ id: 'branch-a', name: 'Main branch' }) },
      userBranchAccess: { count: vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1), findFirst: vi.fn().mockResolvedValue(null) },
      memberCheckIn: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'c1', gymId: 'gym-a', memberUserId: 'member-a', branchName: 'Main branch', checkInToken: 't', checkInAt: new Date(), checkOutAt: null }) },
    };
    const service = new AttendanceService(prisma as never, { get: vi.fn() } as never, {} as never);
    await expect(service.checkIn(member, { branchId: 'branch-a' })).resolves.toMatchObject({ id: 'c1' });
    await expect(service.checkIn(member, { branchId: 'branch-a' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('AttendanceService rejects a duplicate open check-in before creation', async () => {
    const prisma = { memberMembership: { findFirst: vi.fn().mockResolvedValue(null) }, memberTrainerAssignment: { findFirst: vi.fn().mockResolvedValue({ id: 'assignment' }) }, branch: { findFirst: vi.fn().mockResolvedValue({ id: 'branch-a', name: 'Main branch' }) }, userBranchAccess: { count: vi.fn().mockResolvedValue(0), findFirst: vi.fn() }, memberCheckIn: { findFirst: vi.fn().mockResolvedValue({ id: 'open' }), create: vi.fn() } };
    const service = new AttendanceService(prisma as never, { get: vi.fn() } as never, {} as never);
    await expect(service.checkIn(member, { branchId: 'branch-a' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.memberCheckIn.create).not.toHaveBeenCalled();
  });

  it('AttendanceService rejects inactive membership before branch lookup', async () => {
    const prisma = { memberMembership: { findFirst: vi.fn().mockResolvedValue(null) }, memberTrainerAssignment: { findFirst: vi.fn().mockResolvedValue(null) }, branch: { findFirst: vi.fn() } };
    const service = new AttendanceService(prisma as never, { get: vi.fn() } as never, {} as never);
    await expect(service.checkIn(member, { branchId: 'branch-a' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.branch.findFirst).not.toHaveBeenCalled();
  });

  it('AttendanceService rejects an expired structured membership even when legacy assignment says active', async () => {
    const prisma = {
      memberMembership: { findFirst: vi.fn().mockResolvedValue({ status: 'active', endsAt: new Date('2020-01-01') }) },
      memberTrainerAssignment: { findFirst: vi.fn().mockResolvedValue({ id: 'legacy-active' }) },
      branch: { findFirst: vi.fn() },
    };
    const service = new AttendanceService(prisma as never, { get: vi.fn() } as never, {} as never);
    await expect(service.checkIn(member, { branchId: 'branch-a' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.branch.findFirst).not.toHaveBeenCalled();
  });

  it('AttendanceService maps a concurrent database uniqueness conflict to duplicate check-in', async () => {
    const prisma = {
      memberMembership: { findFirst: vi.fn().mockResolvedValue(null) },
      memberTrainerAssignment: { findFirst: vi.fn().mockResolvedValue({ id: 'assignment' }) },
      branch: { findFirst: vi.fn().mockResolvedValue({ id: 'branch-a', name: 'Main branch' }) },
      userBranchAccess: { count: vi.fn().mockResolvedValue(0), findFirst: vi.fn() },
      memberCheckIn: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' })) },
    };
    const service = new AttendanceService(prisma as never, { get: vi.fn() } as never, {} as never);
    await expect(service.checkIn(member, { branchId: 'branch-a' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('AttendanceService permits an explicitly granted branch and rejects a revoked grant', async () => {
    const prisma = {
      memberMembership: { findFirst: vi.fn().mockResolvedValue(null) },
      memberTrainerAssignment: { findFirst: vi.fn().mockResolvedValue({ id: 'assignment' }) },
      branch: { findFirst: vi.fn().mockResolvedValue({ id: 'branch-a', name: 'Main branch' }) },
      userBranchAccess: { count: vi.fn().mockResolvedValue(2), findFirst: vi.fn().mockResolvedValueOnce({ id: 'grant-a' }).mockResolvedValueOnce(null) },
      memberCheckIn: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'c1', gymId: 'gym-a', memberUserId: 'member-a', branchName: 'Main branch', checkInToken: 't', checkInAt: new Date(), checkOutAt: null }) },
    };
    const service = new AttendanceService(prisma as never, { get: vi.fn() } as never, {} as never);
    await expect(service.checkIn(member, { branchId: 'branch-a' })).resolves.toMatchObject({ id: 'c1' });
    await expect(service.checkIn(member, { branchId: 'branch-a' })).rejects.toBeInstanceOf(ForbiddenException);
  });
});
