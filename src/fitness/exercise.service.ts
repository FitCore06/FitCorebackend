import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Role, type AuthUserPayload } from '../auth/auth.types.js';
import { gymRole } from '../auth/guards/roles.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateExerciseDto, QueryExerciseDto, UpdateExerciseDto } from './dto/exercise.dto.js';
import { GLOBAL_EXERCISE_SEEDS } from './exercise.seed-data.js';

export type ExerciseResponseDto = {
  id: string;
  gymId: string | null;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: string;
  instructions: string[];
  mediaMimeType: string | null;
  mediaBase64: string | null;
  isCustom: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class ExerciseService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves gym identity STRICTLY from the authenticated user token context.
   * If an optional gymSlug is provided by the client, it must match one of the user's
   * granted tenant roles, or a ForbiddenException is thrown.
   */
  private resolveAuthorizedGym(user: AuthUserPayload, clientGymSlug?: string): { gymId: string; gymSlug: string } {
    if (!user.roles || user.roles.length === 0) {
      throw new ForbiddenException('Authenticated user has no gym roles assigned');
    }

    if (clientGymSlug?.trim()) {
      const normalizedClientSlug = clientGymSlug.trim().toLowerCase();
      const grantedRole = user.roles.find(
        (r) => r.gymSlug?.toLowerCase() === normalizedClientSlug,
      );
      if (!grantedRole) {
        throw new ForbiddenException(
          `Tenant boundary violation: you do not hold an active role in gym '${clientGymSlug}'`,
        );
      }
      return { gymId: grantedRole.gymId, gymSlug: grantedRole.gymSlug };
    }

    const primaryRole = user.roles[0];
    return { gymId: primaryRole.gymId, gymSlug: primaryRole.gymSlug };
  }

  /**
   * Seed global library idempotently if empty
   */
  async ensureGlobalExercisesSeeded(): Promise<void> {
    const count = await this.prisma.exercise.count({
      where: { gymId: null, isCustom: false },
    });
    if (count >= GLOBAL_EXERCISE_SEEDS.length) return;

    for (const seed of GLOBAL_EXERCISE_SEEDS) {
      const existing = await this.prisma.exercise.findFirst({
        where: { gymId: null, slug: seed.slug },
      });
      if (!existing) {
        await this.prisma.exercise.create({
          data: {
            gymId: null,
            name: seed.name,
            slug: seed.slug,
            description: seed.description,
            category: seed.category,
            primaryMuscle: seed.primaryMuscle,
            secondaryMuscles: seed.secondaryMuscles,
            equipment: seed.equipment,
            instructions: seed.instructions,
            isCustom: false,
          },
        });
      }
    }
  }

  /**
   * List exercises combining verified global library with gym custom exercises.
   * Tenant isolation guaranteed: only the authenticated user's authorized gym custom exercises
   * can ever be returned.
   */
  async listExercises(
    user: AuthUserPayload,
    query: QueryExerciseDto,
  ): Promise<ExerciseResponseDto[]> {
    await this.ensureGlobalExercisesSeeded();

    const { gymId: targetGymId } = this.resolveAuthorizedGym(user, query.gymSlug);

    const where: Prisma.ExerciseWhereInput = {};

    if (query.customOnly === 'true') {
      where.gymId = targetGymId;
      where.isCustom = true;
    } else {
      // Global verified items + only this authorized gym's custom items
      where.OR = [{ gymId: null }, { gymId: targetGymId }];
    }

    if (query.q?.trim()) {
      const q = query.q.trim();
      where.name = { contains: q, mode: 'insensitive' };
    }

    if (query.muscle?.trim()) {
      where.primaryMuscle = query.muscle.trim().toLowerCase();
    }

    if (query.equipment?.trim()) {
      where.equipment = query.equipment.trim().toLowerCase();
    }

    if (query.category?.trim()) {
      where.category = query.category.trim().toLowerCase();
    }

    const rows = await this.prisma.exercise.findMany({
      where,
      orderBy: [{ isCustom: 'desc' }, { name: 'asc' }],
    });

    return rows.map((r) => this.mapDto(r));
  }

  /**
   * Fetch single exercise details with strict tenant boundary check.
   */
  async getExercise(
    user: AuthUserPayload,
    id: string,
    gymSlug?: string,
  ): Promise<ExerciseResponseDto> {
    const ex = await this.prisma.exercise.findUnique({
      where: { id },
    });
    if (!ex) throw new NotFoundException('Exercise not found');

    if (ex.gymId !== null) {
      const { gymId: authorizedGymId } = this.resolveAuthorizedGym(user, gymSlug);
      if (authorizedGymId !== ex.gymId) {
        throw new ForbiddenException('Access denied to other gym exercise');
      }
    }

    return this.mapDto(ex);
  }

  /**
   * Create a gym-custom exercise.
   * Enforces gym_id ownership and prevents modification of global exercises.
   */
  async createGymExercise(
    user: AuthUserPayload,
    dto: CreateExerciseDto,
  ): Promise<ExerciseResponseDto> {
    const { gymId: authorizedGymId, gymSlug } = this.resolveAuthorizedGym(user, dto.gymSlug);

    const isAdminOrTrainer = Boolean(
      gymRole(user, Role.GYM_ADMIN, gymSlug) || gymRole(user, Role.TRAINER, gymSlug),
    );
    if (!isAdminOrTrainer) {
      throw new ForbiddenException('Only gym owners and trainers can create exercises');
    }

    const exerciseSlug = dto.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Check duplicate inside this gym
    const existing = await this.prisma.exercise.findFirst({
      where: {
        gymId: authorizedGymId,
        slug: exerciseSlug,
      },
    });
    if (existing) {
      throw new ConflictException('An exercise with this name already exists in your gym');
    }

    const created = await this.prisma.exercise.create({
      data: {
        gymId: authorizedGymId,
        name: dto.name.trim(),
        slug: exerciseSlug,
        description: dto.description?.trim() || null,
        category: dto.category?.trim().toLowerCase() || 'strength',
        primaryMuscle: dto.primaryMuscle.trim().toLowerCase(),
        secondaryMuscles: dto.secondaryMuscles?.map((m) => m.trim().toLowerCase()) || [],
        equipment: dto.equipment?.trim().toLowerCase() || 'other',
        instructions: dto.instructions || [],
        mediaMimeType: dto.mediaMimeType || null,
        mediaBase64: dto.mediaBase64 || null,
        isCustom: true,
        createdById: user.id,
      },
    });

    return this.mapDto(created);
  }

  /**
   * Update a gym-custom exercise.
   * Prevents editing global exercises.
   */
  async updateGymExercise(
    user: AuthUserPayload,
    id: string,
    dto: UpdateExerciseDto,
  ): Promise<ExerciseResponseDto> {
    const ex = await this.prisma.exercise.findUnique({
      where: { id },
    });
    if (!ex) throw new NotFoundException('Exercise not found');

    if (!ex.isCustom || ex.gymId === null) {
      throw new ForbiddenException('Global standard exercises cannot be modified');
    }

    const { gymId: authorizedGymId, gymSlug } = this.resolveAuthorizedGym(user, dto.gymSlug);
    if (authorizedGymId !== ex.gymId) {
      throw new ForbiddenException('Cross-tenant exercise modification denied');
    }

    const isAdminOrTrainer = Boolean(
      gymRole(user, Role.GYM_ADMIN, gymSlug) || gymRole(user, Role.TRAINER, gymSlug),
    );
    if (!isAdminOrTrainer) {
      throw new ForbiddenException('Only gym owners and trainers can update exercises');
    }

    const data: Prisma.ExerciseUpdateInput = {};
    if (dto.name) {
      data.name = dto.name.trim();
      data.slug = dto.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    }
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.category) data.category = dto.category.trim().toLowerCase();
    if (dto.primaryMuscle) data.primaryMuscle = dto.primaryMuscle.trim().toLowerCase();
    if (dto.secondaryMuscles) {
      data.secondaryMuscles = dto.secondaryMuscles.map((m) => m.trim().toLowerCase());
    }
    if (dto.equipment) data.equipment = dto.equipment.trim().toLowerCase();
    if (dto.instructions) data.instructions = dto.instructions;
    if (dto.mediaMimeType !== undefined) data.mediaMimeType = dto.mediaMimeType;
    if (dto.mediaBase64 !== undefined) data.mediaBase64 = dto.mediaBase64;

    const updated = await this.prisma.exercise.update({
      where: { id },
      data,
    });

    return this.mapDto(updated);
  }

  /**
   * Delete a gym-custom exercise.
   * Global exercises cannot be deleted.
   */
  async deleteGymExercise(
    user: AuthUserPayload,
    id: string,
    gymSlug?: string,
  ): Promise<{ success: boolean }> {
    const ex = await this.prisma.exercise.findUnique({
      where: { id },
    });
    if (!ex) throw new NotFoundException('Exercise not found');

    if (!ex.isCustom || ex.gymId === null) {
      throw new ForbiddenException('Global standard exercises cannot be deleted');
    }

    const { gymId: authorizedGymId, gymSlug: authGymSlug } = this.resolveAuthorizedGym(user, gymSlug);
    if (authorizedGymId !== ex.gymId) {
      throw new ForbiddenException('Cross-tenant exercise deletion denied');
    }

    const isAdminOrTrainer = Boolean(
      gymRole(user, Role.GYM_ADMIN, authGymSlug) || gymRole(user, Role.TRAINER, authGymSlug),
    );
    if (!isAdminOrTrainer) {
      throw new ForbiddenException('Only gym owners and trainers can delete exercises');
    }

    await this.prisma.exercise.delete({
      where: { id },
    });

    return { success: true };
  }

  private mapDto(r: {
    id: string;
    gymId: string | null;
    name: string;
    slug: string;
    description: string | null;
    category: string;
    primaryMuscle: string;
    secondaryMuscles: string[];
    equipment: string;
    instructions: string[];
    mediaMimeType: string | null;
    mediaBase64: string | null;
    isCustom: boolean;
    createdById: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ExerciseResponseDto {
    return {
      id: r.id,
      gymId: r.gymId,
      name: r.name,
      slug: r.slug,
      description: r.description,
      category: r.category,
      primaryMuscle: r.primaryMuscle,
      secondaryMuscles: r.secondaryMuscles,
      equipment: r.equipment,
      instructions: r.instructions,
      mediaMimeType: r.mediaMimeType,
      mediaBase64: r.mediaBase64,
      isCustom: r.isCustom,
      createdById: r.createdById,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
