/** Pull a display time from owner “next session” copy (e.g. “Today 11:00 AM”). */
export function timeLabelFromNextSessionNote(note: string | null | undefined): string {
  if (!note?.trim()) return 'Daily roster';
  const ampm = note.match(/\b(\d{1,2}(:\d{2})?\s*(AM|PM))\b/i);
  if (ampm?.[1]) {
    return ampm[1].replace(/\s+/g, ' ').toUpperCase();
  }
  const h24 = note.match(/\b(\d{1,2}:\d{2})\b/);
  if (h24?.[1]) return h24[1];
  return 'Daily roster';
}

export function sortScheduleBlocksByTime<
  T extends { time: string; sortOrder?: number },
>(blocks: T[]): T[] {
  const rank = (time: string) => {
    const upper = time.toUpperCase();
    const m = upper.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/);
    if (!m) return 24 * 60 + (blocks.findIndex((b) => b.time === time) ?? 0);
    let h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    const ap = m[3];
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return h * 60 + min;
  };
  return [...blocks].sort(
    (a, b) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || rank(a.time) - rank(b.time),
  );
}

export const ASSIGNMENT_BLOCK_PREFIX = 'assignment:';

export function assignmentScheduleId(assignmentId: string) {
  return `${ASSIGNMENT_BLOCK_PREFIX}${assignmentId}`;
}

export function parseAssignmentScheduleId(blockId: string): string | null {
  if (!blockId.startsWith(ASSIGNMENT_BLOCK_PREFIX)) return null;
  return blockId.slice(ASSIGNMENT_BLOCK_PREFIX.length);
}

export function addUtcDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function upcomingDateKeys(startIso: string, count: number): string[] {
  const safe = Math.min(Math.max(count, 1), 14);
  return Array.from({ length: safe }, (_, i) => addUtcDays(startIso, i));
}

export function scheduleDayLabel(isoDate: string, todayIso: string): string {
  if (isoDate === todayIso) return 'Today';
  if (isoDate === addUtcDays(todayIso, 1)) return 'Tomorrow';
  return new Date(`${isoDate}T12:00:00.000Z`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}