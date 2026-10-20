/**
 * dateUtils.ts
 *
 * Centralized Time and Date utilities for Flux MES.
 * Provides timezone-aware date formatting, calendar date normalization,
 * and robust Days Late calculation.
 */

export const DEFAULT_SITE_TIMEZONE = 'America/Toronto';

/**
 * Converts a date input string (YYYY-MM-DD) from an HTML date picker into a UTC noon ISO timestamp.
 * Storing calendar dates at 12:00:00 UTC ensures the date falls on the exact intended calendar day
 * across all global timezones (UTC-11 through UTC+11), eliminating previous-day shifts.
 */
export function calendarDateToUtcNoon(dateStr?: string | null): string | undefined {
  if (!dateStr) return undefined;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    return `${y}-${m}-${d}T12:00:00.000Z`;
  }
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return undefined;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 12, 0, 0)).toISOString();
}

/**
 * Converts any stored date/timestamp into a YYYY-MM-DD string suitable for HTML <input type="date">,
 * evaluated cleanly without day-skipping across timezones.
 */
export function toCalendarDateInput(dateStr?: string | null, timezone: string = DEFAULT_SITE_TIMEZONE): string {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';

  // If timestamp was stored at midnight UTC (legacy format) or noon UTC,
  // the UTC calendar date parts represent the exact date the user picked
  if (dateStr.includes('T00:00:00') || dateStr.includes('T12:00:00')) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Otherwise format date parts in the given timezone
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

/**
 * Formats an F.A.T. date string into a localized calendar date string (e.g. "9/20/2026"),
 * respecting the site timezone and avoiding previous-day UTC offset shifts.
 */
export function formatFatDate(fatDateStr?: string | null, fallback: string = 'None', timezone: string = DEFAULT_SITE_TIMEZONE): string {
  if (!fatDateStr) return fallback;
  const d = new Date(fatDateStr);
  if (isNaN(d.getTime())) return fallback;

  // For calendar dates (midnight or noon UTC), use UTC or site timezone safely
  const isUtcAligned = fatDateStr.includes('T00:00:00') || fatDateStr.includes('T12:00:00') || !fatDateStr.includes('T');
  const targetTz = isUtcAligned ? 'UTC' : timezone;

  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: targetTz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

/**
 * Calculates the number of days a machine is late based on its F.A.T. date and site timezone.
 * Returns 0 so long as F.A.T. is not late (or not set).
 */
export function calculateDaysLate(fatDateStr?: string | null, timezone: string = DEFAULT_SITE_TIMEZONE): number {
  if (!fatDateStr) return 0;
  const fatDate = new Date(fatDateStr);
  if (isNaN(fatDate.getTime())) return 0;

  const now = new Date();
  
  // Format today's date in the site timezone as YYYY-MM-DD
  let todayY: number, todayM: number, todayD: number;
  try {
    const todayParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now).split('-');
    todayY = parseInt(todayParts[0], 10);
    todayM = parseInt(todayParts[1], 10);
    todayD = parseInt(todayParts[2], 10);
  } catch {
    todayY = now.getFullYear();
    todayM = now.getMonth() + 1;
    todayD = now.getDate();
  }

  // Format FAT date as YYYY-MM-DD
  const fatDateInput = toCalendarDateInput(fatDateStr, timezone);
  const [fatYStr, fatMStr, fatDStr] = fatDateInput.split('-');
  const fatY = parseInt(fatYStr, 10);
  const fatM = parseInt(fatMStr, 10);
  const fatD = parseInt(fatDStr, 10);

  if (isNaN(fatY) || isNaN(fatM) || isNaN(fatD)) return 0;

  const todayUtc = Date.UTC(todayY, todayM - 1, todayD);
  const fatUtc = Date.UTC(fatY, fatM - 1, fatD);

  const diffDays = Math.floor((todayUtc - fatUtc) / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

/**
 * Calculates the overall project lateness (Days Late) across all spawned machines.
 * Uses the maximum days late across all machines with an F.A.T. date.
 * Returns 0 if no machines are late or no F.A.T. dates exist.
 */
export function calculateProjectDaysLate(machines?: { fat_date?: string | null }[], timezone: string = DEFAULT_SITE_TIMEZONE): number {
  if (!machines || machines.length === 0) return 0;
  let maxLate = 0;
  for (const m of machines) {
    if (m.fat_date) {
      const late = calculateDaysLate(m.fat_date, timezone);
      if (late > maxLate) {
        maxLate = late;
      }
    }
  }
  return maxLate;
}

/**
 * Formats a point-in-time timestamp (e.g. issue created_at) into the site timezone.
 */
export function formatTimestamp(dateString?: string | null, timezone: string = DEFAULT_SITE_TIMEZONE, options?: Intl.DateTimeFormatOptions): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';

  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };

  try {
    return new Intl.DateTimeFormat('en-US', { ...defaultOptions, ...options }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

/**
/**
 * Returns the Sunday (YYYY-MM-DD) for a given date or string (the first day of the work week).
 * If omitted, defaults to Sunday of the current week.
 */
export function getSundayOfWeek(input?: Date | string): string {
  if (!input) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const day = now.getDate();
    const dow = now.getDay(); // 0 is Sunday, ..., 6 is Saturday
    const sunday = new Date(Date.UTC(y, m, day - dow, 12, 0, 0));
    return `${sunday.getUTCFullYear()}-${String(sunday.getUTCMonth() + 1).padStart(2, '0')}-${String(sunday.getUTCDate()).padStart(2, '0')}`;
  }

  let d: Date;
  if (typeof input === 'string') {
    const [y, m, day] = input.split('T')[0].split('-').map(Number);
    d = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
  } else {
    d = new Date(input);
  }

  const dayOfWeek = d.getUTCDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
  const sunday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dayOfWeek, 12, 0, 0));

  const y = sunday.getUTCFullYear();
  const m = String(sunday.getUTCMonth() + 1).padStart(2, '0');
  const day = String(sunday.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Returns the week start date (Sunday). Kept as an alias for backwards compatibility.
 */
export function getMondayOfWeek(input?: Date | string): string {
  return getSundayOfWeek(input);
}

/**
 * Adds or subtracts weeks to a YYYY-MM-DD week start date.
 */
export function addWeeks(weekStartStr: string, weeks: number): string {
  const [y, m, d] = weekStartStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + weeks * 7, 12, 0, 0));
  const newY = date.getUTCFullYear();
  const newM = String(date.getUTCMonth() + 1).padStart(2, '0');
  const newD = String(date.getUTCDate()).padStart(2, '0');
  return `${newY}-${newM}-${newD}`;
}

export interface WeekDayInfo {
  dateStr: string;   // 'YYYY-MM-DD'
  dayName: string;   // 'Sun', 'Mon', ...
  fullName: string;  // 'Sunday', ...
  shortDate: string; // 'Oct 18'
}

/**
 * Returns the 7 days of the work week starting on Sunday.
 */
export function getWeekDays(weekStartStr: string): WeekDayInfo[] {
  const [y, m, d] = weekStartStr.split('-').map(Number);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const fullNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return Array.from({ length: 7 }, (_, i) => {
    const cur = new Date(Date.UTC(y, m - 1, d + i, 12, 0, 0));
    const curY = cur.getUTCFullYear();
    const curM = cur.getUTCMonth();
    const curD = cur.getUTCDate();
    const dateStr = `${curY}-${String(curM + 1).padStart(2, '0')}-${String(curD).padStart(2, '0')}`;
    return {
      dateStr,
      dayName: dayNames[i],
      fullName: fullNames[i],
      shortDate: `${monthNames[curM]} ${curD}`,
    };
  });
}

/**
 * Formats a week range (e.g. "Oct 18 – Oct 24, 2026").
 */
export function formatWeekRange(weekStartStr: string): string {
  const days = getWeekDays(weekStartStr);
  const start = days[0];
  const end = days[6];
  const endYear = end.dateStr.split('-')[0];
  return `${start.shortDate} – ${end.shortDate}, ${endYear}`;
}

