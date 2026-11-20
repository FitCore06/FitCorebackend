import { ValidationPipe } from '@nestjs/common';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { REGISTRATION_INVITE_KIND } from '../src/auth/registration-invite.service.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createRegistrationInvite } from './registration-invite.helpers.js';

const databaseName = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? '').pathname.slice(1);
  } catch {
    return '';
  }
})();
const qaEnabled = databaseName.startsWith('fitcore_qa_');
const suffix = `qa-${Date.now()}`;
const password = 'QaPassword!123';

type Session = { accessToken: string; refreshToken: string; user: { id: string } };

/**
 * Preconditions: DATABASE_URL points at the named disposable QA database.
 * Test data: two independent gyms, two owners, two trainers, and three members.
 * Safety: this suite is skipped unless the database name starts with fitcore_qa_.
 */
(qaEnabled ? describe : describe.skip)('QA tenant and authentication matrix', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerA: Session;
  let ownerB: Session;
  let memberA: Session;
  let memberA2: Session;
  let trainerA: Session;
  let gymASlug: string;
  let gymBSlug: string;
  let assignmentId: string;
  let gymAMainBranchId: string;
  let gymARestrictedBranchId: string;
  let gymBBranchId: string;
  let paymentAId: string;

  const auth = (session: Session) => ({ Authorization: `Bearer ${session.accessToken}` });

  async function registerOwner(label: string): Promise<Session> {
    const slug = `qa-${label}-${suffix}`;
    const inviteToken = await createRegistrationInvite(prisma, {
      kind: REGISTRATION_INVITE_KIND.GYM_OWNER,
    });
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register/admin')
      .send({
        name: `QA Owner ${label}`,
        email: `owner-${label}-${suffix}@example.test`,
        password,
        gymName: `QA Gym ${label}`,
        gymSlug: slug,
        inviteToken,
      })
      .expect(201);
    return response.body as Session;
  }

  async function registerMember(label: string, gymSlug: string): Promise<Session> {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: gymSlug } });
    const inviteToken = await createRegistrationInvite(prisma, {
      kind: REGISTRATION_INVITE_KIND.GYM_MEMBER,
      gymId: tenant.id,
    });
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register/member')
      .send({
        name: `QA Member ${label}`,
        email: `member-${label}-${suffix}@example.test`,
        password,
        gymSlug,
        phone: '+919900000000',
        inviteToken,
      })
      .expect(201);
    return response.body as Session;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    gymASlug = `qa-a-${suffix}`;
    gymBSlug = `qa-b-${suffix}`;
    ownerA = await registerOwner('a');
    ownerB = await registerOwner('b');
    memberA = await registerMember('a', gymASlug);
    memberA2 = await registerMember('a2', gymASlug);
    await registerMember('b', gymBSlug);

    const [gymA, gymB] = await Promise.all([
      prisma.tenant.findUniqueOrThrow({ where: { slug: gymASlug } }),
      prisma.tenant.findUniqueOrThrow({ where: { slug: gymBSlug } }),
    ]);
    const gymAMainBranch = await prisma.branch.findFirstOrThrow({
      where: { gymId: gymA.id, name: 'Main branch' },
    });
    const [gymARestrictedBranch, gymBBranch] = await Promise.all([
      prisma.branch.create({
        data: { gymId: gymA.id, name: 'QA Restricted Branch' },
      }),
      prisma.branch.create({
        data: { gymId: gymB.id, name: 'QA Gym B Branch' },
      }),
    ]);
    gymAMainBranchId = gymAMainBranch.id;
    gymARestrictedBranchId = gymARestrictedBranch.id;
    gymBBranchId = gymBBranch.id;
    await prisma.userBranchAccess.create({
      data: { userId: memberA.user.id, branchId: gymAMainBranchId },
    });
    const trainerHash = await bcrypt.hash(password, 12);
    for (const [label, gym] of [['a', gymA], ['b', gymB]] as const) {
      const trainer = await prisma.user.create({
        data: {
          name: `QA Trainer ${label.toUpperCase()}`,
          email: `trainer-${label}-${suffix}@example.test`,
          passwordHash: trainerHash,
        },
      });
      await prisma.userTenantRole.create({ data: { userId: trainer.id, gymId: gym.id, role: 'TRAINER' } });
      await prisma.trainerProfile.create({ data: { userId: trainer.id, gymId: gym.id } });
    }
    const trainerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `trainer-a-${suffix}@example.test`, password })
      .expect(201);
    trainerA = trainerLogin.body as Session;
    await prisma.trialLead.create({
      data: {
        gymId: gymA.id,
        name: 'QA Demo Lead',
        phone: '+919900000001',
        source: 'QA',
        trialEndsLabel: 'Tomorrow',
        followUpLabel: 'Today',
        status: 'active',
        assignedTrainerName: 'QA Trainer A',
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('AUTH-001 validates malformed registration input', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register/admin')
      .send({ email: 'not-an-email' })
      .expect(400);
  });

  it('AUTH-001b rejects owner registration without a valid invite', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register/admin')
      .send({
        name: 'No Invite Owner',
        email: `no-invite-owner-${suffix}@example.test`,
        password,
        gymName: 'No Invite Gym',
        gymSlug: `no-invite-${suffix}`,
        inviteToken: 'not-a-real-invite-token',
      })
      .expect(403);
  });

  it('AUTH-002 rejects duplicate owner registration', async () => {
    const inviteToken = await createRegistrationInvite(prisma, {
      kind: REGISTRATION_INVITE_KIND.GYM_OWNER,
    });
    await request(app.getHttpServer())
      .post('/api/v1/auth/register/admin')
      .send({
        name: 'Duplicate Owner',
        email: `owner-a-${suffix}@example.test`,
        password,
        gymName: 'Duplicate Gym',
        gymSlug: `duplicate-${suffix}`,
        inviteToken,
      })
      .expect(409);
  });

  it('AUTH-003 rotates and revokes refresh tokens', async () => {
    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: ownerA.refreshToken })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: ownerA.refreshToken })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(401);
  });

  it('RBAC-001 rejects anonymous and member access to owner member lists', async () => {
    await request(app.getHttpServer()).get(`/api/v1/members?gymSlug=${gymASlug}`).expect(401);
    await request(app.getHttpServer())
      .get(`/api/v1/members?gymSlug=${gymASlug}`)
      .set(auth(memberA))
      .expect(403);
  });

  it('TENANT-001 prevents owner A from reading owner B members', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/members?gymSlug=${gymBSlug}`)
      .set(auth(ownerA))
      .expect(403);
  });

  it('TENANT-002 returns only the requesting owner tenant members', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/members?gymSlug=${gymASlug}`)
      .set(auth(ownerA))
      .expect(200);
    expect(response.body).toHaveLength(2);
    expect(response.body.map((member: { email: string }) => member.email)).not.toContain(
      `member-b-${suffix}@example.test`,
    );
  });

  it('PAYMENT-002 allows an owner to create a payment for their gym member', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set(auth(ownerA))
      .send({
        gymSlug: gymASlug,
        memberEmail: `member-a-${suffix}@example.test`,
        title: 'Same-tenant QA payment',
        amountInr: 100,
        method: 'cash',
        status: 'paid',
        idempotencyKey: `payment-${suffix}`,
      })
      .expect(201);
    paymentAId = response.body.id;
  });

  it('PAYMENT-003 returns the original payment for a duplicate idempotency key', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set(auth(ownerA))
      .send({
        gymSlug: gymASlug,
        memberEmail: `member-a-${suffix}@example.test`,
        title: 'Same-tenant QA payment', amountInr: 100, method: 'cash', status: 'paid',
        idempotencyKey: `payment-${suffix}`,
      })
      .expect(201);
    expect(response.body.id).toBe(paymentAId);
    const ledgerCount = await prisma.paymentLedgerEntry.count({ where: { paymentId: paymentAId, kind: 'payment' } });
    expect(ledgerCount).toBe(1);
  });

  it('PAYMENT-004 supports partial then full refund without duplicate retry', async () => {
    const partial = await request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentAId}/refunds`).set(auth(ownerA))
      .send({ amountInr: 30, reason: 'QA partial', idempotencyKey: `refund-partial-${suffix}` })
      .expect(201);
    expect(partial.body.payment.status).toBe('paid');
    expect(partial.body.payment.refundedAmountInr).toBe(30);
    const retry = await request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentAId}/refunds`).set(auth(ownerA))
      .send({ amountInr: 30, reason: 'QA partial', idempotencyKey: `refund-partial-${suffix}` })
      .expect(201);
    expect(retry.body.idempotent).toBe(true);
    const full = await request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentAId}/refunds`).set(auth(ownerA))
      .send({ amountInr: 70, reason: 'QA full', idempotencyKey: `refund-full-${suffix}` })
      .expect(201);
    expect(full.body.payment.status).toBe('refunded');
    expect(full.body.payment.refundedAmountInr).toBe(100);
  });

  it('PAYMENT-005 allows only one concurrent competing refund', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/payments').set(auth(ownerA))
      .send({
        gymSlug: gymASlug, memberEmail: `member-a-${suffix}@example.test`,
        title: 'Concurrent refund QA', amountInr: 100, method: 'cash', status: 'paid',
        idempotencyKey: `payment-concurrent-${suffix}`,
      }).expect(201);
    const [first, second] = await Promise.all([
      request(app.getHttpServer()).post(`/api/v1/payments/${created.body.id}/refunds`).set(auth(ownerA)).send({ amountInr: 70, idempotencyKey: `refund-race-a-${suffix}` }),
      request(app.getHttpServer()).post(`/api/v1/payments/${created.body.id}/refunds`).set(auth(ownerA)).send({ amountInr: 70, idempotencyKey: `refund-race-b-${suffix}` }),
    ]);
    expect([first.status, second.status].sort((a, b) => a - b)).toEqual([201, 409]);
    const payment = await prisma.gymPayment.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(payment.refundedAmountInr).toBe(70);
  });

  it('PAYMENT-006 rejects cross-tenant refund access', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentAId}/refunds`).set(auth(ownerB))
      .send({ amountInr: 1, idempotencyKey: `refund-foreign-${suffix}` })
      .expect(403);
  });

  it('TENANT-003 rejects cross-tenant payment creation', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set(auth(ownerB))
      .send({
        gymSlug: gymBSlug,
        memberEmail: `member-a-${suffix}@example.test`,
        title: 'Cross-tenant QA payment',
        amountInr: 100,
        method: 'cash',
        status: 'paid',
      })
      .expect(404);
  });

  it('ASSIGN-001 assigns a same-tenant member to their trainer', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/assignments')
      .set(auth(ownerA))
      .send({
        gymSlug: gymASlug,
        memberEmail: `member-a-${suffix}@example.test`,
        trainerEmail: `trainer-a-${suffix}@example.test`,
        planLabel: 'QA annual plan',
        membershipStatus: 'active',
      })
      .expect(201);
    assignmentId = response.body.id;
    expect(response.body.member.email).toBe(`member-a-${suffix}@example.test`);
  });

  it('ASSIGN-002 rejects cross-tenant member and trainer assignments', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/assignments')
      .set(auth(ownerA))
      .send({
        gymSlug: gymASlug,
        memberEmail: `member-b-${suffix}@example.test`,
        trainerEmail: `trainer-a-${suffix}@example.test`,
        planLabel: 'Invalid cross-tenant plan',
        membershipStatus: 'active',
      })
      .expect(400);
  });

  it('TRAINER-001 returns only clients assigned to the logged-in trainer', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/assignments/clients')
      .set(auth(trainerA))
      .expect(200);
    expect(response.body).toEqual([
      expect.objectContaining({ email: `member-a-${suffix}@example.test` }),
    ]);
  });

  it('ASSIGN-003 blocks a foreign owner from deactivating an assignment', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/assignments/${assignmentId}`)
      .set(auth(ownerB))
      .expect(403);
  });

  it('BOOKING-001 lets a member create and view a booking for their assigned trainer', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set(auth(memberA))
      .send({ gymSlug: gymASlug, startAtLabel: 'QA Tuesday 18:00' })
      .expect(201);
    const mine = await request(app.getHttpServer())
      .get('/api/v1/bookings/me')
      .set(auth(memberA))
      .expect(200);
    expect(mine.body.map((booking: { id: string }) => booking.id)).toContain(created.body.id);
  });

  it('BOOKING-002 allows an owner to book their assigned member with their trainer', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/bookings/admin')
      .set(auth(ownerA))
      .send({
        gymSlug: gymASlug,
        memberEmail: `member-a-${suffix}@example.test`,
        trainerEmail: `trainer-a-${suffix}@example.test`,
        startAtLabel: 'QA Wednesday 18:00',
      })
      .expect(201);
  });

  it('BOOKING-003 rejects a trainer time conflict', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/bookings/admin')
      .set(auth(ownerA))
      .send({
        gymSlug: gymASlug,
        memberEmail: `member-a-${suffix}@example.test`,
        trainerEmail: `trainer-a-${suffix}@example.test`,
        startAtLabel: 'QA Wednesday 18:00',
      })
      .expect(400);
  });

  it('BOOKING-004 rejects a booking at an unauthorized branch', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/bookings/admin')
      .set(auth(ownerA))
      .send({
        gymSlug: gymASlug,
        memberEmail: `member-a-${suffix}@example.test`,
        trainerEmail: `trainer-a-${suffix}@example.test`,
        branchId: gymARestrictedBranchId,
        startAtLabel: 'QA Thursday 18:00',
      })
      .expect(403);
  });

  it('OPS-001 creates and lists a membership plan within its tenant', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/gym-ops/memberships/plans?gymSlug=${gymASlug}`)
      .set(auth(ownerA))
      .send({ name: 'QA Gold', durationLabel: '1 month', priceInr: 1999 })
      .expect(201);
    const plans = await request(app.getHttpServer())
      .get(`/api/v1/gym-ops/memberships/plans?gymSlug=${gymASlug}`)
      .set(auth(ownerA))
      .expect(200);
    expect(plans.body).toContainEqual(expect.objectContaining({ name: 'QA Gold', priceInr: 1999 }));
  });

  it('OPS-002 creates and lists a demo lead within its tenant', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/gym-ops/trials?gymSlug=${gymASlug}`)
      .set(auth(ownerA))
      .send({ name: 'QA Demo API', phone: '+919900000002', source: 'QA test' })
      .expect(201);
    const trials = await request(app.getHttpServer())
      .get(`/api/v1/gym-ops/trials?gymSlug=${gymASlug}`)
      .set(auth(ownerA))
      .expect(200);
    expect(trials.body).toContainEqual(expect.objectContaining({ name: 'QA Demo API' }));
  });

  it('OPS-003 creates and updates a CRM lead within its tenant', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/gym-ops/crm?gymSlug=${gymASlug}`)
      .set(auth(ownerA))
      .send({ name: 'QA CRM Lead', source: 'QA', stage: 'new', nextAction: 'Call' })
      .expect(201);
    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/gym-ops/crm/${created.body.id}?gymSlug=${gymASlug}`)
      .set(auth(ownerA))
      .send({ stage: 'follow-up', nextAction: 'Demo booked' })
      .expect(200);
    expect(updated.body).toEqual(expect.objectContaining({ stage: 'follow-up' }));
  });

  it('OPS-004 creates and lists a branch for its tenant', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/gym-ops/branches?gymSlug=${gymASlug}`)
      .set(auth(ownerA))
      .send({ name: 'QA Secondary Branch' })
      .expect(201);
    const branches = await request(app.getHttpServer())
      .get(`/api/v1/gym-ops/branches?gymSlug=${gymASlug}`)
      .set(auth(ownerA))
      .expect(200);
    expect(branches.body).toContainEqual(expect.objectContaining({ name: 'QA Secondary Branch' }));
  });

  it('ATTENDANCE-001 generates and verifies a member QR check-in', async () => {
    const checkIn = await request(app.getHttpServer())
      .post('/api/v1/attendance/check-in')
      .set(auth(memberA))
      .send({ branchId: gymAMainBranchId })
      .expect(201);
    expect(checkIn.body.qrPayload).toEqual(expect.any(String));
    await request(app.getHttpServer())
      .post('/api/v1/attendance/verify-qr')
      .set(auth(ownerA))
      .send({ gymSlug: gymASlug, qrPayload: checkIn.body.qrPayload })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/attendance/check-out')
      .set(auth(memberA))
      .expect(201);
  });

  it('ATTENDANCE-002 permits only one concurrent open check-in for a member', async () => {
    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/attendance/check-in')
        .set(auth(memberA))
        .send({ branchId: gymAMainBranchId }),
      request(app.getHttpServer())
        .post('/api/v1/attendance/check-in')
        .set(auth(memberA))
        .send({ branchId: gymAMainBranchId }),
    ]);
    expect([first.status, second.status].sort((a, b) => a - b)).toEqual([201, 400]);
    const openCount = await prisma.memberCheckIn.count({
      where: { memberUserId: memberA.user.id, checkOutAt: null },
    });
    expect(openCount).toBe(1);
    await request(app.getHttpServer())
      .post('/api/v1/attendance/check-out')
      .set(auth(memberA))
      .expect(201);
  });

  it('PAYMENT-001 rejects invalid payment status values', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set(auth(ownerA))
      .send({
        gymSlug: gymASlug,
        memberEmail: `member-a-${suffix}@example.test`,
        title: 'Invalid status payment',
        amountInr: 100,
        method: 'cash',
        status: 'not-a-status',
      })
      .expect(400);
  });

  it('TENANT-004 rejects a cross-tenant member booking', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/bookings/admin')
      .set(auth(ownerB))
      .send({
        gymSlug: gymBSlug,
        memberEmail: `member-a-${suffix}@example.test`,
        trainerEmail: `trainer-a-${suffix}@example.test`,
        startAtLabel: 'Cross-tenant QA booking',
      })
      .expect(404);
  });

  it('TENANT-005 rejects a cross-tenant trainer booking', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/bookings/admin')
      .set(auth(ownerA))
      .send({
        gymSlug: gymASlug,
        memberEmail: `member-a-${suffix}@example.test`,
        trainerEmail: `trainer-b-${suffix}@example.test`,
        startAtLabel: 'QA Thursday 18:00',
      })
      .expect(404);
  });

  it('BRANCH-001 rejects a nonexistent branch', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/attendance/check-in')
      .set(auth(memberA))
      .send({ branchId: '00000000-0000-4000-8000-000000000000' })
      .expect(404);
  });

  it('BRANCH-002 rejects a branch from another tenant', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/attendance/check-in')
      .set(auth(memberA))
      .send({ branchId: gymBBranchId })
      .expect(404);
  });

  it('BRANCH-003 rejects a member without access to a gym branch', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/attendance/check-in')
      .set(auth(memberA))
      .send({ branchId: gymARestrictedBranchId })
      .expect(403);
  });

  it('BRANCH-004 preserves zero-grant tenant-wide access for a new member', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/assignments')
      .set(auth(ownerA))
      .send({ gymSlug: gymASlug, memberEmail: `member-a2-${suffix}@example.test`, trainerEmail: `trainer-a-${suffix}@example.test`, planLabel: 'QA trial', membershipStatus: 'trial' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/attendance/check-in')
      .set(auth(memberA2))
      .send({ branchId: gymARestrictedBranchId })
      .expect(201);
    await request(app.getHttpServer()).post('/api/v1/attendance/check-out').set(auth(memberA2)).expect(201);
  });

  it('BRANCH-005 permits multiple grants and denies access after revocation', async () => {
    await prisma.userBranchAccess.create({ data: { userId: memberA.user.id, branchId: gymARestrictedBranchId } });
    await request(app.getHttpServer()).post('/api/v1/attendance/check-in').set(auth(memberA)).send({ branchId: gymARestrictedBranchId }).expect(201);
    await request(app.getHttpServer()).post('/api/v1/attendance/check-out').set(auth(memberA)).expect(201);
    await prisma.userBranchAccess.deleteMany({ where: { userId: memberA.user.id, branchId: gymARestrictedBranchId } });
    await request(app.getHttpServer()).post('/api/v1/attendance/check-in').set(auth(memberA)).send({ branchId: gymARestrictedBranchId }).expect(403);
  });
});
