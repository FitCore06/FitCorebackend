import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPIRY_NOTIFY_DAYS,
  expiryNotifyLeadDays,
  isExpiryNotifyDailyUntilPaid,
  parseExpiryNotifyDays,
} from '../src/automation/automation-days.js';

describe('parseExpiryNotifyDays', () => {
  it('parses comma-separated offsets', () => {
    expect(parseExpiryNotifyDays('7, 3, 1, 0')).toEqual([7, 3, 1, 0]);
  });

  it('falls back to defaults when input is empty', () => {
    expect(parseExpiryNotifyDays('')).toEqual([...DEFAULT_EXPIRY_NOTIFY_DAYS]);
    expect(parseExpiryNotifyDays('  ,  ')).toEqual([...DEFAULT_EXPIRY_NOTIFY_DAYS]);
  });

  it('ignores non-numeric parts', () => {
    expect(parseExpiryNotifyDays('7,foo,1')).toEqual([7, 1]);
  });
});

describe('expiryNotifyLeadDays', () => {
  it('uses max offset as daily window start', () => {
    expect(expiryNotifyLeadDays([7, 3, 1, 0])).toBe(7);
    expect(expiryNotifyLeadDays([14, 7])).toBe(14);
  });
});

describe('isExpiryNotifyDailyUntilPaid', () => {
  it('defaults to daily until paid', () => {
    expect(isExpiryNotifyDailyUntilPaid(undefined)).toBe(true);
    expect(isExpiryNotifyDailyUntilPaid('')).toBe(true);
  });

  it('supports milestone-only override', () => {
    expect(isExpiryNotifyDailyUntilPaid('false')).toBe(false);
    expect(isExpiryNotifyDailyUntilPaid('milestones')).toBe(false);
  });
});