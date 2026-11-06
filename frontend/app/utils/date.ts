import dayjs from 'dayjs';
import 'dayjs/locale/km';

/** Khmer month names, e.g. "30 តុលា 2026". Digits stay Arabic until the Khmer-numerals report option (Phase 4). */
export function formatDateKm(value: dayjs.ConfigType): string {
  return dayjs(value).locale('km').format('D MMMM YYYY');
}

/** e.g. 30 តុលា 2026 14:05 */
export function formatDateTimeKm(value: dayjs.ConfigType): string {
  return dayjs(value).locale('km').format('D MMMM YYYY HH:mm');
}

/** Formal documents: ថ្ងៃទី30 ខែតុលា ឆ្នាំ2026 */
export function formatLongDateKm(value: dayjs.ConfigType): string {
  return dayjs(value).locale('km').format('[ថ្ងៃទី]D [ខែ]MMMM [ឆ្នាំ]YYYY');
}

/** The Khmer month name of a date, e.g. "តុលា" (used where a certificate says "ប្រចាំខែ …"). */
export function monthNameKm(value: dayjs.ConfigType): string {
  return dayjs(value).locale('km').format('MMMM');
}

/** YYYY-MM-DD as the API expects, or null when the text is not a real calendar date. */
export function toIsoDate(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  const real = check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
  return real ? value : null;
}

/** A date on this PC's calendar as YYYY-MM-DD (the form the API and `<input type="date">` use). */
export function todayIso(now: dayjs.ConfigType = new Date()): string {
  return dayjs(now).locale('en').format('YYYY-MM-DD');
}

/** The first day of the month of `now`, as YYYY-MM-DD. */
export function monthStartIso(now: dayjs.ConfigType = new Date()): string {
  return dayjs(now).locale('en').startOf('month').format('YYYY-MM-DD');
}

/** Suggested academic-year name from the calendar year, e.g. 2026 -> "2026-2027". No calendar assumptions beyond that. */
export function suggestYearName(today: dayjs.ConfigType = new Date()): string {
  const year = dayjs(today).year();
  return `${year}-${year + 1}`;
}
