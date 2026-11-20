import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role, type AuthUserPayload } from '../src/auth/auth.types.js';
import { NutritionHistoryService } from '../src/nutrition/nutrition-history.service.js';

const memberA: AuthUserPayload = {
  id: 'member-a-id',
  email: 'member-a@gym.test',
  name: 'Member A',
  roles: [
    { gymId: 'gym-a-id', gymSlug: 'gym-a', gymName: 'Gym A', role: Role.MEMBER },
  ],
};

describe('Nutrition history pagination', () => {
  const mockPrisma = {
    foodIntakeEntry: {
      findMany: vi.fn(),
    },
  };

  let history: NutritionHistoryService;

  beforeEach(() => {
    vi.clearAllMocks();
    history = new NutritionHistoryService(mockPrisma as never);
  });

  it('returns nextCursor when more than one page of rows exist', async () => {
    const rows = Array.from({ length: 31 }, (_, i) => ({
      id: `entry-${i}`,
      logDate: '2026-11-20',
    }));
    mockPrisma.foodIntakeEntry.findMany.mockResolvedValue(rows);

    const page = await history.history(memberA, '2026-11-01', '2026-11-30');
    expect(page.items).toHaveLength(30);
    expect(page.nextCursor).toBe('entry-29');
  });

  it('passes cursor as id lt for subsequent pages', async () => {
    mockPrisma.foodIntakeEntry.findMany.mockResolvedValue([
      { id: 'entry-5', logDate: '2026-11-18' },
    ]);

    await history.history(memberA, '2026-11-01', '2026-11-30', 'entry-10');

    expect(mockPrisma.foodIntakeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { lt: 'entry-10' },
        }),
        take: 31,
      }),
    );
  });

  it('returns null nextCursor on final page', async () => {
    mockPrisma.foodIntakeEntry.findMany.mockResolvedValue([
      { id: 'entry-1', logDate: '2026-11-20' },
    ]);
    const page = await history.history(memberA, '2026-11-01', '2026-11-30');
    expect(page.nextCursor).toBeNull();
  });
});