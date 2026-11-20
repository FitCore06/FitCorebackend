import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type { RegistrationInvite } from '@prisma/client';

export const REGISTRATION_INVITE_KIND = {
  GYM_OWNER: 'gym_owner',
  GYM_MEMBER: 'gym_member',
} as const;

export type RegistrationInviteKind =
  (typeof REGISTRATION_INVITE_KIND)[keyof typeof REGISTRATION_INVITE_KIND];

const DEFAULT_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const GYM_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const OWNER_INVITE_INVALID_MESSAGE =
  'This owner invite code is invalid, already used, or expired. Use the code FitCore sent you — not your gym name or password.';

const MEMBER_INVITE_INVALID_MESSAGE =
  'This member invite code is invalid, already used, or expired. Ask your gym to generate a new code from Admin → Members.';

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

    try {
      await this.prisma.registrationInvite.create({
        data: {
          kind: input.kind,
          tokenHash,
          gymId: input.gymId ?? null,
          email,
          expiresAt,
        },
      });
    } catch (error) {
      this.rethrowInviteStorageError(error);
    }

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
    gymSlug?: string,
  ): Promise<{ gymId: string }> {
    const trimmed = inviteToken?.trim() ?? '';
    if (!trimmed) {
      throw new ForbiddenException('Gym invite code is required');
    }

    const slugFromInvite = trimmed.toLowerCase();
    const optionalBodySlug = gymSlug?.trim().toLowerCase();
    const inviteIsGymSlug =
      trimmed === trimmed.toLowerCase() &&
      trimmed.length <= 64 &&
      GYM_SLUG_PATTERN.test(slugFromInvite);

    if (inviteIsGymSlug) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug: slugFromInvite },
      });
      if (tenant) {
        if (optionalBodySlug && optionalBodySlug !== slugFromInvite) {
          throw new BadRequestException(
            'Gym invite code does not match the gym id in the request.',
          );
        }
        return { gymId: tenant.id };
      }
      throw new NotFoundException(
        'No gym found for this invite code. Ask the owner for the exact gym code from Settings (Gym URL id).',
      );
    }

    const trimmedSlug = gymSlug?.trim().toLowerCase();
    let expectedGymId: string | undefined;

    if (trimmedSlug) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug: trimmedSlug },
      });
      if (!tenant) {
        throw new NotFoundException('Gym not found for this code');
      }
      expectedGymId = tenant.id;
    } else {
      const tokenHash = this.hashToken(inviteToken.trim());
      let invite: RegistrationInvite | null;
      try {
        invite = await this.prisma.registrationInvite.findUnique({
          where: { tokenHash },
        });
      } catch (error) {
        this.rethrowInviteStorageError(error);
      }
      if (!invite?.gymId) {
        throw this.forbiddenForKind(REGISTRATION_INVITE_KIND.GYM_MEMBER);
      }
      expectedGymId = invite.gymId;
    }

    await this.consumeInvite(
      inviteToken,
      REGISTRATION_INVITE_KIND.GYM_MEMBER,
      registrantEmail,
      expectedGymId,
    );
    return { gymId: expectedGymId };
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

    let invite: RegistrationInvite | null;
    try {
      invite = await this.prisma.registrationInvite.findUnique({
        where: { tokenHash },
      });
    } catch (error) {
      this.rethrowInviteStorageError(error);
    }

    this.assertInviteUsable(invite, kind, email, expectedGymId, now);

    try {
      const updated = await this.prisma.registrationInvite.updateMany({
        where: { id: invite!.id, usedAt: null },
        data: { usedAt: now },
      });
      if (updated.count !== 1) {
        throw this.forbiddenForKind(kind);
      }
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      this.rethrowInviteStorageError(error);
    }
  }

  private assertInviteUsable(
    invite: RegistrationInvite | null,
    kind: RegistrationInviteKind,
    email: string,
    expectedGymId: string | null,
    now: Date,
  ) {
    if (!invite || invite.kind !== kind) {
      throw this.forbiddenForKind(kind);
    }
    if (invite.usedAt) {
      throw this.forbiddenForKind(kind);
    }
    if (invite.expiresAt < now) {
      throw this.forbiddenForKind(kind);
    }
    if (invite.email && invite.email !== email) {
      throw this.forbiddenForKind(kind);
    }
    if (kind === REGISTRATION_INVITE_KIND.GYM_MEMBER) {
      if (!invite.gymId || invite.gymId !== expectedGymId) {
        throw new ForbiddenException(MEMBER_INVITE_INVALID_MESSAGE);
      }
    }
  }

  private forbiddenForKind(kind: RegistrationInviteKind) {
    return new ForbiddenException(
      kind === REGISTRATION_INVITE_KIND.GYM_OWNER
        ? OWNER_INVITE_INVALID_MESSAGE
        : MEMBER_INVITE_INVALID_MESSAGE,
    );
  }

  private rethrowInviteStorageError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2021' || error.code === 'P2022')
    ) {
      throw new ServiceUnavailableException(
        'Registration invites are not configured. Apply database migration registration_invites.',
      );
    }
    throw error;
  }
}