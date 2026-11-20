import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role, type AuthUserPayload } from '../src/auth/auth.types.js';
import { PaymentsService } from '../src/payments/payments.service.js';

const owner: AuthUserPayload = {
  id: 'owner-a', email: 'owner-a@example.test', name: 'Owner A',
  roles: [{ gymId: 'gym-a', gymSlug: 'gym-a', gymName: 'Gym A', role: Role.GYM_ADMIN }],
};

describe('Payment lifecycle integrity', () => {
  const tx = {
    gymPayment: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    paymentLedgerEntry: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    paymentRefund: { create: vi.fn(), findUnique: vi.fn() },
    $queryRaw: vi.fn(),
  };
  const prisma = {
    $transaction: vi.fn().mockImplementation((callback) => callback(tx)),
    tenant: { findUnique: vi.fn() },
    userTenantRole: { findFirst: vi.fn() },
    gymPayment: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
    paymentRefund: { findUnique: vi.fn() },
  };
  const config = { get: vi.fn() };
  let service: PaymentsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PaymentsService(prisma as never, config as never);
    prisma.tenant.findUnique.mockResolvedValue({ id: 'gym-a', slug: 'gym-a' });
    prisma.userTenantRole.findFirst.mockResolvedValue({ userId: 'member-a' });
    prisma.gymPayment.findFirst.mockResolvedValue(undefined);
    prisma.gymPayment.findUnique.mockResolvedValue(undefined);
    prisma.paymentRefund.findUnique.mockResolvedValue(undefined);
    tx.gymPayment.create.mockResolvedValue({
      id: 'payment-a', title: 'Membership', amountInr: 1000, method: 'cash', status: 'paid',
      createdAt: new Date(), member: { name: 'Member A', email: 'member-a@example.test' },
    });
  });

  it('creates payment, immutable ledger entry and audit record in one transaction', async () => {
    await service.create(owner, {
      gymSlug: 'gym-a', memberEmail: 'member-a@example.test', title: 'Membership',
      amountInr: 1000, method: 'cash', status: 'paid', idempotencyKey: 'payment-key-a',
    });
    expect(tx.gymPayment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ gymId: 'gym-a', memberUserId: 'member-a', idempotencyKey: 'payment-key-a' }),
    }));
    expect(tx.paymentLedgerEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ paymentId: 'payment-a', kind: 'payment', amountInr: 1000 }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ gymId: 'gym-a', userId: 'owner-a', action: 'payment.created' }),
    }));
  });

  it('returns original payment for same idempotency key without a second write', async () => {
    prisma.gymPayment.findFirst.mockResolvedValue({
      id: 'payment-a', gymId: 'gym-a', title: 'Membership', amountInr: 1000, method: 'cash', status: 'paid',
      createdAt: new Date(), member: { name: 'Member A', email: 'member-a@example.test' },
    });
    const result = await service.create(owner, {
      gymSlug: 'gym-a', memberEmail: 'member-a@example.test', title: 'Membership',
      amountInr: 1000, method: 'cash', status: 'paid', idempotencyKey: 'payment-key-a',
    });
    expect(result.id).toBe('payment-a');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects direct refunded-payment creation so every refund has a ledger event', async () => {
    await expect(service.create(owner, {
      gymSlug: 'gym-a', memberEmail: 'member-a@example.test', title: 'Membership',
      amountInr: 1000, method: 'cash', status: 'refunded', idempotencyKey: 'invalid-refunded-create',
    })).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('denies cross-tenant refund without leaking payment', async () => {
    prisma.gymPayment.findUnique.mockResolvedValue({
      id: 'payment-b', gymId: 'gym-b', tenant: { slug: 'gym-b' }, amountInr: 1000, refundedAmountInr: 0,
    });
    await expect(service.refund(owner, 'payment-b', { amountInr: 100, reason: 'QA', idempotencyKey: 'refund-key-b' }))
      .rejects.toThrow(ForbiddenException);
  });

  it('records a partial refund without marking the payment fully refunded', async () => {
    prisma.gymPayment.findUnique.mockResolvedValue({
      id: 'payment-a', gymId: 'gym-a', amountInr: 1000, refundedAmountInr: 0, status: 'paid',
      tenant: { slug: 'gym-a' }, member: { name: 'Member A', email: 'member-a@example.test' },
    });
    tx.gymPayment.findUnique.mockResolvedValue({
      id: 'payment-a', gymId: 'gym-a', amountInr: 1000, refundedAmountInr: 0, status: 'paid',
      tenant: { slug: 'gym-a' }, member: { name: 'Member A', email: 'member-a@example.test' },
    });
    tx.paymentRefund.create.mockResolvedValue({ id: 'refund-a', amountInr: 250 });
    tx.gymPayment.update.mockResolvedValue({
      id: 'payment-a', title: 'Membership', amountInr: 1000, method: 'cash', status: 'paid',
      refundedAmountInr: 250, createdAt: new Date(), member: { name: 'Member A', email: 'member-a@example.test' },
    });
    await service.refund(owner, 'payment-a', { amountInr: 250, reason: 'Partial QA', idempotencyKey: 'refund-key-a' });
    expect(tx.gymPayment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ refundedAmountInr: 250, status: 'paid' }),
    }));
    expect(tx.paymentLedgerEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ refundId: 'refund-a', kind: 'refund', amountInr: -250 }),
    }));
  });

  it('rejects over-refund under transaction lock', async () => {
    prisma.gymPayment.findUnique.mockResolvedValue({
      id: 'payment-a', gymId: 'gym-a', amountInr: 1000, refundedAmountInr: 900,
      tenant: { slug: 'gym-a' }, member: { name: 'Member A', email: 'member-a@example.test' },
    });
    tx.gymPayment.findUnique.mockResolvedValue({
      id: 'payment-a', gymId: 'gym-a', amountInr: 1000, refundedAmountInr: 900,
      tenant: { slug: 'gym-a' }, member: { name: 'Member A', email: 'member-a@example.test' },
    });
    await expect(service.refund(owner, 'payment-a', { amountInr: 101, reason: 'Too much', idempotencyKey: 'refund-key-over' }))
      .rejects.toThrow(ConflictException);
    expect(tx.paymentRefund.create).not.toHaveBeenCalled();
  });

  it('verifies controlled Razorpay webhook signatures without provider access', () => {
    const body = '{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_test"}}}}';
    const secret = 'qa-webhook-secret';
    const signature = createHmac('sha256', secret).update(body).digest('hex');
    expect(service.verifyRazorpayWebhookSignature(body, signature, secret)).toBe(true);
    expect(service.verifyRazorpayWebhookSignature(body, 'bad-signature', secret)).toBe(false);
  });

  it('creates a local Razorpay checkout intent without claiming a provider order', async () => {
    const member: AuthUserPayload = {
      id: 'member-a', email: 'member-a@example.test', name: 'Member A',
      roles: [{ gymId: 'gym-a', gymSlug: 'gym-a', gymName: 'Gym A', role: Role.MEMBER }],
    };
    prisma.gymPayment.create.mockResolvedValue({ id: 'payment-intent-a' });
    config.get.mockReturnValue(undefined);
    const result = await service.createRazorpayOrder(member, { title: 'Renewal', amountInr: 1000 });
    expect(result).toMatchObject({
      paymentId: 'payment-intent-a', demo: true, localCheckoutIntent: true,
      providerStatus: 'blocked_credentials_missing',
    });
    expect(result.orderId).toMatch(/^checkout_intent_/);
  });
});
