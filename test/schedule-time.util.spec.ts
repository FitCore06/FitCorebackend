import { describe, expect, it } from 'vitest';
import {
  addUtcDays,
  assignmentScheduleId,
  parseAssignmentScheduleId,
  scheduleDayLabel,
  timeLabelFromNextSessionNote,
  upcomingDateKeys,
} from '../src/schedule/schedule-time.util.js';

describe('schedule-time.util', () => {
  it('parses next session note time', () => {
    expect(timeLabelFromNextSessionNote('Today 11:00 AM with Demo Trainer')).toBe(
      '11:00 AM',
    );
    expect(timeLabelFromNextSessionNote('Thu 18:00')).toBe('18:00');
    expect(timeLabelFromNextSessionNote(null)).toBe('Daily roster');
  });

  it('round-trips assignment schedule ids', () => {
    const id = assignmentScheduleId('abc-123');
    expect(parseAssignmentScheduleId(id)).toBe('abc-123');
    expect(parseAssignmentScheduleId('plain-block')).toBeNull();
  });

  it('builds 3-day range', () => {
    const start = '2026-11-22';
    expect(upcomingDateKeys(start, 3)).toEqual([
      start,
      addUtcDays(start, 1),
      addUtcDays(start, 2),
    ]);
    expect(scheduleDayLabel(start, start)).toBe('Today');
    expect(scheduleDayLabel(addUtcDays(start, 1), start)).toBe('Tomorrow');
  });
});