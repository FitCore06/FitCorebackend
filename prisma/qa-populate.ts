import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const password = process.env.QA_TEST_PASSWORD;
const databaseUrl = process.env.DATABASE_URL ?? '';

if (!databaseUrl.includes('fitcore_qa_')) {
  throw new Error('QA seed refused: DATABASE_URL must target fitcore_qa_*');
}
if (!password || password.length < 8) {
  throw new Error('QA_TEST_PASSWORD with at least 8 characters is required');
}

const gyms = [
  { slug: 'qa-iron-hub', name: 'QA Iron Hub' },
  { slug: 'qa-fit-arena', name: 'QA Fit Arena' },
  { slug: 'qa-power-club', name: 'QA Power Club' },
] as const;

async function ensureUser(input: {
  email: string;
  name: string;
  phone: string;
  gymId: string;
  role: 'GYM_ADMIN' | 'TRAINER' | 'MEMBER';
  passwordHash: string;
}) {
  const user = await prisma.user.upsert({
    where: { email: input.email },
    create: {
      email: input.email,
      name: input.name,
      phone: input.phone,
      passwordHash: input.passwordHash,
    },
    update: {
      name: input.name,
      phone: input.phone,
      passwordHash: input.passwordHash,
    },
  });
  await prisma.userTenantRole.upsert({
    where: {
      userId_gymId_role: {
        userId: user.id,
        gymId: input.gymId,
        role: input.role,
      },
    },
    create: { userId: user.id, gymId: input.gymId, role: input.role },
    update: {},
  });
  return user;
}

async function ensureBranch(gymId: string, name: string) {
  return (
    (await prisma.branch.findFirst({ where: { gymId, name } })) ??
    (await prisma.branch.create({ data: { gymId, name, status: 'active' } }))
  );
}

