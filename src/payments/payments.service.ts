import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, type AuthUserPayload } from '../auth/auth.types.js';
import { gymRole } from '../auth/guards/roles.guard.js';
import { validateBase64Image } from '../common/image-upload.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { MemberPaymentRequestDto } from './dto/member-payment-request.dto.js';
import type { CreatePaymentDto } from './dto/create-payment.dto.js';
import type { CreateRefundDto } from './dto/create-refund.dto.js';
import type {
  MemberReceiptDto,
  PaymentDto,
  PaymentStatus,
} from './payments.types.js';

function formatWhen(iso: Date) {
  const now = new Date();
  const sameDay =
    iso.toDateString() === now.toDateString();
  const time = iso.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  if (sameDay) return `Today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (iso.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return iso.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private toDto(row: {
    id: string;
    title: string;
    amountInr: number;
    refundedAmountInr?: number;
    method: string;
    status: string;
    createdAt: Date;
    proofData?: string | null;
    member: { name: string; email: string };
  }): PaymentDto {
    return {
      id: row.id,
      memberName: row.member.name,
      memberEmail: row.member.email,
      title: row.title,
      amountInr: row.amountInr,
      refundedAmountInr: row.refundedAmountInr ?? 0,
      method: row.method,
      status: row.status as PaymentStatus,
      at: formatWhen(row.createdAt),
      hasProof: Boolean(row.proofData?.trim()),
    };
  }

  async listForGym(user: AuthUserPayload, gymSlug: string): Promise<PaymentDto[]> {
    const admin = gymRole(user, Role.GYM_ADMIN, gymSlug);
    if (!admin) throw new ForbiddenException('Gym admin only');

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: gymSlug.toLowerCase() },
    });
    if (!tenant) throw new NotFoundException('Gym not found');

    const rows = await this.prisma.gymPayment.findMany({
      where: { gymId: tenant.id },
      include: { member: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => this.toDto(r));
  }

  async listForMember(user: AuthUserPayload): Promise<MemberReceiptDto[]> {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) return [];

    const rows = await this.prisma.gymPayment.findMany({
      where: {
        gymId: memberRole.gymId,
        memberUserId: user.id,
        status: 'paid',
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      amountInr: r.amountInr,
      paidAt: formatWhen(r.createdAt),
    }));
  }

  async listMyPaymentItems(user: AuthUserPayload) {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) return [];

    const rows = await this.prisma.gymPayment.findMany({
      where: {
        gymId: memberRole.gymId,
        memberUserId: user.id,
        status: { in: ['paid', 'pending'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      amountInr: r.amountInr,
      method: r.method,
      status: r.status as PaymentStatus,
      at: formatWhen(r.createdAt),
      hasProof: Boolean(r.proofData?.trim()),
    }));
  }

  async submitMemberPaymentRequest(user: AuthUserPayload, dto: MemberPaymentRequestDto) {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Members only');

    let proof:
      | { proofMimeType: string; proofData: string }
      | { proofMimeType: null; proofData: null } = {
      proofMimeType: null,
      proofData: null,
    };
    if (dto.proofBase64) {
      const validated = validateBase64Image({
        base64: dto.proofBase64,
        mimeType: dto.proofMimeType,
        maxBytes: 2_500_000,
        label: 'Payment proof',
      });
      proof = { proofMimeType: validated.mimeType, proofData: validated.base64 };
    }

    const title = dto.title?.trim() || 'Membership renewal (UPI)';
    const method = (dto.method?.trim() || 'UPI').slice(0, 40);

    if (dto.idempotencyKey) {
      const existing = await this.prisma.gymPayment.findFirst({
        where: { gymId: memberRole.gymId, idempotencyKey: dto.idempotencyKey.trim() },
        include: { member: true },
      });
      if (existing) return this.toDto(existing);
    }

    const row = await this.prisma.gymPayment.create({
      data: {
        gymId: memberRole.gymId,
        memberUserId: user.id,
        title,
        amountInr: dto.amountInr,
        method,
        status: 'pending',
        idempotencyKey: dto.idempotencyKey?.trim() || null,
        proofMimeType: proof.proofMimeType,
        proofData: proof.proofData,
      },
      include: { member: true },
    });

    await this.prisma.auditLog.create({
      data: {
        gymId: memberRole.gymId,
        userId: user.id,
        action: 'payment.member_submitted',
        resource: row.id,
        meta: { amountInr: row.amountInr, hasProof: Boolean(proof.proofData) },
      },
    });

    return this.toDto(row);
  }

  async paymentProofDataUrl(user: AuthUserPayload, paymentId: string) {
    const row = await this.prisma.gymPayment.findUnique({
      where: { id: paymentId },
      include: { tenant: true },
    });
    if (!row?.proofData || !row.proofMimeType) throw new NotFoundException('No proof on file');
    const admin = gymRole(user, Role.GYM_ADMIN, row.tenant.slug);
    const memberOk = user.id === row.memberUserId;
    if (!admin && !memberOk) throw new ForbiddenException('Not allowed');
    return {
      mimeType: row.proofMimeType,
      dataUrl: `data:${row.proofMimeType};base64,${row.proofData}`,
    };
  }

  async create(user: AuthUserPayload, dto: CreatePaymentDto): Promise<PaymentDto> {
    const slug = dto.gymSlug?.trim() || user.roles.find((r) => r.role === Role.GYM_ADMIN)?.gymSlug;
    if (!slug) throw new BadRequestException('gymSlug required');
    const admin = gymRole(user, Role.GYM_ADMIN, slug);
    if (!admin) throw new ForbiddenException('Gym admin only');

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: slug.toLowerCase() },
    });
    if (!tenant) throw new NotFoundException('Gym not found');

    if (dto.idempotencyKey) {
      const existing = await this.prisma.gymPayment.findFirst({
        where: { gymId: tenant.id, idempotencyKey: dto.idempotencyKey },
        include: { member: true },
      });
      if (existing) return this.toDto(existing);
    }

    const memberRole = await this.prisma.userTenantRole.findFirst({
      where: {
        gymId: tenant.id,
        role: Role.MEMBER,
        user: { email: dto.memberEmail.toLowerCase() },
      },
    });
    if (!memberRole) throw new NotFoundException('Member not found');
    if (dto.status === 'refunded') {
      throw new BadRequestException('Create a paid payment, then use the refund endpoint');
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const payment = await tx.gymPayment.create({
          data: {
            gymId: tenant.id,
            memberUserId: memberRole.userId,
            title: dto.title.trim(),
            amountInr: dto.amountInr,
            method: dto.method.trim(),
            status: dto.status,
            idempotencyKey: dto.idempotencyKey?.trim() || null,
          },
          include: { member: true },
        });
        if (dto.status === 'paid') {
          await tx.paymentLedgerEntry.create({
            data: {
              gymId: tenant.id,
              paymentId: payment.id,
              kind: 'payment',
              amountInr: payment.amountInr,
              eventKey: `payment:${payment.id}`,
            },
          });
        }
        await tx.auditLog.create({
          data: {
            gymId: tenant.id,
            userId: user.id,
            action: 'payment.created',
            resource: payment.id,
            meta: { amountInr: payment.amountInr, status: payment.status },
          },
        });
        return payment;
      });
      return this.toDto(row);
    } catch (error) {
      if (!dto.idempotencyKey) throw error;
      const existing = await this.prisma.gymPayment.findFirst({
        where: { gymId: tenant.id, idempotencyKey: dto.idempotencyKey },
        include: { member: true },
      });
      if (existing) return this.toDto(existing);
      throw error;
    }
  }

  async updateStatus(
    user: AuthUserPayload,
    id: string,
    status: PaymentStatus,
  ): Promise<PaymentDto> {
    const row = await this.prisma.gymPayment.findUnique({
      where: { id },
      include: { member: true, tenant: true },
    });
    if (!row) throw new NotFoundException('Payment not found');

    const admin = gymRole(user, Role.GYM_ADMIN, row.tenant.slug);
    if (!admin) throw new ForbiddenException('Gym admin only');

    if (status === 'refunded') {
      throw new BadRequestException('Use the refund endpoint for refunds');
    }
    if (row.status === status) return this.toDto(row);
    if (row.status !== 'pending' || status !== 'paid') {
      throw new ConflictException('Invalid payment status transition');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.gymPayment.update({
        where: { id }, data: { status: 'paid' }, include: { member: true },
      });
      await tx.paymentLedgerEntry.create({
        data: { gymId: row.gymId, paymentId: id, kind: 'payment', amountInr: payment.amountInr, eventKey: `payment:${id}` },
      });
      await tx.auditLog.create({
        data: { gymId: row.gymId, userId: user.id, action: 'payment.paid', resource: id },
      });
      return payment;
    });
    return this.toDto(updated);
  }

  async refund(user: AuthUserPayload, paymentId: string, dto: CreateRefundDto) {
    const payment = await this.prisma.gymPayment.findUnique({
      where: { id: paymentId },
      include: { tenant: true, member: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (!gymRole(user, Role.GYM_ADMIN, payment.tenant.slug)) {
      throw new ForbiddenException('Gym admin only');
    }
    const existing = await this.prisma.paymentRefund.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      if (existing.paymentId !== paymentId || existing.gymId !== payment.gymId) {
        throw new ConflictException('Refund idempotency key already used');
      }
      return { payment: this.toDto(payment), refund: existing, idempotent: true };
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM gym_payments WHERE id = ${paymentId} FOR UPDATE`;
        const locked = await tx.gymPayment.findUnique({
          where: { id: paymentId }, include: { tenant: true, member: true },
        });
        if (!locked || locked.gymId !== payment.gymId) throw new NotFoundException('Payment not found');
        if (locked.status !== 'paid') throw new ConflictException('Only paid payments can be refunded');
        const remaining = locked.amountInr - locked.refundedAmountInr;
        if (dto.amountInr > remaining) throw new ConflictException('Refund exceeds remaining amount');
        const refund = await tx.paymentRefund.create({
          data: {
            gymId: locked.gymId, paymentId, amountInr: dto.amountInr,
            reason: dto.reason?.trim() || null, idempotencyKey: dto.idempotencyKey,
            createdByUserId: user.id,
          },
        });
        const refundedAmountInr = locked.refundedAmountInr + dto.amountInr;
        const status = refundedAmountInr === locked.amountInr ? 'refunded' : 'paid';
        const updated = await tx.gymPayment.update({
          where: { id: paymentId },
          data: { refundedAmountInr, status },
          include: { member: true },
        });
        await tx.paymentLedgerEntry.create({
          data: {
            gymId: locked.gymId, paymentId, refundId: refund.id, kind: 'refund',
            amountInr: -dto.amountInr, eventKey: `refund:${refund.id}`,
          },
        });
        await tx.auditLog.create({
          data: { gymId: locked.gymId, userId: user.id, action: 'payment.refunded', resource: paymentId,
            meta: { refundId: refund.id, amountInr: dto.amountInr, remainingInr: remaining - dto.amountInr } },
        });
        return { payment: this.toDto(updated), refund, idempotent: false };
      });
    } catch (error) {
      const afterRace = await this.prisma.paymentRefund.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
      if (afterRace?.paymentId === paymentId && afterRace.gymId === payment.gymId) {
        return { payment: this.toDto(payment), refund: afterRace, idempotent: true };
      }
      throw error;
    }
  }

  verifyRazorpayWebhookSignature(rawBody: string, signature: string, secret: string) {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    if (signature.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  async createRazorpayOrder(
    user: AuthUserPayload,
    input: { title: string; amountInr: number; gymSlug?: string },
  ) {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Members only');

    const row = await this.prisma.gymPayment.create({
      data: {
        gymId: memberRole.gymId,
        memberUserId: user.id,
        title: input.title.trim(),
        amountInr: input.amountInr,
        method: 'Razorpay',
        status: 'pending',
      },
    });

    // This creates only a local pending checkout intent. No provider order or charge
    // exists until an approved Razorpay transport integration is configured.
    const orderId = `checkout_intent_${randomBytes(8).toString('hex')}`;
    const keyId = this.config.get<string>('RAZORPAY_KEY_ID') ?? 'rzp_test_fitcore';
    const providerConfigured = Boolean(
      this.config.get<string>('RAZORPAY_KEY_ID') && this.config.get<string>('RAZORPAY_KEY_SECRET'),
    );

    return {
      orderId,
      amount: input.amountInr * 100,
      currency: 'INR',
      keyId,
      paymentId: row.id,
      demo: true,
      localCheckoutIntent: true,
      providerStatus: providerConfigured
        ? 'blocked_provider_transport_not_configured'
        : 'blocked_credentials_missing',
      note: 'Local pending checkout intent only. No Razorpay order, charge, refund, or settlement has been created.',
    };
  }
}
