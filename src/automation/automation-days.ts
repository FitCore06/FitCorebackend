export const DEFAULT_EXPIRY_NOTIFY_DAYS = [7, 3, 1, 0] as const;

export function parseExpiryNotifyDays(raw: string): number[] {
  const parsed = raw
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((n) => !Number.isNaN(n));
  return parsed.length ? parsed : [...DEFAULT_EXPIRY_NOTIFY_DAYS];
}