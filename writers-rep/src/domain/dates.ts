import type { HHMM, LocalDate, Weekday } from './types';

/**
 * Local-date helpers. Schedule boundaries are calendar dates in the device's *current* timezone.
 * Dates are built with the (y, m, d) constructor so arithmetic is DST-safe.
 */

const pad = (n: number) => String(n).padStart(2, '0');

export function toLocalDate(d: Date): LocalDate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseLocalDate(key: LocalDate): Date {
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Invalid local date: ${key}`);
  return new Date(y, m - 1, d);
}

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toLocalDate(parseLocalDate(value)) === value;
}

export function addDays(key: LocalDate, n: number): LocalDate {
  const d = parseLocalDate(key);
  return toLocalDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

export function weekdayOf(key: LocalDate): Weekday {
  return parseLocalDate(key).getDay() as Weekday;
}

/** First day of the week containing `key`, given the configured week start. */
export function startOfWeek(key: LocalDate, weekStartsOn: Weekday): LocalDate {
  const diff = (weekdayOf(key) - weekStartsOn + 7) % 7;
  return addDays(key, -diff);
}

export function endOfWeek(key: LocalDate, weekStartsOn: Weekday): LocalDate {
  return addDays(startOfWeek(key, weekStartsOn), 6);
}

/** Inclusive list of dates from `from` to `to`. Empty when from > to. */
export function dateRange(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

export function isHHMM(value: unknown): value is HHMM {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** The instant of `time` on local date `key`, in the device's current timezone. */
export function localDateTime(key: LocalDate, time: HHMM): Date {
  const d = parseLocalDate(key);
  const [h, m] = time.split(':').map(Number);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h ?? 0, m ?? 0, 0, 0);
}

export function currentTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function monthKey(key: LocalDate): string {
  return key.slice(0, 7);
}
