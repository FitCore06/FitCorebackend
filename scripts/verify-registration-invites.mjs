#!/usr/bin/env node
/**
 * QA-only: registration_invites create, consume, reuse, expiry.
 * Requires DATABASE_URL targeting fitcore_qa_* and migrated schema.
 */
import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL ?? '';
const dbName = (() => {
  try {
    return new URL(databaseUrl).pathname.slice(1).split('?')[0];
  } catch {
    return '';
  }
})();

if (!dbName.startsWith('fitcore_qa_')) {
  console.error('Refused: DATABASE_URL must target fitcore_qa_*');
  process.exit(2);
}

const prisma = new PrismaClient();
const hash = (t) => createHash('sha256').update(t).digest('hex');

async function main() {
  const ownerToken = randomBytes(32).toString('base64url');
  const memberToken = randomBytes(32).toString('base64url');
  const expiredToken = randomBytes(32).toString('base64url');
  const tenant = await prisma.tenant.create({
    data: { name: 'QA Invite Gym', slug: `qa-invite-${Date.now()}` },
  });
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const expiredAt = new Date(Date.now() - 1000);
  await prisma.registrationInvite.createMany({
    data: [
      { kind: 'gym_owner', tokenHash: hash(ownerToken), expiresAt },
      {
        kind: 'gym_member',
        tokenHash: hash(memberToken),
        gymId: tenant.id,
        expiresAt,
      },
      {
        kind: 'gym_owner',
        tokenHash: hash(expiredToken),
        expiresAt: expiredAt,
      },
    ],
  });

  const markUsed = async (token) => {
    const updated = await prisma.registrationInvite.updateMany({
      where: { tokenHash: hash(token), usedAt: null },
      data: { usedAt: new Date() },
    });
    return updated.count === 1;
  };

  const checks = {
    dbName,
    ownerConsumeFirst: await markUsed(ownerToken),
    ownerConsumeReuse: !(await markUsed(ownerToken)),
    memberConsumeFirst: await markUsed(memberToken),
    expiredNotConsumed: await prisma.registrationInvite.findFirst({
      where: { tokenHash: hash(expiredToken) },
      select: { usedAt: true, expiresAt: true },
    }),
  };

  await prisma.registrationInvite.deleteMany({
    where: { tokenHash: { in: [hash(ownerToken), hash(memberToken), hash(expiredToken)] } },
  });
  await prisma.tenant.delete({ where: { id: tenant.id } });

  const pass =
    checks.ownerConsumeFirst &&
    checks.ownerConsumeReuse &&
    checks.memberConsumeFirst &&
    checks.expiredNotConsumed?.usedAt === null;

  console.log(JSON.stringify({ pass, checks }, null, 2));
  process.exit(pass ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());