export const DEFAULT_EXPIRY_NOTIFY_DAYS = [7, 3, 1, 0] as const;

export function parseExpiryNotifyDays(raw: string): number[] {
  const parsed = raw
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((n) => !Number.isNaN(n));
  return parsed.length ? parsed : [...DEFAULT_EXPIRY_NOTIFY_DAYS];
}

/** First daily reminder when daysUntil <= lead (max offset in notify list). */
export function expiryNotifyLeadDays(daysBefore: number[]): number {
  const finite = daysBefore.filter((d) => Number.isFinite(d) && d >= 0);
  return finite.length ? Math.max(...finite) : DEFAULT_EXPIRY_NOTIFY_DAYS[0];
}

/** Daily in-app + push until renewed or owner marks payment paid (default on). */
export function isExpiryNotifyDailyUntilPaid(
  raw: string | undefined,
): boolean {
  const v = raw?.trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'milestones') return false;
  return true;
}