async function populateGym(index: number, gym: (typeof gyms)[number], passwordHash: string) {
  const tenant = await prisma.tenant.upsert({
    where: { slug: gym.slug },
    create: { slug: gym.slug, name: gym.name, status: 'active' },
    update: { name: gym.name, status: 'active' },
  });
  const branches = await Promise.all([
    ensureBranch(tenant.id, 'Main branch'),
    ensureBranch(tenant.id, 'North branch'),
    ensureBranch(tenant.id, 'South branch'),
  ]);
  const qaStrengthWeeklyPlan = {
    id: `week-qa-strength-${gym.slug}`,
    name: 'QA Strength Plan',
    goal: 'Strength',
    days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((dayId, n) => ({
      dayId,
      restDay: n >= 4,
      title: n >= 4 ? 'Rest' : 'QA Strength Plan',
      exercises:
        n >= 4
          ? []
          : [{ id: `qa-squat-${dayId}`, name: 'Squat', sets: 4, reps: '8', restSec: 90 }],
    })),
    updatedAt: new Date().toISOString(),
    source: 'trainer',
    trainerName: 'QA Trainer',
  };
  const qaBalancedDietPlan = {
    id: `diet-qa-balanced-${gym.slug}`,
    name: 'QA Balanced Diet',
    goal: 'Maintenance',
    dailyCalories: 2200,
    proteinG: 140,
    carbsG: 250,
    fatG: 70,
    meals: [
      { id: 'qa-breakfast', mealType: 'breakfast', details: 'Oats, whey, and fruit', calories: 500, proteinG: 35 },
      { id: 'qa-lunch', mealType: 'lunch', details: 'Rice, dal, vegetables, and paneer', calories: 700, proteinG: 42 },
      { id: 'qa-dinner', mealType: 'dinner', details: 'Grilled protein with vegetables', calories: 600, proteinG: 40 },
    ],
  };

  const owners = [];
  for (let n = 1; n <= 2; n += 1) {
    owners.push(
      await ensureUser({
        email: `owner${n}@${gym.slug}.example.test`,
        name: `${gym.name} Owner ${n}`,
        phone: `+9191${index}${n}000001`,
        gymId: tenant.id,
        role: 'GYM_ADMIN',
        passwordHash,
      }),
    );
  }

  const trainers = [];
  for (let n = 1; n <= 2; n += 1) {
    const trainer = await ensureUser({
      email: `trainer${n}@${gym.slug}.example.test`,
      name: `${gym.name} Trainer ${n}`,
      phone: `+9192${index}${n}000002`,
      gymId: tenant.id,
      role: 'TRAINER',
      passwordHash,
    });
    trainers.push(trainer);
    await prisma.trainerProfile.upsert({
      where: { gymId_userId: { gymId: tenant.id, userId: trainer.id } },
      create: {
        gymId: tenant.id,
        userId: trainer.id,
        specialty: n === 1 ? 'Strength & conditioning' : 'Mobility & fat loss',
        liveStatus: n === 1 ? 'available' : 'in-session',
        liveDetail: n === 1 ? 'Available on floor' : 'PT session in progress',
      },
      update: {},
    });
    if ((await prisma.trainerScheduleBlock.count({ where: { gymId: tenant.id, trainerUserId: trainer.id } })) === 0) {
      await prisma.trainerScheduleBlock.createMany({
        data: [
          { gymId: tenant.id, trainerUserId: trainer.id, timeLabel: '07:00 AM', title: 'Floor coaching', blockType: 'floor', durationMin: 90, sortOrder: 1 },
          { gymId: tenant.id, trainerUserId: trainer.id, timeLabel: '11:00 AM', title: 'PT session', blockType: 'session', durationMin: 60, sortOrder: 2 },
          { gymId: tenant.id, trainerUserId: trainer.id, timeLabel: '03:00 PM', title: 'Approved leave', blockType: 'leave', durationMin: 120, sortOrder: 3 },
        ],
      });
    }
  }

  const members = [];
  for (let n = 1; n <= 8; n += 1) {
    const trial = n >= 7;
    const member = await ensureUser({
      email: `${trial ? 'newmember' : 'member'}${String(n).padStart(2, '0')}@${gym.slug}.example.test`,
      name: `${gym.name} ${trial ? 'New Member' : 'Member'} ${n}`,
      phone: `+9193${index}${String(n).padStart(2, '0')}0003`,
      gymId: tenant.id,
      role: 'MEMBER',
      passwordHash,
    });
    members.push(member);
    const trainer = trainers[(n - 1) % trainers.length];
    await prisma.memberTrainerAssignment.upsert({
      where: { gymId_memberUserId: { gymId: tenant.id, memberUserId: member.id } },
      create: {
        gymId: tenant.id,
        memberUserId: member.id,
        trainerUserId: trainer.id,
        planLabel: trial ? '7-day trial' : n % 2 ? 'Annual Premium' : 'Quarterly Pro',
        membershipStatus: trial ? 'trial' : 'active',
        membershipNote: trial ? 'Trial member — conversion follow-up pending' : 'Active QA membership',
        nextSessionNote: `Tomorrow ${n % 2 ? '07:00 AM' : '06:00 PM'}`,
      },
      update: { trainerUserId: trainer.id, active: true },
    });
    if (n <= 4) {
      await prisma.userBranchAccess.upsert({
        where: { userId_branchId: { userId: member.id, branchId: branches[n % 2].id } },
        create: { userId: member.id, branchId: branches[n % 2].id },
        update: {},
      });
    }
  }

  if ((await prisma.gymMembershipPlan.count({ where: { gymId: tenant.id } })) === 0) {
    await prisma.gymMembershipPlan.createMany({ data: [
      { gymId: tenant.id, name: 'Monthly Flex', durationLabel: '1 month', priceInr: 2499 },
      { gymId: tenant.id, name: 'Quarterly Pro', durationLabel: '3 months', priceInr: 6499 },
      { gymId: tenant.id, name: 'Annual Premium', durationLabel: '12 months', priceInr: 19999 },
      { gymId: tenant.id, name: '7-day trial', durationLabel: '7 days', priceInr: 0 },
    ] });
  }
  if ((await prisma.gymPayment.count({ where: { gymId: tenant.id } })) === 0) {
    await prisma.gymPayment.createMany({ data: members.slice(0, 6).map((member, n) => ({
      gymId: tenant.id,
      memberUserId: member.id,
      title: n % 2 ? 'Quarterly membership' : 'Monthly membership',
      amountInr: n % 2 ? 6499 : 2499,
      method: n % 3 ? 'UPI' : 'Card',
      status: n === 5 ? 'refunded' : n === 4 ? 'pending' : 'paid',
    })) });
  }
  if ((await prisma.memberCheckIn.count({ where: { gymId: tenant.id } })) === 0) {
    for (let n = 0; n < 6; n += 1) {
      const checkInAt = new Date(Date.now() - (n + 1) * 86_400_000);
      await prisma.memberCheckIn.create({ data: {
        gymId: tenant.id,
        memberUserId: members[n].id,
        branchId: branches[n % branches.length].id,
        branchName: branches[n % branches.length].name,
        checkInToken: `QA-${gym.slug}-${n + 1}`,
        checkInAt,
        checkOutAt: new Date(checkInAt.getTime() + 75 * 60_000),
      } });
    }
  }
  if ((await prisma.sessionBooking.count({ where: { gymId: tenant.id } })) === 0) {
    for (let n = 0; n < 4; n += 1) {
      const booking = await prisma.sessionBooking.create({ data: {
        gymId: tenant.id,
        memberUserId: members[n].id,
        trainerUserId: trainers[n % 2].id,
        startAtLabel: `QA Day ${n + 1} ${n % 2 ? '18:00' : '07:00'}`,
        status: n === 3 ? 'completed' : 'confirmed',
      } });
      await prisma.bookingStatusEvent.create({ data: { bookingId: booking.id, status: booking.status, note: 'QA populated booking' } });
    }
  }

  if ((await prisma.trialLead.count({ where: { gymId: tenant.id } })) === 0) {
    await prisma.trialLead.createMany({ data: [
      { gymId: tenant.id, name: 'QA Walk-in Lead', phone: `+9188${index}000001`, source: 'Walk-in', trialEndsLabel: 'In 5 days', followUpLabel: 'Today', status: 'active', assignedTrainerName: trainers[0].name },
      { gymId: tenant.id, name: 'QA Instagram Lead', phone: `+9188${index}000002`, source: 'Instagram', trialEndsLabel: 'Tomorrow', followUpLabel: 'Tomorrow', status: 'expiring', assignedTrainerName: trainers[1].name },
    ] });
    await prisma.crmLead.createMany({ data: [
      { gymId: tenant.id, name: 'QA CRM New', phone: `+9177${index}000001`, source: 'Website', stage: 'new', nextAction: 'Schedule demo', assignedUserId: trainers[0].id },
      { gymId: tenant.id, name: 'QA CRM Converted', phone: `+9177${index}000002`, source: 'Referral', stage: 'converted', nextAction: 'Send welcome pack', assignedUserId: trainers[1].id },
    ] });
  }
  if ((await prisma.gymEquipment.count({ where: { gymId: tenant.id } })) === 0) {
    await prisma.gymEquipment.createMany({ data: branches.map((branch, n) => ({ gymId: tenant.id, name: `QA Treadmill ${n + 1}`, branch: branch.name, status: n === 1 ? 'service-due' : 'ok', nextServiceLabel: n === 1 ? 'This week' : 'Next quarter' })) });
  }
  if ((await prisma.gymNotification.count({ where: { gymId: tenant.id } })) === 0) {
    await prisma.gymNotification.createMany({ data: [
      { gymId: tenant.id, userId: owners[0].id, title: 'QA renewals due', body: 'Two memberships need follow-up.' },
      { gymId: tenant.id, userId: trainers[0].id, title: 'QA schedule updated', body: 'Your evening session was updated.' },
      { gymId: tenant.id, userId: members[0].id, title: 'QA session reminder', body: 'Your session starts tomorrow.' },
      { gymId: tenant.id, userId: members[0].id, title: 'QA read notification', body: 'Previously viewed notification.', read: true },
    ] });
  }
  if ((await prisma.gymOtherExpense.count({ where: { gymId: tenant.id } })) === 0) {
    await prisma.gymOtherExpense.createMany({ data: [
      { gymId: tenant.id, category: 'Utilities', title: 'QA electricity bill', amountInr: 18500, paidAt: new Date(), createdByUserId: owners[0].id },
      { gymId: tenant.id, category: 'Maintenance', title: 'QA equipment service', amountInr: 7200, paidAt: new Date(), createdByUserId: owners[1].id },
    ] });
  }
  if ((await prisma.gymSupplementSale.count({ where: { gymId: tenant.id } })) === 0) {
    await prisma.gymSupplementSale.create({ data: {
      gymId: tenant.id,
      memberUserId: members[0].id,
      billNumber: `QA-${index}-0001`,
      lineItems: [{ name: 'Whey Protein QA', quantity: 1, priceInr: 2499 }],
      amountInr: 2499,
      paymentMethod: 'UPI',
      whatsappStatus: 'not-sent',
      createdByUserId: owners[0].id,
    } });
  }
  if ((await prisma.memberIssue.count({ where: { gymId: tenant.id } })) === 0) {
    await prisma.memberIssue.create({ data: { gymId: tenant.id, memberUserId: members[0].id, category: 'equipment', subject: 'QA treadmill issue', description: 'QA member reported belt vibration.', equipmentName: 'QA Treadmill 1', status: 'open' } });
    await prisma.trainerFeedback.create({ data: { gymId: tenant.id, memberUserId: members[0].id, trainerUserId: trainers[0].id, rating: 5, feedbackText: 'QA trainer feedback — clear coaching and safe form.' } });
  }
  if ((await prisma.gymAutomationRule.count({ where: { gymId: tenant.id } })) === 0) {
    await prisma.gymAutomationRule.createMany({ data: [
      { gymId: tenant.id, name: 'QA trial expiry reminder', channel: 'WhatsApp + email', enabled: true },
      { gymId: tenant.id, name: 'QA membership renewal', channel: 'Push', enabled: true },
    ] });
    await prisma.gymReportExport.createMany({ data: [
      { gymId: tenant.id, name: 'QA attendance daily', format: 'CSV', lastRunLabel: 'Today 06:00' },
      { gymId: tenant.id, name: 'QA revenue summary', format: 'PDF', lastRunLabel: 'Yesterday' },
    ] });
    await prisma.trainerPayrollRun.createMany({ data: trainers.map((trainer, n) => ({
      gymId: tenant.id,
      trainerName: trainer.name,
      baseInr: 40000 + n * 5000,
      commissionInr: 6000 + n * 1500,
      period: 'QA Nov 2026',
      status: n ? 'pending' : 'paid',
    })) });
  }
  await prisma.workoutTemplate.upsert({
    where: { gymId_builtInKey: { gymId: tenant.id, builtInKey: 'qa-strength' } },
    create: { gymId: tenant.id, builtInKey: 'qa-strength', createdById: trainers[0].id, name: 'QA Strength Plan', goal: 'Strength', daysPerWeek: 4, exercises: [{ id: 'qa-squat', name: 'Squat', sets: 4, reps: 8 }] },
    update: {},
  });
  await prisma.dietTemplate.upsert({
    where: { gymId_builtInKey: { gymId: tenant.id, builtInKey: 'qa-balanced' } },
    create: { gymId: tenant.id, builtInKey: 'qa-balanced', createdById: trainers[0].id, name: qaBalancedDietPlan.name, goal: qaBalancedDietPlan.goal, dailyCalories: qaBalancedDietPlan.dailyCalories, proteinG: qaBalancedDietPlan.proteinG, carbsG: qaBalancedDietPlan.carbsG, fatG: qaBalancedDietPlan.fatG, meals: qaBalancedDietPlan.meals },
    update: { meals: qaBalancedDietPlan.meals },
  });
  await prisma.fitnessPlanAssignment.upsert({
    where: { gymId_memberUserId_planType: { gymId: tenant.id, memberUserId: members[0].id, planType: 'workout' } },
    create: { gymId: tenant.id, memberUserId: members[0].id, trainerUserId: trainers[0].id, planType: 'workout', templateRef: 'qa-strength', planSnapshot: qaStrengthWeeklyPlan },
    update: { planSnapshot: qaStrengthWeeklyPlan },
  });
  await prisma.fitnessPlanAssignment.upsert({
    where: { gymId_memberUserId_planType: { gymId: tenant.id, memberUserId: members[0].id, planType: 'diet' } },
    create: { gymId: tenant.id, memberUserId: members[0].id, trainerUserId: trainers[0].id, planType: 'diet', templateRef: 'qa-balanced', planSnapshot: qaBalancedDietPlan },
    update: { planSnapshot: qaBalancedDietPlan },
  });
  await prisma.memberWeeklyWorkout.upsert({
    where: { gymId_memberUserId_source: { gymId: tenant.id, memberUserId: members[0].id, source: 'trainer' } },
    create: { gymId: tenant.id, memberUserId: members[0].id, source: 'trainer', planJson: qaStrengthWeeklyPlan },
    update: { planJson: qaStrengthWeeklyPlan },
  });
  await prisma.workoutSetLog.upsert({
    where: { memberUserId_logDate_dayId_exerciseId_setNumber: { memberUserId: members[0].id, logDate: '2026-11-18', dayId: 'monday', exerciseId: 'qa-squat', setNumber: 1 } },
    create: { gymId: tenant.id, memberUserId: members[0].id, logDate: '2026-11-18', dayId: 'monday', exerciseId: 'qa-squat', setNumber: 1, weightKg: 60 },
    update: {},
  });
  await prisma.dietMealLog.upsert({
    where: { memberUserId_logDate_mealId: { memberUserId: members[0].id, logDate: '2026-11-18', mealId: 'qa-breakfast' } },
    create: { gymId: tenant.id, memberUserId: members[0].id, logDate: '2026-11-18', mealId: 'qa-breakfast' },
    update: {},
  });
  if ((await prisma.trainerMessage.count({ where: { gymId: tenant.id } })) === 0) {
    await prisma.trainerMessage.createMany({ data: [
      { gymId: tenant.id, memberUserId: members[0].id, trainerUserId: trainers[0].id, senderRole: 'trainer', body: 'QA message: your plan is ready.' },
      { gymId: tenant.id, memberUserId: members[0].id, trainerUserId: trainers[0].id, senderRole: 'member', body: 'QA message: thank you coach.' },
    ] });
  }
  if ((await prisma.auditLog.count({ where: { gymId: tenant.id } })) === 0) {
    await prisma.auditLog.createMany({ data: [
      { gymId: tenant.id, userId: owners[0].id, action: 'qa.seed.completed', resource: 'tenant', meta: { slug: gym.slug } },
      { gymId: tenant.id, userId: owners[1].id, action: 'qa.members.reviewed', resource: 'member-list', meta: { count: members.length } },
    ] });
  }
}

