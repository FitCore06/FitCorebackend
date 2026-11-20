import { createHash, randomBytes } from 'node:crypto';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import {
  REGISTRATION_INVITE_KIND,
  type RegistrationInviteKind,
} from '../src/auth/registration-invite.service.js';

export function hashRegistrationInviteToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function createRegistrationInvite(
  prisma: PrismaService,
  input: {
    kind: RegistrationInviteKind;
    gymId?: string | null;
    email?: string | null;
    ttlMs?: number;
  },
) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? 60 * 60 * 1000));
  await prisma.registrationInvite.create({
    data: {
      kind: input.kind,
      tokenHash: hashRegistrationInviteToken(token),
      gymId: input.gymId ?? null,
      email: input.email?.toLowerCase() ?? null,
      expiresAt,
    },
  });
  return token;
}