import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TEST_GYM_SLUG = 'demo-gym';

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: TEST_GYM_SLUG },
    create: {
      name: 'Demo Fitness Club',
      slug: TEST_GYM_SLUG,
      status: 'active',
      directorySubscriptionActive: true,
    },
    update: {
      directorySubscriptionActive: true,
      status: 'active',
    },
  });

  await prisma.gymDirectoryProfile.upsert({
    where: { gymId: tenant.id },
    create: {
      gymId: tenant.id,
      isListed: true,
      planTier: 'basic',
      state: 'Delhi',
      city: 'New Delhi',
      area: 'Connaught Place',
      addressLine: '12-A, Inner Circle, Connaught Place',
      phone: '+919900000001',
      contactEmail: 'owner@gym.test',
      description:
        'Demo Fitness Club on Athra — strength floor, group classes, and trainer-led plans.',
    },
    update: {
      isListed: true,
      planTier: 'basic',
      state: 'Delhi',
      city: 'New Delhi',
      area: 'Connaught Place',
      addressLine: '12-A, Inner Circle, Connaught Place',
      phone: '+919900000001',
      contactEmail: 'owner@gym.test',
    },
  });

  const reviewCount = await prisma.gymDirectoryReview.count({
    where: { gymId: tenant.id },
  });
  if (reviewCount === 0) {
    await prisma.gymDirectoryReview.createMany({
      data: [
        {
          gymId: tenant.id,
          authorName: 'Riya Sharma',
          rating: 5,
          comment: 'Clean gym and trainers actually follow up on my plan.',
          status: 'published',
        },
        {
          gymId: tenant.id,
          authorName: 'Arjun K.',
          rating: 4,
          comment: 'Good equipment. Evening slots get busy.',
          status: 'published',
        },
      ],
    });
  }

  console.log('Gym directory seed OK for', TEST_GYM_SLUG);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());