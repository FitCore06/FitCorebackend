import { describe, expect, it } from 'vitest';
import { DEFAULT_EXPIRY_NOTIFY_DAYS, parseExpiryNotifyDays } from '../src/automation/automation-days.js';

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