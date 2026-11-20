import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, type AuthUserPayload } from '../auth/auth.types.js';
import { gymRole } from '../auth/guards/roles.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateMemberIssueDto } from './dto/create-member-issue.dto.js';
import type { CreateTrainerFeedbackDto } from './dto/create-trainer-feedback.dto.js';
import type {
  MemberIssueDto,
  MemberIssueStatus,
  TrainerFeedbackDto,
  TrainerRatingAverageDto,
} from './feedback.types.js';

const feedbackInclude = { member: true, trainer: true };
const issueInclude = { member: true };

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  private toFeedbackDto(
    row: Awaited<ReturnType<typeof this.loadFeedback>>,
  ): TrainerFeedbackDto {
    if (!row) throw new NotFoundException('Feedback not found');
    return {
      id: row.id,
      memberEmail: row.member.email,
      memberName: row.member.name,
      trainerId: row.trainerUserId,
      trainerName: row.trainer.name,
      rating: row.rating,
      feedback: row.feedbackText,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toIssueDto(
    row: Awaited<ReturnType<typeof this.loadIssue>>,
  ): MemberIssueDto {
    if (!row) throw new NotFoundException('Issue not found');
    return {
      id: row.id,
      memberEmail: row.member.email,
      memberName: row.member.name,
      category: row.category as MemberIssueDto['category'],
      subject: row.subject,
      description: row.description,
      equipmentName: row.equipmentName ?? undefined,
      status: row.status as MemberIssueStatus,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async loadFeedback(id: string) {
    return this.prisma.trainerFeedback.findUnique({
      where: { id },
      include: feedbackInclude,
    });
  }

  private async loadIssue(id: string) {
    return this.prisma.memberIssue.findUnique({
      where: { id },
      include: issueInclude,
    });
  }

  async listMyFeedback(user: AuthUserPayload): Promise<TrainerFeedbackDto[]> {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) return [];

    const rows = await this.prisma.trainerFeedback.findMany({
      where: { gymId: memberRole.gymId, memberUserId: user.id },
      include: feedbackInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toFeedbackDto(r));
  }

  async listGymFeedback(
    user: AuthUserPayload,
    gymSlug: string,
  ): Promise<TrainerFeedbackDto[]> {
    const admin = gymRole(user, Role.GYM_ADMIN, gymSlug);
    if (!admin) throw new ForbiddenException('Gym admin only');

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: gymSlug.toLowerCase() },
    });
    if (!tenant) throw new NotFoundException('Gym not found');

    const rows = await this.prisma.trainerFeedback.findMany({
      where: { gymId: tenant.id },
      include: feedbackInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toFeedbackDto(r));
  }

  async trainerAverages(
    user: AuthUserPayload,
    gymSlug: string,
  ): Promise<TrainerRatingAverageDto[]> {
    const admin = gymRole(user, Role.GYM_ADMIN, gymSlug);
    const member = user.roles.find(
      (r) => r.role === Role.MEMBER && r.gymSlug === gymSlug.toLowerCase(),
    );
    if (!admin && !member) {
      throw new ForbiddenException('Gym access required');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: gymSlug.toLowerCase() },
    });
    if (!tenant) throw new NotFoundException('Gym not found');

    const rows = await this.prisma.trainerFeedback.groupBy({
      by: ['trainerUserId'],
      where: { gymId: tenant.id },
      _avg: { rating: true },
      _count: { _all: true },
    });

    const trainers = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.trainerUserId) } },
      select: { id: true, email: true },
    });
    const emailById = new Map(trainers.map((t) => [t.id, t.email]));

    return rows.map((r) => ({
      trainerId: r.trainerUserId,
      trainerEmail: emailById.get(r.trainerUserId) ?? '',
      average:
        Math.round(((r._avg.rating ?? 0) + Number.EPSILON) * 10) / 10,
      count: r._count._all,
    }));
  }

  async submitTrainerFeedback(
    user: AuthUserPayload,
    dto: CreateTrainerFeedbackDto,
  ): Promise<TrainerFeedbackDto> {
    const memberRole =
      user.roles.find(
        (r) =>
          r.role === Role.MEMBER &&
          (!dto.gymSlug || r.gymSlug === dto.gymSlug.toLowerCase()),
      ) ?? user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Members only');

    const assignment = await this.prisma.memberTrainerAssignment.findFirst({
      where: {
        gymId: memberRole.gymId,
        memberUserId: user.id,
        trainerUserId: dto.trainerUserId,
        active: true,
      },
    });
    if (!assignment) {
      throw new BadRequestException('No active trainer assignment for this trainer');
    }

    const row = await this.prisma.trainerFeedback.create({
      data: {
        gymId: memberRole.gymId,
        memberUserId: user.id,
        trainerUserId: dto.trainerUserId,
        rating: dto.rating,
        feedbackText: dto.feedback.trim(),
      },
      include: feedbackInclude,
    });
    return this.toFeedbackDto(row);
  }

  async listMyIssues(user: AuthUserPayload): Promise<MemberIssueDto[]> {
    const memberRole = user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) return [];

    const rows = await this.prisma.memberIssue.findMany({
      where: { gymId: memberRole.gymId, memberUserId: user.id },
      include: issueInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toIssueDto(r));
  }

  async listGymIssues(
    user: AuthUserPayload,
    gymSlug: string,
  ): Promise<MemberIssueDto[]> {
    const admin = gymRole(user, Role.GYM_ADMIN, gymSlug);
    if (!admin) throw new ForbiddenException('Gym admin only');

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: gymSlug.toLowerCase() },
    });
    if (!tenant) throw new NotFoundException('Gym not found');

    const rows = await this.prisma.memberIssue.findMany({
      where: { gymId: tenant.id },
      include: issueInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toIssueDto(r));
  }

  async createIssue(
    user: AuthUserPayload,
    dto: CreateMemberIssueDto,
  ): Promise<MemberIssueDto> {
    const memberRole =
      user.roles.find(
        (r) =>
          r.role === Role.MEMBER &&
          (!dto.gymSlug || r.gymSlug === dto.gymSlug.toLowerCase()),
      ) ?? user.roles.find((r) => r.role === Role.MEMBER);
    if (!memberRole) throw new ForbiddenException('Members only');

    const row = await this.prisma.memberIssue.create({
      data: {
        gymId: memberRole.gymId,
        memberUserId: user.id,
        category: dto.category,
        subject: dto.subject.trim(),
        description: dto.description.trim(),
        equipmentName: dto.equipmentName?.trim() || null,
        status: 'open',
      },
      include: issueInclude,
    });
    return this.toIssueDto(row);
  }

  async updateIssueStatus(
    user: AuthUserPayload,
    id: string,
    status: MemberIssueStatus,
  ): Promise<MemberIssueDto> {
    const issue = await this.loadIssue(id);
    if (!issue) throw new NotFoundException('Issue not found');

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: issue.gymId },
    });
    if (!tenant) throw new NotFoundException('Gym not found');

    const admin = gymRole(user, Role.GYM_ADMIN, tenant.slug);
    if (!admin) throw new ForbiddenException('Gym admin only');

    const row = await this.prisma.memberIssue.update({
      where: { id },
      data: { status },
      include: issueInclude,
    });
    return this.toIssueDto(row);
  }
}