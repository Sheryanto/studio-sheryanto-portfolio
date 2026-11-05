import { describe, expect, it } from 'vitest';
import { addDays, dateRange, endOfWeek, isHHMM, isLocalDate, localDateTime, startOfWeek, toLocalDate, weekdayOf } from '../../src/domain/dates';

describe('local dates', () => {
  it('formats in device local time, not UTC', () => {
    const lateEvening = new Date(2026, 10, 5, 23, 59);
    expect(toLocalDate(lateEvening)).toBe('2026-11-05');
    expect(toLocalDate(new Date(2026, 10, 6, 0, 0))).toBe('2026-11-06');
  });
  it('adds days across month, year and DST boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    // US DST ends 2026-11-01; Europe 2026-10-25. Pure date arithmetic must ignore that.
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(addDays('2026-03-08', -1)).toBe('2026-03-07');
    expect(dateRange('2026-10-30', '2026-11-03')).toHaveLength(5);
  });
  it('computes weeks for any week start', () => {
    expect(weekdayOf('2026-11-05')).toBe(4); // Thursday
    expect(startOfWeek('2026-11-05', 1)).toBe('2026-11-02'); // Monday
    expect(endOfWeek('2026-11-05', 1)).toBe('2026-11-08');
    expect(startOfWeek('2026-11-05', 6)).toBe('2026-10-31'); // Saturday
    expect(startOfWeek('2026-11-02', 1)).toBe('2026-11-02');
  });
  it('validates inputs', () => {
    expect(isLocalDate('2026-02-30')).toBe(false);
    expect(isLocalDate('2026-02-28')).toBe(true);
    expect(isHHMM('21:00')).toBe(true);
    expect(isHHMM('24:00')).toBe(false);
  });
  it('builds local instants for cutoffs', () => {
    const d = localDateTime('2026-11-05', '21:00');
    expect(d.getHours()).toBe(21);
    expect(toLocalDate(d)).toBe('2026-11-05');
  });
});
