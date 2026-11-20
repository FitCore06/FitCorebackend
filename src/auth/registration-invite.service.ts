import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

export const REGISTRATION_INVITE_KIND = {
  GYM_OWNER: 'gym_owner',
  GYM_MEMBER: 'gym_member',
} as const;

export type RegistrationInviteKind =
  (typeof REGISTRATION_INVITE_KIND)[keyof typeof REGISTRATION_INVITE_KIND];

const DEFAULT_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class RegistrationInviteService {
  constructor(private readonly prisma: PrismaService) {}

  hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  async issueInvite(input: {
    kind: RegistrationInviteKind;
    gymId?: string | null;
    email?: string | null;
    ttlMs?: number;
  }) {
    if (input.kind === REGISTRATION_INVITE_KIND.GYM_MEMBER && !input.gymId) {
      throw new BadRequestException('Member invites require a gym');
    }
    if (input.kind === REGISTRATION_INVITE_KIND.GYM_OWNER && input.gymId) {
      throw new BadRequestException('Owner invites cannot be bound to an existing gym');
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + (input.ttlMs ?? DEFAULT_INVITE_TTL_MS));
    const email = input.email?.trim().toLowerCase() || null;

    await this.prisma.registrationInvite.create({
      data: {
        kind: input.kind,
        tokenHash,
        gymId: input.gymId ?? null,
        email,
        expiresAt,
      },
    });

    return { inviteToken: token, expiresAt };
  }

  async consumeOwnerInvite(inviteToken: string, registrantEmail: string) {
    await this.consumeInvite(
      inviteToken,
      REGISTRATION_INVITE_KIND.GYM_OWNER,
      registrantEmail,
      null,
    );
  }

  async consumeMemberInvite(
    inviteToken: string,
    registrantEmail: string,
    gymSlug: string,
  ): Promise<{ gymId: string }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: gymSlug.toLowerCase() },
    });
    if (!tenant) {
      throw new NotFoundException('Gym not found for this code');
    }
    await this.consumeInvite(
      inviteToken,
      REGISTRATION_INVITE_KIND.GYM_MEMBER,
      registrantEmail,
      tenant.id,
    );
    return { gymId: tenant.id };
  }

  private async consumeInvite(
    inviteToken: string,
    kind: RegistrationInviteKind,
    registrantEmail: string,
    expectedGymId: string | null,
  ) {
    const trimmed = inviteToken?.trim();
    if (!trimmed) {
      throw new ForbiddenException('A valid registration invite is required');
    }

    const tokenHash = this.hashToken(trimmed);
    const email = registrantEmail.trim().toLowerCase();
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const invite = await tx.registrationInvite.findUnique({
        where: { tokenHash },
      });
      if (!invite || invite.kind !== kind) {
        throw new ForbiddenException('Registration invite is invalid or expired');
      }
      if (invite.usedAt) {
        throw new ForbiddenException('Registration invite is invalid or expired');
      }
      if (invite.expiresAt < now) {
        throw new ForbiddenException('Registration invite is invalid or expired');
      }
      if (invite.email && invite.email !== email) {
        throw new ForbiddenException('Registration invite is invalid or expired');
      }
      if (kind === REGISTRATION_INVITE_KIND.GYM_MEMBER) {
        if (!invite.gymId || invite.gymId !== expectedGymId) {
          throw new ForbiddenException('Registration invite is not valid for this gym');
        }
      }

      const updated = await tx.registrationInvite.updateMany({
        where: { id: invite.id, usedAt: null },
        data: { usedAt: now },
      });
      if (updated.count !== 1) {
        throw new ForbiddenException('Registration invite is invalid or expired');
      }
    });
  }
}