import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, type AuthUserPayload } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async listThread(
    user: AuthUserPayload,
    opts: { memberEmail?: string; trainerUserId?: string },
  ) {
    const gymId = user.roles[0]?.gymId;
    if (!gymId) return [];

    let memberUserId: string | undefined;
    let trainerUserId: string | undefined;

    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    const trainerRole = user.roles.find((r) => r.role === Role.TRAINER);

    if (memberRole) {
      memberUserId = user.id;
      if (opts.trainerUserId) trainerUserId = opts.trainerUserId;
      else {
        const assignment = await this.prisma.memberTrainerAssignment.findFirst({
          where: { gymId, memberUserId: user.id, active: true },
        });
        trainerUserId = assignment?.trainerUserId;
      }
    } else if (trainerRole) {
      trainerUserId = user.id;
      if (opts.memberEmail) {
        const member = await this.prisma.user.findUnique({
          where: { email: opts.memberEmail.toLowerCase() },
        });
        memberUserId = member?.id;
      }
    } else {
      throw new ForbiddenException('Member or trainer only');
    }

    if (!memberUserId || !trainerUserId) return [];

    const rows = await this.prisma.trainerMessage.findMany({
      where: { gymId, memberUserId, trainerUserId },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      from: r.senderRole as 'member' | 'trainer',
      text: r.body,
      at: r.createdAt.toISOString(),
    }));
  }

  async send(
    user: AuthUserPayload,
    body: { text: string; memberEmail?: string; trainerUserId?: string },
  ) {
    const trimmed = body.text?.trim();
    if (!trimmed) throw new BadRequestException('text required');
    const gymId = user.roles[0]?.gymId;
    if (!gymId) throw new ForbiddenException();

    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    const trainerRole = user.roles.find((r) => r.role === Role.TRAINER);

    let memberUserId: string;
    let trainerUserId: string;
    let senderRole: string;

    if (memberRole) {
      senderRole = 'member';
      memberUserId = user.id;
      if (body.trainerUserId) trainerUserId = body.trainerUserId;
      else {
        const assignment = await this.prisma.memberTrainerAssignment.findFirst({
          where: { gymId, memberUserId: user.id, active: true },
        });
        if (!assignment) throw new NotFoundException('No trainer assigned');
        trainerUserId = assignment.trainerUserId;
      }
    } else if (trainerRole) {
      senderRole = 'trainer';
      trainerUserId = user.id;
      if (!body.memberEmail) throw new BadRequestException('memberEmail required');
      const member = await this.prisma.user.findUnique({
        where: { email: body.memberEmail.toLowerCase() },
      });
      if (!member) throw new NotFoundException('Member not found');
      memberUserId = member.id;
    } else {
      throw new ForbiddenException('Member or trainer only');
    }

    const row = await this.prisma.trainerMessage.create({
      data: {
        gymId,
        memberUserId,
        trainerUserId,
        senderRole,
        body: trimmed,
      },
    });
    return {
      id: row.id,
      from: senderRole as 'member' | 'trainer',
      text: row.body,
      at: row.createdAt.toISOString(),
    };
  }
}