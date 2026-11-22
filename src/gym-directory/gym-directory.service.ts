import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, type AuthUserPayload } from '../auth/auth.types.js';
import { gymRole } from '../auth/guards/roles.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ModerateDirectoryReviewDto } from './dto/moderate-review.dto.js';
import type { SubmitDirectoryReviewDto } from './dto/submit-directory-review.dto.js';
import type { UpsertDirectoryProfileDto } from './dto/upsert-directory-profile.dto.js';
import { buildListedGymWhere } from './gym-directory.filters.js';

function reviewStats(rows: { rating: number }[]) {
  if (rows.length === 0) return { averageRating: null as number | null, reviewCount: 0 };
  const sum = rows.reduce((acc, row) => acc + row.rating, 0);
  return {
    averageRating: Math.round((sum / rows.length) * 10) / 10,
    reviewCount: rows.length,
  };
}

@Injectable()
export class GymDirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listStates() {
    const rows = await this.prisma.gymDirectoryProfile.findMany({
      where: { isListed: true, tenant: { status: 'active' }, state: { not: '' } },
      select: { state: true },
      distinct: ['state'],
      orderBy: { state: 'asc' },
    });
    return rows.map((r) => r.state);
  }

  async listCities(state?: string) {
    const where = buildListedGymWhere({ state });
    const rows = await this.prisma.gymDirectoryProfile.findMany({
      where: { ...where, city: { not: '' } },
      select: { city: true },
      distinct: ['city'],
      orderBy: { city: 'asc' },
    });
    return rows.map((r) => r.city);
  }

  async listGyms(query: { state?: string; city?: string; q?: string }) {
    const where = buildListedGymWhere(query);
    const profiles = await this.prisma.gymDirectoryProfile.findMany({
      where,
      include: {
        tenant: { select: { name: true, slug: true } },
      },
      orderBy: [{ planTier: 'desc' }, { updatedAt: 'desc' }],
    });

    const gymIds = profiles.map((p) => p.gymId);
    const reviews = gymIds.length
      ? await this.prisma.gymDirectoryReview.findMany({
          where: { gymId: { in: gymIds }, status: 'published' },
          select: { gymId: true, rating: true },
        })
      : [];

    const byGym = new Map<string, { rating: number }[]>();
    for (const row of reviews) {
      const list = byGym.get(row.gymId) ?? [];
      list.push({ rating: row.rating });
      byGym.set(row.gymId, list);
    }

    return profiles.map((p) => {
      const stats = reviewStats(byGym.get(p.gymId) ?? []);
      return {
        slug: p.tenant.slug,
        gymName: p.tenant.name,
        state: p.state,
        city: p.city,
        area: p.area,
        addressLine: p.addressLine,
        phone: p.phone,
        planTier: p.planTier,
        averageRating: stats.averageRating,
        reviewCount: stats.reviewCount,
      };
    });
  }

  async gymBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: slug.toLowerCase() },
      include: { directoryProfile: true },
    });
    if (
      !tenant?.directoryProfile?.isListed ||
      tenant.status !== 'active' ||
      !tenant.directorySubscriptionActive
    ) {
      throw new NotFoundException('Gym not found in directory');
    }

    const profile = tenant.directoryProfile;
    const reviews = await this.prisma.gymDirectoryReview.findMany({
      where: { gymId: tenant.id, status: 'published' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        authorName: true,
        rating: true,
        comment: true,
        createdAt: true,
      },
    });

    const stats = reviewStats(reviews);

    return {
      slug: tenant.slug,
      gymName: tenant.name,
      state: profile.state,
      city: profile.city,
      area: profile.area,
      addressLine: profile.addressLine,
      phone: profile.phone,
      contactEmail: profile.contactEmail,
      description: profile.description,
      planTier: profile.planTier,
      averageRating: stats.averageRating,
      reviewCount: stats.reviewCount,
      reviews: reviews.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async submitReview(slug: string, dto: SubmitDirectoryReviewDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: slug.toLowerCase() },
      include: { directoryProfile: true },
    });
    if (
      !tenant?.directoryProfile?.isListed ||
      !tenant.directorySubscriptionActive ||
      tenant.status !== 'active'
    ) {
      throw new NotFoundException('Gym not found in directory');
    }

    const review = await this.prisma.gymDirectoryReview.create({
      data: {
        gymId: tenant.id,
        authorName: dto.authorName.trim(),
        rating: dto.rating,
        comment: dto.comment.trim(),
        status: 'pending',
      },
      select: { id: true, status: true },
    });

    return { id: review.id, status: review.status, message: 'Review submitted for moderation.' };
  }

  private async tenantForAdmin(user: AuthUserPayload, gymSlug: string) {
    const admin = gymRole(user, Role.GYM_ADMIN, gymSlug);
    if (!admin) throw new ForbiddenException('Gym admin only');
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: gymSlug.toLowerCase() },
    });
    if (!tenant) throw new NotFoundException('Gym not found');
    return tenant;
  }

  async getOwnerProfile(user: AuthUserPayload, gymSlug: string) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const profile = await this.prisma.gymDirectoryProfile.findUnique({
      where: { gymId: tenant.id },
    });

    return {
      gymName: tenant.name,
      slug: tenant.slug,
      directorySubscriptionActive: tenant.directorySubscriptionActive,
      canListPublicly: tenant.directorySubscriptionActive && tenant.status === 'active',
      profile: profile
        ? {
            isListed: profile.isListed,
            planTier: profile.planTier as 'basic' | 'featured',
            state: profile.state,
            city: profile.city,
            area: profile.area,
            addressLine: profile.addressLine,
            phone: profile.phone,
            contactEmail: profile.contactEmail,
            description: profile.description,
          }
        : null,
    };
  }

  async upsertOwnerProfile(user: AuthUserPayload, gymSlug: string, dto: UpsertDirectoryProfileDto) {
    const tenant = await this.tenantForAdmin(user, gymSlug);

    if (dto.isListed) {
      if (!tenant.directorySubscriptionActive) {
        throw new BadRequestException(
          'Activate Athra directory subscription before listing publicly.',
        );
      }
      if (!dto.state.trim() || !dto.city.trim() || !dto.addressLine.trim()) {
        throw new BadRequestException('State, city, and address are required to list your gym.');
      }
    }

    const profile = await this.prisma.gymDirectoryProfile.upsert({
      where: { gymId: tenant.id },
      create: {
        gymId: tenant.id,
        isListed: dto.isListed,
        planTier: dto.planTier,
        state: dto.state.trim(),
        city: dto.city.trim(),
        area: dto.area.trim(),
        addressLine: dto.addressLine.trim(),
        phone: dto.phone?.trim() || null,
        contactEmail: dto.contactEmail?.trim() || null,
        description: dto.description?.trim() || null,
      },
      update: {
        isListed: dto.isListed,
        planTier: dto.planTier,
        state: dto.state.trim(),
        city: dto.city.trim(),
        area: dto.area.trim(),
        addressLine: dto.addressLine.trim(),
        phone: dto.phone?.trim() || null,
        contactEmail: dto.contactEmail?.trim() || null,
        description: dto.description?.trim() || null,
      },
    });

    return {
      isListed: profile.isListed,
      planTier: profile.planTier,
      state: profile.state,
      city: profile.city,
      area: profile.area,
      addressLine: profile.addressLine,
      phone: profile.phone,
      contactEmail: profile.contactEmail,
      description: profile.description,
    };
  }

  async listOwnerReviews(user: AuthUserPayload, gymSlug: string) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const rows = await this.prisma.gymDirectoryReview.findMany({
      where: { gymId: tenant.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      authorName: r.authorName,
      rating: r.rating,
      comment: r.comment,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async moderateReview(
    user: AuthUserPayload,
    gymSlug: string,
    reviewId: string,
    dto: ModerateDirectoryReviewDto,
  ) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    const existing = await this.prisma.gymDirectoryReview.findFirst({
      where: { id: reviewId, gymId: tenant.id },
    });
    if (!existing) throw new NotFoundException('Review not found');

    const updated = await this.prisma.gymDirectoryReview.update({
      where: { id: reviewId },
      data: { status: dto.status },
      select: { id: true, status: true },
    });

    return updated;
  }

  /** Placeholder until Razorpay directory SKU is wired — marks tenant eligible to list. */
  async activateDirectorySubscription(user: AuthUserPayload, gymSlug: string) {
    const tenant = await this.tenantForAdmin(user, gymSlug);
    await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: { directorySubscriptionActive: true },
    });
    return {
      directorySubscriptionActive: true,
      message: 'Directory subscription active. You can now publish your gym listing.',
    };
  }
}