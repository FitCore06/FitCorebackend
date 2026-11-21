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
import { renewMembershipAfterPayment } from '../common/membership-renew-after-payment.js';
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

    const keyId = this.config.get<string>('RAZORPAY_KEY_ID')?.trim();
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET')?.trim();
    const providerConfigured = Boolean(keyId && keySecret);

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

    if (!providerConfigured) {
      const orderId = `checkout_intent_${randomBytes(8).toString('hex')}`;
      return {
        orderId,
        amount: input.amountInr * 100,
        currency: 'INR',
        keyId: keyId ?? 'rzp_test_fitcore',
        paymentId: row.id,
        demo: true,
        localCheckoutIntent: true,
        providerStatus: 'blocked_credentials_missing',
        note: 'Local pending checkout intent only. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on API.',
      };
    }

    const receipt = `fc_${row.id.replace(/-/g, '').slice(0, 12)}`;
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const orderRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: input.amountInr * 100,
        currency: 'INR',
        receipt,
        notes: {
          fitcorePaymentId: row.id,
          memberUserId: user.id,
          gymId: memberRole.gymId,
        },
      }),
    });
    if (!orderRes.ok) {
      const detail = await orderRes.text();
      await this.prisma.gymPayment.delete({ where: { id: row.id } });
      throw new BadRequestException(`Razorpay order failed: ${detail.slice(0, 200)}`);
    }
    const orderJson = (await orderRes.json()) as { id: string };
    await this.prisma.gymPayment.update({
      where: { id: row.id },
      data: { providerOrderId: orderJson.id },
    });

    return {
      orderId: orderJson.id,
      amount: input.amountInr * 100,
      currency: 'INR',
      keyId,
      paymentId: row.id,
      demo: false,
      note: 'Open Razorpay checkout; webhook marks paid on capture.',
    };
  }

  async handleRazorpayWebhook(rawBody: string, signature: string) {
    const secret =
      this.config.get<string>('RAZORPAY_WEBHOOK_SECRET')?.trim() ??
      this.config.get<string>('RAZORPAY_KEY_SECRET')?.trim();
    if (!secret) throw new BadRequestException('Razorpay webhook secret not configured');
    if (!this.verifyRazorpayWebhookSignature(rawBody, signature, secret)) {
      throw new BadRequestException('Invalid webhook signature');
    }

    let payload: {
      event?: string;
      payload?: {
        payment?: { entity?: { order_id?: string; id?: string; status?: string } };
      };
    };
    try {
      payload = JSON.parse(rawBody) as typeof payload;
    } catch {
      throw new BadRequestException('Invalid webhook JSON');
    }

    const event = payload.event ?? '';
    if (event !== 'payment.captured' && event !== 'order.paid') {
      return { ok: true, ignored: true, event };
    }

    const entity = payload.payload?.payment?.entity;
    const orderId = entity?.order_id?.trim();
    if (!orderId) return { ok: true, ignored: true, reason: 'no_order_id' };

    const payment = await this.prisma.gymPayment.findFirst({
      where: { providerOrderId: orderId },
      include: { member: true, tenant: true },
    });
    if (!payment) return { ok: true, ignored: true, reason: 'payment_not_found' };
    if (payment.status === 'paid') return { ok: true, idempotent: true, paymentId: payment.id };

    await this.markRazorpayPaymentPaid(payment, entity?.id ?? orderId);
    const renewal = await renewMembershipAfterPayment(
      this.prisma,
      payment.gymId,
      payment.memberUserId,
      payment.title,
    );

    return {
      ok: true,
      paymentId: payment.id,
      status: 'paid',
      membershipRenewed: renewal.renewed,
    };
  }

  verifyRazorpayPaymentSignature(
    orderId: string,
    paymentId: string,
    signature: string,
    secret: string,
  ) {
    const expected = createHmac('sha256', secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    if (signature.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  async verifyRazorpayCheckout(
    user: AuthUserPayload,
    dto: {
      paymentId: string;
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    },
  ) {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Members only');

    const secret = this.config.get<string>('RAZORPAY_KEY_SECRET')?.trim();
    if (!secret) throw new BadRequestException('Razorpay not configured');

    const row = await this.prisma.gymPayment.findFirst({
      where: {
        id: dto.paymentId,
        gymId: memberRole.gymId,
        memberUserId: user.id,
        providerOrderId: dto.razorpayOrderId,
      },
    });
    if (!row) throw new NotFoundException('Payment not found');
    if (row.status === 'paid') {
      return { ok: true, idempotent: true, paymentId: row.id };
    }

    const valid = this.verifyRazorpayPaymentSignature(
      dto.razorpayOrderId,
      dto.razorpayPaymentId,
      dto.razorpaySignature,
      secret,
    );
    if (!valid) throw new BadRequestException('Invalid Razorpay signature');

    await this.markRazorpayPaymentPaid(row, dto.razorpayPaymentId);
    const renewal = await renewMembershipAfterPayment(
      this.prisma,
      row.gymId,
      row.memberUserId,
      row.title,
    );

    return {
      ok: true,
      paymentId: row.id,
      status: 'paid',
      membershipRenewed: renewal.renewed,
    };
  }

  private async markRazorpayPaymentPaid(
    payment: {
      id: string;
      gymId: string;
      memberUserId: string;
      amountInr: number;
    },
    providerRef: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.gymPayment.update({
        where: { id: payment.id },
        data: { status: 'paid' },
      });
      await tx.paymentLedgerEntry.create({
        data: {
          gymId: payment.gymId,
          paymentId: payment.id,
          kind: 'payment',
          amountInr: payment.amountInr,
          eventKey: `razorpay:${providerRef}`,
        },
      });
      await tx.auditLog.create({
        data: {
          gymId: payment.gymId,
          userId: payment.memberUserId,
          action: 'payment.razorpay_captured',
          resource: payment.id,
          meta: { providerRef },
        },
      });
    });
  }

  async downloadReceipt(user: AuthUserPayload, paymentId: string) {
    const row = await this.prisma.gymPayment.findUnique({
      where: { id: paymentId },
      include: { member: true, tenant: true },
    });
    if (!row || row.status !== 'paid') throw new NotFoundException('Receipt not found');

    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    const admin = gymRole(user, Role.GYM_ADMIN, row.tenant.slug);
    const memberOk = memberRole?.gymId === row.gymId && user.id === row.memberUserId;
    if (!admin && !memberOk) throw new ForbiddenException('Not allowed');

    const issued = row.updatedAt.toISOString().slice(0, 10);
    const lines = [
      `FitCore payment receipt`,
      `Gym: ${row.tenant.name}`,
      `Receipt ID: ${row.id}`,
      `Date: ${issued}`,
      ``,
      `Member: ${row.member.name}`,
      `Email: ${row.member.email}`,
      ``,
      `Description: ${row.title}`,
      `Amount: INR ${row.amountInr}`,
      `Method: ${row.method}`,
      `Status: paid`,
      ``,
      `This is a computer-generated receipt for gym records.`,
    ];

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt ${row.id.slice(0, 8)}</title></head><body style="font-family:system-ui;max-width:480px;margin:2rem auto;padding:1rem"><h1>Payment receipt</h1><p><strong>${row.tenant.name}</strong></p><table style="width:100%;font-size:14px;line-height:1.6"><tr><td>Receipt</td><td>${row.id}</td></tr><tr><td>Date</td><td>${issued}</td></tr><tr><td>Member</td><td>${row.member.name}</td></tr><tr><td>Description</td><td>${row.title}</td></tr><tr><td>Amount</td><td>₹${row.amountInr.toLocaleString('en-IN')}</td></tr><tr><td>Method</td><td>${row.method}</td></tr></table><p style="font-size:12px;color:#666">Computer-generated receipt for gym records.</p></body></html>`;

    return {
      filename: `receipt-${row.id.slice(0, 8)}.html`,
      mimeType: 'text/html; charset=utf-8',
      body: html,
      textBody: lines.join('\n'),
    };
  }
}
