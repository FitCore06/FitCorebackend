import { afterEach, describe, expect, it, vi } from 'vitest';
import { membershipDayStats } from '../src/common/membership-day-stats.js';

function utcDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

describe('membershipDayStats', () => {
  it('counts inclusive calendar days for a 30-day plan window', () => {
    const stats = membershipDayStats(utcDate('2026-01-01'), utcDate('2026-01-30'));
    expect(stats.totalDays).toBe(30);
  });

  it('counts a single-day membership as 1', () => {
    const stats = membershipDayStats(utcDate('2026-01-01'), utcDate('2026-01-01'));
    expect(stats.totalDays).toBe(1);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('remaining days follow calendar distance (no inclusive bump)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(utcDate('2026-01-21'));
    const stats = membershipDayStats(utcDate('2026-01-01'), utcDate('2026-01-30'));
    expect(stats.remainingDays).toBe(9);
    expect(stats.usedDays).toBe(21);
  });
});