async function main() {
  const passwordHash = await bcrypt.hash(password!, 12);
  for (const [index, gym] of gyms.entries()) await populateGym(index + 1, gym, passwordHash);
  const tenantIds = (await prisma.tenant.findMany({ where: { slug: { in: gyms.map((g) => g.slug) } }, select: { id: true } })).map((t) => t.id);
  const [owners, trainers, members, branches, payments, visits, bookings] = await Promise.all([
    prisma.userTenantRole.count({ where: { gymId: { in: tenantIds }, role: 'GYM_ADMIN' } }),
    prisma.userTenantRole.count({ where: { gymId: { in: tenantIds }, role: 'TRAINER' } }),
    prisma.userTenantRole.count({ where: { gymId: { in: tenantIds }, role: 'MEMBER' } }),
    prisma.branch.count({ where: { gymId: { in: tenantIds } } }),
    prisma.gymPayment.count({ where: { gymId: { in: tenantIds } } }),
    prisma.memberCheckIn.count({ where: { gymId: { in: tenantIds } } }),
    prisma.sessionBooking.count({ where: { gymId: { in: tenantIds } } }),
  ]);
  console.log(JSON.stringify({ gyms: tenantIds.length, owners, trainers, members, branches, payments, visits, bookings }));
}

main().finally(() => prisma.$disconnect());
