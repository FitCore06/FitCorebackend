#!/usr/bin/env node
/**
 * Create a one-time gym_member registration invite for a gym slug (DATABASE_URL).
 * Prints plaintext inviteToken once.
 */
import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const hash = (t) => createHash('sha256').update(t).digest('hex');

async function main() {
  const gymSlug = process.argv[2]?.trim().toLowerCase();
  const email = process.argv[3]?.trim().toLowerCase() || null;
  if (!gymSlug) {
    console.error('Usage: node scripts/issue-member-invite.mjs <gym-slug> [email]');
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: gymSlug } });
  if (!tenant) {
    console.error(`No gym found for slug: ${gymSlug}`);
    process.exit(1);
  }

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.registrationInvite.create({
    data: {
      kind: 'gym_member',
      tokenHash: hash(token),
      gymId: tenant.id,
      email,
      expiresAt,
    },
  });

  console.log(
    JSON.stringify(
      {
        kind: 'gym_member',
        gymSlug,
        gymId: tenant.id,
        inviteToken: token,
        expiresAt: expiresAt.toISOString(),
        emailBound: email,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());