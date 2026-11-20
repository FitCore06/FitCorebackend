#!/usr/bin/env node
/**
 * Create a one-time gym_owner registration invite on the database in DATABASE_URL.
 * Prints the plaintext inviteToken once (store it securely; DB keeps sha256 hash only).
 */
import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const hash = (t) => createHash('sha256').update(t).digest('hex');

async function main() {
  const email = process.argv[2]?.trim().toLowerCase() || null;
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.registrationInvite.create({
    data: {
      kind: 'gym_owner',
      tokenHash: hash(token),
      email,
      expiresAt,
    },
  });

  console.log(
    JSON.stringify(
      {
        kind: 'gym_owner',
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