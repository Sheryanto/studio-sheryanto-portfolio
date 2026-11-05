import { parseLocalDate } from '../domain/dates';
import type { Lang, LocalDate } from '../domain/types';

/** Arabic UI uses Latin digits for numbers and times so stats stay easy to scan. */
export const intlLocale = (lang: Lang) => (lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB');

export function fmtDate(key: LocalDate, lang: Lang, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return new Intl.DateTimeFormat(intlLocale(lang), opts).format(parseLocalDate(key));
}

export function fmtTime(iso: string, lang: Lang) {
  return new Intl.DateTimeFormat(intlLocale(lang), { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export function fmtDateTime(iso: string, lang: Lang) {
  return new Intl.DateTimeFormat(intlLocale(lang), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export function fmtMonth(year: number, monthIndex: number, lang: Lang) {
  return new Intl.DateTimeFormat(intlLocale(lang), { month: 'long', year: 'numeric' }).format(new Date(year, monthIndex, 1));
}

export function fmtHHMM(hhmm: string, lang: Lang) {
  const [h, m] = hhmm.split(':').map(Number);
  return new Intl.DateTimeFormat(intlLocale(lang), { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, h, m));
}

export const fmtNumber = (n: number, lang: Lang) => new Intl.NumberFormat(intlLocale(lang)).format(n);
