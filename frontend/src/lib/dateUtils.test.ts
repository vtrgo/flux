import { describe, it, expect } from 'vitest';
import {
  calculateDaysLate,
  calculateProjectDaysLate,
  formatFatDate,
  calendarDateToUtcNoon,
  toCalendarDateInput,
  formatTimestamp,
} from './dateUtils';

describe('dateUtils - F.A.T. and Days Late', () => {
  it('returns 0 when fat_date is not set', () => {
    expect(calculateDaysLate(undefined)).toBe(0);
    expect(calculateDaysLate(null)).toBe(0);
    expect(calculateDaysLate('')).toBe(0);
  });

  it('returns 0 when fat_date is today or in the future', () => {
    const today = new Date();
    expect(calculateDaysLate(today.toISOString())).toBe(0);

    const future = new Date();
    future.setDate(future.getDate() + 5);
    expect(calculateDaysLate(future.toISOString())).toBe(0);
  });

  it('returns positive days late when fat_date is in the past', () => {
    const past = new Date();
    past.setDate(past.getDate() - 4);
    expect(calculateDaysLate(past.toISOString())).toBe(4);
  });

  it('calculates project days late taking the maximum across all machines', () => {
    const past1 = new Date();
    past1.setDate(past1.getDate() - 3);

    const past2 = new Date();
    past2.setDate(past2.getDate() - 7);

    const future = new Date();
    future.setDate(future.getDate() + 2);

    const machines = [
      { fat_date: past1.toISOString() }, // 3 days late
      { fat_date: past2.toISOString() }, // 7 days late
      { fat_date: future.toISOString() }, // 0 days late
      { fat_date: null },
    ];

    expect(calculateProjectDaysLate(machines)).toBe(7);
  });

  it('returns 0 for project days late when no machines are late or no machines exist', () => {
    expect(calculateProjectDaysLate([])).toBe(0);
    expect(calculateProjectDaysLate(undefined)).toBe(0);

    const future = new Date();
    future.setDate(future.getDate() + 10);
    expect(calculateProjectDaysLate([{ fat_date: future.toISOString() }])).toBe(0);
  });

  it('formats fat date correctly', () => {
    expect(formatFatDate(null)).toBe('None');
    expect(formatFatDate(undefined, 'TBD')).toBe('TBD');
    expect(formatFatDate('2026-10-15T12:00:00.000Z')).toContain('10/15/2026');
    // Legacy midnight UTC date format should not shift to 10/14
    expect(formatFatDate('2026-10-15T00:00:00.000Z')).toContain('10/15/2026');
  });

  it('normalizes calendar dates to UTC noon without offset shifts', () => {
    expect(calendarDateToUtcNoon('2026-09-20')).toBe('2026-09-20T12:00:00.000Z');
    expect(calendarDateToUtcNoon(null)).toBeUndefined();
    expect(calendarDateToUtcNoon('')).toBeUndefined();
  });

  it('converts stored dates cleanly to YYYY-MM-DD for date inputs', () => {
    expect(toCalendarDateInput('2026-09-20')).toBe('2026-09-20');
    expect(toCalendarDateInput('2026-09-20T12:00:00.000Z')).toBe('2026-09-20');
    expect(toCalendarDateInput('2026-09-20T00:00:00.000Z')).toBe('2026-09-20');
    expect(toCalendarDateInput(null)).toBe('');
  });

  it('formats timestamp in specified timezone', () => {
    const ts = '2026-09-15T16:00:00.000Z'; // 12:00 PM EDT (-04:00)
    const formatted = formatTimestamp(ts, 'America/Toronto');
    expect(formatted).toContain('Sep 15, 2026');
    expect(formatted).toContain('12:00 PM');
  });
});
