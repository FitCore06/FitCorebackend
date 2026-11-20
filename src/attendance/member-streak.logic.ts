const STREAK_TZ = 'Asia/Kolkata';

export const MISSED_TRAINING_DAYS_TO_BREAK = 3;

const SHORT_TO_DAY_ID: Record<string, string> = {
  Sun: 'sun',
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
};

export function dayKeyInTz(d: Date, timeZone = STREAK_TZ): string {
  return d.toLocaleDateString('en-CA', { timeZone });
}

export function weekDayIdForDayKey(dayKey: string): string {
  const [y, m, day] = dayKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
  const short = new Intl.DateTimeFormat('en-US', {
    timeZone: STREAK_TZ,
    weekday: 'short',
  }).format(date);
  return SHORT_TO_DAY_ID[short] ?? 'mon';
}

function addDaysLocal(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

export function restDaysFromWeeklyPlan(
  days: { dayId: string; restDay: boolean }[],
): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const d of days) {
    map.set(d.dayId, Boolean(d.restDay));
  }
  for (const id of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
    if (!map.has(id)) map.set(id, id === 'sun');
  }
  return map;
}

export function consecutiveMissedTrainingDaysFromToday(
  visitDays: Set<string>,
  restByWeekday: Map<string, boolean>,
  maxDays = 60,
): number {
  let missed = 0;
  let cursor = new Date();
  for (let i = 0; i < maxDays; i++) {
    const key = dayKeyInTz(cursor);
    const wd = weekDayIdForDayKey(key);
    if (restByWeekday.get(wd)) {
      cursor = addDaysLocal(cursor, -1);
      continue;
    }
    if (visitDays.has(key)) return missed;
    missed++;
    cursor = addDaysLocal(cursor, -1);
  }
  return missed;
}

export function computeRestAwareStreakDays(
  visitDays: Set<string>,
  restByWeekday: Map<string, boolean>,
): number {
  const todayKey = dayKeyInTz(new Date());
  const todayWd = weekDayIdForDayKey(todayKey);
  const todayRest = Boolean(restByWeekday.get(todayWd));
  const todayVisit = visitDays.has(todayKey);

  let cursor = new Date();
  if (!todayRest && !todayVisit) {
    cursor = addDaysLocal(cursor, -1);
  }

  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const key = dayKeyInTz(cursor);
    const wd = weekDayIdForDayKey(key);
    if (restByWeekday.get(wd)) {
      cursor = addDaysLocal(cursor, -1);
      continue;
    }
    if (visitDays.has(key)) {
      streak++;
      cursor = addDaysLocal(cursor, -1);
      continue;
    }
    break;
  }
  return streak;
}

export function memberStreakResult(
  visitDays: Set<string>,
  restByWeekday: Map<string, boolean>,
): {
  streakDays: number;
  streakBroken: boolean;
  missedTrainingDays: number;
  breakMessage: string | null;
} {
  const missed = consecutiveMissedTrainingDaysFromToday(visitDays, restByWeekday);
  const streakBroken = missed >= MISSED_TRAINING_DAYS_TO_BREAK;
  const rawStreak = computeRestAwareStreakDays(visitDays, restByWeekday);
  const streakDays = streakBroken ? 0 : rawStreak;

  let breakMessage: string | null = null;
  if (streakBroken) {
    breakMessage =
      missed >= 4
        ? 'Streak reset — you skipped 4+ training days without check-in. Rest days in your plan do not count.'
        : 'Streak broken — 3 training days in a row without gym (rest days in your plan are excluded). Check in today to start a new streak.';
  }

  return { streakDays, streakBroken, missedTrainingDays: missed, breakMessage };
}