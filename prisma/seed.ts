import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import {
  SEED_DIET_TEMPLATES,
  SEED_WORKOUT_TEMPLATES,
} from '../src/fitness/fitness.seed-data.js';
import { GLOBAL_EXERCISE_SEEDS } from '../src/fitness/exercise.seed-data.js';
import { seedGlobalFoodCatalog } from '../src/nutrition/food-catalog.seed.js';

const prisma = new PrismaClient();

export const TEST_PASSWORD = 'FitCore@123';
export const TEST_GYM_SLUG = 'demo-gym';

const accounts = [
  {
    email: 'owner@gym.test',
    name: 'Demo Gym Owner',
    role: 'GYM_ADMIN',
    phone: '+919900000001',
  },
  {
    email: 'member@gym.test',
    name: 'Demo Member',
    role: 'MEMBER',
    phone: '+919900000002',
  },
  {
    email: 'newmember@gym.test',
    name: 'New Member',
    role: 'MEMBER',
    phone: '+919900000003',
  },
  {
    email: 'trainer@gym.test',
    name: 'Demo Trainer',
    role: 'TRAINER',
    phone: '+919900000004',
  },
] as const;

async function main() {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);

  const tenant = await prisma.tenant.upsert({
    where: { slug: TEST_GYM_SLUG },
    create: {
      name: 'Demo Fitness Club',
      slug: TEST_GYM_SLUG,
      status: 'active',
    },
    update: {
      name: 'Demo Fitness Club',
      status: 'active',
    },
  });

  const branchCount = await prisma.branch.count({
    where: { gymId: tenant.id },
  });
  if (branchCount === 0) {
    await prisma.branch.create({
      data: {
        gymId: tenant.id,
        name: 'Main branch',
        status: 'active',
      },
    });
  }

  const usersByEmail: Record<string, { id: string }> = {};

  for (const account of accounts) {
    const user = await prisma.user.upsert({
      where: { email: account.email },
      create: {
        email: account.email,
        name: account.name,
        phone: account.phone,
        passwordHash,
      },
      update: {
        name: account.name,
        phone: account.phone,
        passwordHash,
      },
    });

    await prisma.userTenantRole.upsert({
      where: {
        userId_gymId_role: {
          userId: user.id,
          gymId: tenant.id,
          role: account.role,
        },
      },
      create: {
        userId: user.id,
        gymId: tenant.id,
        role: account.role,
      },
      update: {},
    });
    usersByEmail[account.email] = { id: user.id };
  }

  const member = usersByEmail['member@gym.test'];
  const newMember = usersByEmail['newmember@gym.test'];
  const trainer = usersByEmail['trainer@gym.test'];

  if (member && trainer) {
    await prisma.memberTrainerAssignment.upsert({
      where: {
        gymId_memberUserId: { gymId: tenant.id, memberUserId: member.id },
      },
      create: {
        gymId: tenant.id,
        memberUserId: member.id,
        trainerUserId: trainer.id,
        planLabel: 'Annual Premium',
        membershipStatus: 'active',
        membershipNote: 'Active · renews 12 Jan 2026',
        nextSessionNote: 'Today 7:00 PM (scheduled)',
      },
      update: {
        trainerUserId: trainer.id,
        planLabel: 'Annual Premium',
        membershipStatus: 'active',
        membershipNote: 'Active · renews 12 Jan 2026',
        nextSessionNote: 'Today 7:00 PM (scheduled)',
        active: true,
      },
    });
  }

  if (newMember && trainer) {
    await prisma.memberTrainerAssignment.upsert({
      where: {
        gymId_memberUserId: { gymId: tenant.id, memberUserId: newMember.id },
      },
      create: {
        gymId: tenant.id,
        memberUserId: newMember.id,
        trainerUserId: trainer.id,
        planLabel: '7-day trial',
        membershipStatus: 'trial',
        membershipNote: 'Trial ends in 5 days — trainer will help you pick a plan',
        nextSessionNote: 'Today 11:00 AM with Demo Trainer',
      },
      update: {
        trainerUserId: trainer.id,
        planLabel: '7-day trial',
        membershipStatus: 'trial',
        membershipNote: 'Trial ends in 5 days — trainer will help you pick a plan',
        nextSessionNote: 'Today 11:00 AM with Demo Trainer',
        active: true,
      },
    });
  }

  const memberUser = usersByEmail['member@gym.test'];
  const trainerUser = usersByEmail['trainer@gym.test'];

  if (memberUser && trainerUser) {
    const existing = await prisma.sessionBooking.count({
      where: { gymId: tenant.id, memberUserId: memberUser.id },
    });
    if (existing === 0) {
      const slots = [
        { startAtLabel: 'Thu 18:00', status: 'confirmed' },
        { startAtLabel: 'Sat 09:00', status: 'confirmed' },
      ] as const;
      for (const slot of slots) {
        const booking = await prisma.sessionBooking.create({
          data: {
            gymId: tenant.id,
            memberUserId: memberUser.id,
            trainerUserId: trainerUser.id,
            startAtLabel: slot.startAtLabel,
            status: slot.status,
          },
        });
        await prisma.bookingStatusEvent.create({
          data: {
            bookingId: booking.id,
            status: slot.status,
            note: 'Seeded session',
          },
        });
      }
    }
  }

  if (memberUser && trainerUser) {
    const fbCount = await prisma.trainerFeedback.count({
      where: { gymId: tenant.id },
    });
    if (fbCount === 0) {
      await prisma.trainerFeedback.create({
        data: {
          gymId: tenant.id,
          memberUserId: memberUser.id,
          trainerUserId: trainerUser.id,
          rating: 5,
          feedbackText:
            'Always explains form clearly and adjusts workouts when I have shoulder pain.',
        },
      });
    }
  }

  if (memberUser) {
    const existingVisits = await prisma.memberCheckIn.count({
      where: { gymId: tenant.id, memberUserId: memberUser.id },
    });
    if (existingVisits === 0) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const checkOut = new Date(yesterday.getTime() + 90 * 60 * 1000);
      await prisma.memberCheckIn.create({
        data: {
          gymId: tenant.id,
          memberUserId: memberUser.id,
          branchName: 'Main branch',
          checkInToken: 'FC-SEED1',
          checkInAt: yesterday,
          checkOutAt: checkOut,
        },
      });
    }

    const issueCount = await prisma.memberIssue.count({
      where: { gymId: tenant.id },
    });
    if (issueCount === 0) {
      await prisma.memberIssue.create({
        data: {
          gymId: tenant.id,
          memberUserId: memberUser.id,
          category: 'equipment',
          subject: 'Treadmill belt slipping',
          description:
            'Belt hesitates at 6 km/h near the cardio row — please inspect before peak hours.',
          equipmentName: 'Treadmill #3',
          status: 'open',
        },
      });
    }
  }

  const newMemberUser = usersByEmail['newmember@gym.test'];
  if (memberUser && newMemberUser) {
    const payCount = await prisma.gymPayment.count({
      where: { gymId: tenant.id },
    });
    if (payCount === 0) {
      await prisma.gymPayment.createMany({
        data: [
          {
            gymId: tenant.id,
            memberUserId: memberUser.id,
            title: 'Annual Premium renewal',
            amountInr: 19999,
            method: 'UPI',
            status: 'paid',
          },
          {
            gymId: tenant.id,
            memberUserId: memberUser.id,
            title: 'PT pack (4 sessions)',
            amountInr: 3999,
            method: 'Card',
            status: 'paid',
          },
          {
            gymId: tenant.id,
            memberUserId: newMemberUser.id,
            title: 'Trial upgrade — Monthly Flex',
            amountInr: 2499,
            method: 'UPI',
            status: 'pending',
          },
        ],
      });
    }
  }

  const ownerUser = usersByEmail['owner@gym.test'];
  const catalogCount = await prisma.gymMembershipPlan.count({
    where: { gymId: tenant.id },
  });
  if (catalogCount === 0) {
    await prisma.gymMembershipPlan.createMany({
      data: [
        { gymId: tenant.id, name: 'Monthly Flex', durationLabel: '1 month', priceInr: 2499 },
        { gymId: tenant.id, name: 'Quarterly Pro', durationLabel: '3 months', priceInr: 6499 },
        { gymId: tenant.id, name: 'Annual Premium', durationLabel: '12 months', priceInr: 19999 },
        { gymId: tenant.id, name: '7-day trial', durationLabel: '7 days', priceInr: 0 },
      ],
    });
    await prisma.trialLead.createMany({
      data: [
        {
          gymId: tenant.id,
          name: 'New Member',
          phone: '+91 99000 00003',
          source: 'Walk-in',
          trialEndsLabel: 'In 5 days',
          followUpLabel: 'Today, 4 PM',
          status: 'active',
          assignedTrainerName: 'Demo Trainer',
        },
        {
          gymId: tenant.id,
          name: 'Karan Mehta',
          phone: '+91 97654 32109',
          source: 'Instagram',
          trialEndsLabel: 'In 2 days',
          followUpLabel: 'Tomorrow',
          status: 'expiring',
          assignedTrainerName: 'Demo Trainer',
        },
      ],
    });
    await prisma.crmLead.createMany({
      data: [
        {
          gymId: tenant.id,
          name: 'Karan Mehta',
          phone: '+91 99887 76655',
          source: 'Instagram',
          stage: 'follow-up',
          nextAction: 'Call — trial offer',
          referredBy: 'Ad campaign Q4',
          assignedUserId: trainerUser?.id,
        },
        {
          gymId: tenant.id,
          name: 'Divya Nair',
          phone: '+91 91234 56780',
          source: 'Walk-in',
          stage: 'new',
          nextAction: 'Demo scheduled Fri',
          referredBy: null,
          assignedUserId: null,
        },
        {
          gymId: tenant.id,
          name: 'Mohit Jain',
          phone: '+91 90000 11122',
          source: 'Referral',
          stage: 'converted',
          nextAction: 'Welcome pack sent',
          referredBy: 'member@gym.test (Rahul)',
          assignedUserId: trainerUser?.id,
        },
      ],
    });
    await prisma.gymEquipment.createMany({
      data: [
        { gymId: tenant.id, name: 'Treadmill #3', branch: 'Main branch', status: 'service-due', nextServiceLabel: 'Next week' },
        { gymId: tenant.id, name: 'Squat rack A', branch: 'Main branch', status: 'ok', nextServiceLabel: 'Jan 2026' },
        { gymId: tenant.id, name: 'Row erg', branch: 'Main branch', status: 'ok', nextServiceLabel: 'Mar 2026' },
      ],
    });
    await prisma.gymAutomationRule.createMany({
      data: [
        { gymId: tenant.id, name: 'Trial expiry reminder', channel: 'WhatsApp + email', enabled: true },
        { gymId: tenant.id, name: 'Membership renewal nudge', channel: 'Push', enabled: true },
        { gymId: tenant.id, name: 'Birthday offer', channel: 'SMS', enabled: false },
      ],
    });
    await prisma.gymReportExport.createMany({
      data: [
        { gymId: tenant.id, name: 'Attendance (daily)', format: 'CSV', lastRunLabel: 'Today 06:00' },
        { gymId: tenant.id, name: 'Revenue summary', format: 'PDF', lastRunLabel: 'Yesterday' },
        { gymId: tenant.id, name: 'Trainer payroll', format: 'CSV', lastRunLabel: '1 Nov 2025' },
      ],
    });
    await prisma.trainerPayrollRun.createMany({
      data: [
        {
          gymId: tenant.id,
          trainerName: 'Demo Trainer',
          baseInr: 45000,
          commissionInr: 8200,
          period: 'Oct 2025',
          status: 'paid',
        },
      ],
    });
  }
  if (trainerUser) {
  const blockCount = await prisma.trainerScheduleBlock.count({
  where: { gymId: tenant.id, trainerUserId: trainerUser.id },
  });
  if (blockCount === 0) {
  await prisma.trainerScheduleBlock.createMany({
  data: [
  {
  gymId: tenant.id,
  trainerUserId: trainerUser.id,
  timeLabel: '9:30 AM',
  title: 'Floor coaching',
  blockType: 'floor',
  durationMin: 60,
  sortOrder: 1,
  },
  {
  gymId: tenant.id,
  trainerUserId: trainerUser.id,
  timeLabel: '11:00 AM',
  title: 'Open slot — walk-ins',
  blockType: 'floor',
  durationMin: 30,
  sortOrder: 2,
  },
  {
  gymId: tenant.id,
  trainerUserId: trainerUser.id,
  timeLabel: '2:00 PM',
  title: 'Lunch break',
  blockType: 'break',
  sortOrder: 3,
  },
  {
  gymId: tenant.id,
  trainerUserId: trainerUser.id,
  timeLabel: '5:30 PM',
  title: 'Group strength',
  blockType: 'group',
  durationMin: 60,
  sortOrder: 4,
  },
  ],
  });
  }
    await prisma.trainerProfile.upsert({
      where: { gymId_userId: { gymId: tenant.id, userId: trainerUser.id } },
      create: {
        gymId: tenant.id,
        userId: trainerUser.id,
        specialty: 'Strength & conditioning',
        floorStatus: 'on-floor',
        liveStatus: 'available',
        liveDetail: 'Free on the floor',
      },
      update: {
        specialty: 'Strength & conditioning',
        floorStatus: 'on-floor',
      },
    });
  }
  if (memberUser && trainerUser && ownerUser) {
    const notifCount = await prisma.gymNotification.count({
      where: { gymId: tenant.id },
    });
    if (notifCount === 0) {
      await prisma.gymNotification.createMany({
        data: [
          {
            gymId: tenant.id,
            userId: ownerUser.id,
            title: '3 trials expiring',
            body: 'Follow up on demo pipeline today.',
          },
          {
            gymId: tenant.id,
            userId: memberUser.id,
            title: 'Session tonight',
            body: 'Your PT is at 7:00 PM with Demo Trainer.',
          },
          {
            gymId: tenant.id,
            userId: trainerUser.id,
            title: 'Client check-in',
            body: 'Demo Member checked in this morning.',
          },
        ],
      });
      await prisma.trainerMessage.create({
        data: {
          gymId: tenant.id,
          memberUserId: memberUser.id,
          trainerUserId: trainerUser.id,
          senderRole: 'trainer',
          body: 'Welcome back — focus on tempo squats today.',
        },
      });
    }
  }

  for (const w of SEED_WORKOUT_TEMPLATES) {
    await prisma.workoutTemplate.upsert({
      where: {
        gymId_builtInKey: { gymId: tenant.id, builtInKey: w.builtInKey },
      },
      create: {
        gymId: tenant.id,
        builtInKey: w.builtInKey,
        name: w.name,
        goal: w.goal,
        daysPerWeek: w.daysPerWeek,
        exercises: w.exercises,
      },
      update: {
        name: w.name,
        goal: w.goal,
        daysPerWeek: w.daysPerWeek,
        exercises: w.exercises,
      },
    });
  }

  for (const ex of GLOBAL_EXERCISE_SEEDS) {
    const existing = await prisma.exercise.findFirst({
      where: { gymId: null, slug: ex.slug },
    });
    if (!existing) {
      await prisma.exercise.create({
        data: {
          gymId: null,
          name: ex.name,
          slug: ex.slug,
          description: ex.description,
          category: ex.category,
          primaryMuscle: ex.primaryMuscle,
          secondaryMuscles: ex.secondaryMuscles,
          equipment: ex.equipment,
          instructions: ex.instructions,
          isCustom: false,
        },
      });
    } else {
      await prisma.exercise.update({
        where: { id: existing.id },
        data: {
          name: ex.name,
          description: ex.description,
          category: ex.category,
          primaryMuscle: ex.primaryMuscle,
          secondaryMuscles: ex.secondaryMuscles,
          equipment: ex.equipment,
          instructions: ex.instructions,
        },
      });
    }
  }

  const foodCatalogCount = await seedGlobalFoodCatalog(prisma);
  console.log(`Seeded ${foodCatalogCount} global food catalog items.`);

  for (const d of SEED_DIET_TEMPLATES) {
    await prisma.dietTemplate.upsert({
      where: {
        gymId_builtInKey: { gymId: tenant.id, builtInKey: d.builtInKey },
      },
      create: {
        gymId: tenant.id,
        builtInKey: d.builtInKey,
        name: d.name,
        goal: d.goal,
        dailyCalories: d.dailyCalories,
        proteinG: d.proteinG,
        carbsG: d.carbsG,
        fatG: d.fatG,
        meals: d.meals,
      },
      update: {
        name: d.name,
        goal: d.goal,
        dailyCalories: d.dailyCalories,
        proteinG: d.proteinG,
        carbsG: d.carbsG,
        fatG: d.fatG,
        meals: d.meals,
      },
    });
  }

  const ownerInviteToken =
    process.env.SEED_OWNER_INVITE_TOKEN ?? randomBytes(32).toString('base64url');
  const memberInviteToken =
    process.env.SEED_MEMBER_INVITE_TOKEN ?? randomBytes(32).toString('base64url');
  const inviteTtl = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const hash = (token: string) =>
    createHash('sha256').update(token).digest('hex');

  await prisma.registrationInvite.createMany({
    data: [
      {
        kind: 'gym_owner',
        tokenHash: hash(ownerInviteToken),
        expiresAt: inviteTtl,
      },
      {
        kind: 'gym_member',
        tokenHash: hash(memberInviteToken),
        gymId: tenant.id,
        expiresAt: inviteTtl,
      },
    ],
  });

  console.log('Seed OK — demo-gym test accounts (password: FitCore@123):');
  for (const a of accounts) {
    console.log(`  ${a.role.padEnd(10)} ${a.email}`);
  }
  if (process.env.NODE_ENV !== 'production') {
    console.log('  Registration invites (local signup only):');
    console.log(`    owner inviteToken: use on /signup owner tab`);
    console.log(`    member inviteToken: use with gym code demo-gym`);
    console.log(
      '    Pin tokens: SEED_OWNER_INVITE_TOKEN / SEED_MEMBER_INVITE_TOKEN in env before seed.',
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());