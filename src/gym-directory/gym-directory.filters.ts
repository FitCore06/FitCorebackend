import type { Prisma } from '@prisma/client';

export type DirectorySearchQuery = {
  state?: string;
  city?: string;
  q?: string;
};

export function buildListedGymWhere(
  query: DirectorySearchQuery,
): Prisma.GymDirectoryProfileWhereInput {
  const where: Prisma.GymDirectoryProfileWhereInput = {
    isListed: true,
    tenant: { status: 'active', directorySubscriptionActive: true },
  };

  const state = query.state?.trim();
  if (state) {
    where.state = { equals: state, mode: 'insensitive' };
  }

  const city = query.city?.trim();
  if (city) {
    where.city = { equals: city, mode: 'insensitive' };
  }

  const q = query.q?.trim();
  if (q) {
    where.OR = [
      { tenant: { name: { contains: q, mode: 'insensitive' } } },
      { city: { contains: q, mode: 'insensitive' } },
      { area: { contains: q, mode: 'insensitive' } },
      { addressLine: { contains: q, mode: 'insensitive' } },
    ];
  }

  return where;
}