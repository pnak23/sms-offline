import type { StudentResult } from '../types/api';
import { formatLongDateKm, monthNameKm, todayIso } from './date';
import { DEFAULT_HONOR_STYLE, isHonorStyleId, type HonorStyleId } from './honorArt';
import { queryString } from './query';
import { compareKhmer } from './sort';

// The roll of honour (តារាងកិត្តិយស): the top 5 or top 10 students of ONE class in ONE examination, printed as a certificate.
// The names are the report cards' own ranks (computed by the backend from the same results), so the roll can never disagree with a report card.
// Nothing here is stored: the roll is worked out when it is printed.

export const HONOR_COUNTS = [5, 10] as const;
export type HonorCount = (typeof HONOR_COUNTS)[number];
export const DEFAULT_HONOR_COUNT: HonorCount = 5;

/**
 * The national header is the first thing on every roll of honour, in every style, whatever the "show the national header" switch of Settings → Printed reports
 * says (that switch is for the other printed pages and is off until the school turns it on). Its words come from those settings, so a correction made there is
 * followed; only if both lines were emptied does the roll use these, which are the program's own default wording (the same as the backend's defaults, and a test
 * keeps them equal). The wording still has to be checked against an official document (readiness item "national header").
 */
export const NATIONAL_HEADER_FALLBACK: readonly string[] = ['ព្រះរាជាណាចក្រកម្ពុជា', 'ជាតិ សាសនា ព្រះមហាក្សត្រ'];

export interface HonorEntry {
  /** The student's rank in the class; students tied on a rank share it (1, 2, 2, 4). */
  rank: number;
  studentId: number;
  nameKm: string;
  percent: number | null;
}

export interface HonorRoll {
  count: HonorCount;
  entries: HonorEntry[];
  /** How many names there are beyond `count`, because several students share the last rank. */
  extra: number;
  /** Students with a complete result (the only ones that have a rank). */
  ranked: number;
  /** Students in the class. */
  total: number;
}

/**
 * The students whose rank is within `count`, best first (students tied on a rank in Khmer name order). Ties are never cut: if three students
 * share rank 5 all three are listed, so `entries.length` can exceed `count` (`extra` says by how much). A student whose result is incomplete has
 * no rank and is never listed, so a child with a missing mark is not ranked by accident. A short class gives a short list, never empty frames.
 */
export function selectHonorRoll(students: readonly StudentResult[], count: HonorCount): HonorRoll {
  const ranked = students.filter((s): s is StudentResult & { rank: number } => s.rank !== null && s.complete);
  const entries = ranked
    .filter((s) => s.rank <= count)
    .sort((a, b) => a.rank - b.rank || compareKhmer(a.nameKm, b.nameKm))
    .map((s) => ({ rank: s.rank, studentId: s.studentId, nameKm: s.nameKm, percent: s.percent }));
  return { count, entries, extra: Math.max(0, entries.length - count), ranked: ranked.length, total: students.length };
}

/** The rows of the layout for `n` names: the first alone on top, then pairs, and a last one alone when the rest is odd. 5 -> 1,2,2; 10 -> 1,2,2,2,2,1. */
export function honorRows(n: number): number[] {
  if (n <= 0) return [];
  const rows = [1];
  let left = n - 1;
  while (left >= 2) {
    rows.push(2);
    left -= 2;
  }
  if (left === 1) rows.push(1);
  return rows;
}

/** The names cut into the rows of `honorRows`. */
export function honorLayout<T>(items: readonly T[]): T[][] {
  const rows: T[][] = [];
  let at = 0;
  for (const size of honorRows(items.length)) {
    rows.push(items.slice(at, at + size));
    at += size;
  }
  return rows;
}

/**
 * The five texts of the certificate, exactly the places the school marked on its sample: the block at the top left (the cluster / office line, the school, the
 * class), the line under the title, the date lines at the bottom right (the lunar date, the place and the date), and the two signature titles. Every word of
 * them can be changed and saved as the default. Words in braces ({school}, {class}, {exam}, {date}, {month}, {year}) are filled in when the page is made, so
 * the class is right on every page and the date is the one that was chosen.
 */
export type HonorTexts = {
  /** Top left. */
  header: string;
  /** Under the title. */
  subtitle: string;
  /** Bottom right, above the class teacher's title. */
  dateLines: string;
  /** The class teacher's title (the name is the class's homeroom teacher, printed under it). */
  titleRight: string;
  /** The director's title, bottom left (the name is the director's, from the school profile, printed under it). */
  titleLeft: string;
};

export const HONOR_TEXT_KEYS = ['header', 'subtitle', 'dateLines', 'titleRight', 'titleLeft'] as const;
export type HonorTextKey = (typeof HONOR_TEXT_KEYS)[number];

/** What each box says until the school saves its own wording (the backend ships the same words as the defaults of `honor.*`, and a test keeps them equal). */
export const STANDARD_HONOR_TEXTS: HonorTexts = {
  header: '{school}\n{class}',
  subtitle: 'លទ្ធផល{exam}',
  dateLines: '{date}',
  titleRight: 'គ្រូប្រចាំថ្នាក់',
  titleLeft: 'បានឃើញ និងឯកភាព\nនាយក/នាយិកា',
};

/** What a person chooses before printing (nothing of it is saved by printing; the print page reads it from its address). */
export interface HonorOptions extends HonorTexts {
  count: HonorCount;
  style: HonorStyleId;
  /** How each of the five boxes is set (font, size, bold, ...). */
  formats: HonorFormats;
  /** The date of the certificate, YYYY-MM-DD: the date the person picked when printing. */
  date: string;
}

// ---- how each box is set (font style) -------------------------------------------------------------------------------------------------------

export const HONOR_FONTS = ['text', 'title'] as const;
export const HONOR_SIZES = ['S', 'M', 'L', 'XL'] as const;
export const HONOR_ALIGNS = ['left', 'center', 'right'] as const;
export type HonorFont = (typeof HONOR_FONTS)[number];
export type HonorSize = (typeof HONOR_SIZES)[number];
export type HonorAlign = (typeof HONOR_ALIGNS)[number];

/** The look of ONE text box: the font (the text font, or the title font the school's name and "តារាងកិត្តិយស" use), the size, bold / italic / underline, the alignment, and whether a long line shrinks so it stays on ONE line. */
export interface HonorFormat {
  font: HonorFont;
  size: HonorSize;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: HonorAlign;
  fit: boolean;
}
export type HonorFormats = Record<HonorTextKey, HonorFormat>;

const plain: HonorFormat = { font: 'text', size: 'M', bold: false, italic: false, underline: false, align: 'center', fit: false };
/** The look the certificate has until the school changes it (as on the school's own sample): the subtitle in the title font, the two signature titles in bold, everything else plain, all centred; the date lines shrink rather than wrap. */
export const STANDARD_HONOR_FORMATS: HonorFormats = {
  header: { ...plain },
  subtitle: { ...plain, font: 'title' },
  dateLines: { ...plain, fit: true },
  titleRight: { ...plain, bold: true },
  titleLeft: { ...plain, bold: true },
};

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === 'string' && (list as readonly string[]).includes(value);

/** The formats from the JSON the settings or the print address carry: anything missing or odd keeps the standard look of that field. */
export function parseFormatsFor<K extends string>(json: string | null | undefined, standards: Record<K, HonorFormat>): Record<K, HonorFormat> {
  let raw: unknown = null;
  try {
    raw = json ? JSON.parse(json) : null;
  } catch {
    raw = null;
  }
  const boxes = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out = {} as Record<K, HonorFormat>;
  for (const key of Object.keys(standards) as K[]) {
    const standard = standards[key];
    const box = boxes[key] && typeof boxes[key] === 'object' ? (boxes[key] as Record<string, unknown>) : {};
    out[key] = {
      font: isOneOf(HONOR_FONTS, box.font) ? box.font : standard.font,
      size: isOneOf(HONOR_SIZES, box.size) ? box.size : standard.size,
      align: isOneOf(HONOR_ALIGNS, box.align) ? box.align : standard.align,
      bold: typeof box.bold === 'boolean' ? box.bold : standard.bold,
      italic: typeof box.italic === 'boolean' ? box.italic : standard.italic,
      underline: typeof box.underline === 'boolean' ? box.underline : standard.underline,
      fit: typeof box.fit === 'boolean' ? box.fit : standard.fit,
    };
  }
  return out;
}

/** The JSON to save or send: only what differs from the standard look; empty when nothing does. */
export function formatsJsonFor<K extends string>(formats: Record<K, HonorFormat>, standards: Record<K, HonorFormat>): string {
  const out: Record<string, Record<string, unknown>> = {};
  for (const key of Object.keys(standards) as K[]) {
    const changed: Record<string, unknown> = {};
    for (const field of Object.keys(standards[key]) as (keyof HonorFormat)[]) {
      if (formats[key][field] !== standards[key][field]) changed[field] = formats[key][field];
    }
    if (Object.keys(changed).length > 0) out[key] = changed;
  }
  return Object.keys(out).length > 0 ? JSON.stringify(out) : '';
}

export const parseHonorFormats = (json: string | null | undefined): HonorFormats => parseFormatsFor(json, STANDARD_HONOR_FORMATS);
export const honorFormatsJson = (formats: HonorFormats): string => formatsJsonFor(formats, STANDARD_HONOR_FORMATS);

/** The size of each box's text at "M", in points; S, L and XL scale it. */
const BASE_PT: Record<HonorTextKey, number> = { header: 10.5, subtitle: 12.3, dateLines: 11, titleRight: 11, titleLeft: 11 };
const SIZE_FACTOR: Record<HonorSize, number> = { S: 0.85, M: 1, L: 1.2, XL: 1.45 };

/** The inline style of a box. `--fit` is set by the sheet when a "stay on one line" box is wider than its room (it only ever shrinks the text). */
export function formatStyleOf(basePt: number, format: HonorFormat): Record<string, string> {
  return {
    fontFamily: format.font === 'title' ? 'var(--sms-title-font)' : 'inherit',
    fontSize: `calc(${Math.round(basePt * SIZE_FACTOR[format.size] * 1000) / 1000}pt * var(--fit, 1))`,
    fontWeight: format.bold ? '700' : '400',
    fontStyle: format.italic ? 'italic' : 'normal',
    textDecoration: format.underline ? 'underline' : 'none',
    textAlign: format.align,
    whiteSpace: format.fit ? 'pre' : 'pre-wrap',
  };
}

export const honorFormatStyle = (key: HonorTextKey, format: HonorFormat): Record<string, string> => formatStyleOf(BASE_PT[key], format);

/** A text box of the certificate holds at most this many characters and lines; the backend enforces the same limits on the saved defaults. */
export const HONOR_TEXT_MAX = 300;
export const HONOR_TEXT_LINES = 4;

/**
 * The text as typed, made safe to keep and to print: Windows line ends become one line break, no control character other than the line break survives, and
 * the two ends are trimmed. Spaces and line breaks INSIDE the text are kept exactly (a certificate line is often set out with them). Over-long text is cut to
 * the limits (the boxes warn before that, see `honorTextProblem`).
 */
export function cleanHonorText(value: string | null | undefined): string {
  const text = (value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .trim();
  return text.split('\n').slice(0, HONOR_TEXT_LINES).join('\n').slice(0, HONOR_TEXT_MAX).trim();
}

/** What is wrong with a text box, if anything: too many lines, or too many characters. */
export function honorTextProblem(value: string): 'lines' | 'length' | null {
  const typed = value.replace(/\r\n?/g, '\n').trim();
  if (typed.split('\n').length > HONOR_TEXT_LINES) return 'lines';
  if (typed.length > HONOR_TEXT_MAX) return 'length';
  return null;
}

/** The first problem of any of the five boxes, or null when all are fine. */
export const honorTextsProblem = (texts: HonorTexts): 'lines' | 'length' | null => HONOR_TEXT_KEYS.map((k) => honorTextProblem(texts[k])).find((p) => p !== null) ?? null;

// ---- the words in braces --------------------------------------------------------------------------------------------------------------------

export const HONOR_TOKENS = ['school', 'class', 'exam', 'date', 'month', 'year'] as const;
export type HonorToken = (typeof HONOR_TOKENS)[number];
export type HonorTokenValues = Record<HonorToken, string>;
export const tokenText = (token: HonorToken): string => `{${token}}`;

/** The values of the words in braces for one page: the school, the class, the examination and the chosen date (an empty or invalid date means today). */
export function honorTokenValues(date: string, parts: { school: string; classLabel: string; exam: string }): HonorTokenValues {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayIso();
  return { school: parts.school, class: parts.classLabel, exam: parts.exam, date: formatLongDateKm(iso), month: monthNameKm(iso), year: iso.slice(0, 4) };
}

/** A box's text with its words in braces filled in. Anything else in braces is printed as typed. */
export function expandHonorText(template: string, values: Record<string, string>): string {
  return cleanHonorText(template).replace(/\{([A-Za-z]+)\}/g, (whole, word: string) => (Object.prototype.hasOwnProperty.call(values, word) ? (values[word] ?? whole) : whole));
}

// ---- the saved default ----------------------------------------------------------------------------------------------------------------------

/**
 * The ONE saved default of the roll of honour (Settings → Roll of honour): what the options window starts with, so printing it only means choosing the date.
 * Stored with the program's other settings (`honor.*`), never in the browser.
 */
export interface HonorDefaults extends HonorTexts {
  count: HonorCount;
  style: HonorStyleId;
  allClasses: boolean;
  formats: HonorFormats;
}

/** The defaults from the settings the server sent (anything missing or odd falls back to the program's own default; a box saved empty stays empty). */
export function honorDefaultsFrom(values: Record<string, string | undefined>): HonorDefaults {
  const style = values['honor.style'] ?? '';
  const text = (key: HonorTextKey): string => {
    const saved = values[`honor.${key}`];
    return saved === undefined ? STANDARD_HONOR_TEXTS[key] : cleanHonorText(saved);
  };
  return {
    count: values['honor.count'] === '10' ? 10 : DEFAULT_HONOR_COUNT,
    style: isHonorStyleId(style) ? style : DEFAULT_HONOR_STYLE,
    header: text('header'),
    subtitle: text('subtitle'),
    dateLines: text('dateLines'),
    titleRight: text('titleRight'),
    titleLeft: text('titleLeft'),
    allClasses: values['honor.allClasses'] === 'true',
    formats: parseHonorFormats(values['honor.formats']),
  };
}

export const STANDARD_HONOR_DEFAULTS: HonorDefaults = honorDefaultsFrom({});

/** The settings to save for these defaults (all of them, so a saved default never depends on what was stored before). */
export function honorSettingsOf(defaults: HonorDefaults): Record<string, string> {
  return {
    'honor.count': String(defaults.count),
    'honor.style': defaults.style,
    'honor.header': cleanHonorText(defaults.header),
    'honor.subtitle': cleanHonorText(defaults.subtitle),
    'honor.dateLines': cleanHonorText(defaults.dateLines),
    'honor.titleRight': cleanHonorText(defaults.titleRight),
    'honor.titleLeft': cleanHonorText(defaults.titleLeft),
    'honor.allClasses': String(defaults.allClasses),
    'honor.formats': honorFormatsJson(defaults.formats),
  };
}

// ---- the print page's address ---------------------------------------------------------------------------------------------------------------

/** The address of the print page: one class, or every class of the examination's year. A text box that was emptied is sent empty (and stays empty). */
export function honorPrintPath(examinationId: number, classId: number | null, options: HonorOptions): string {
  const head = queryString({ examinationId, classId, all: classId === null ? 1 : null, count: options.count, style: options.style, date: options.date });
  const texts = HONOR_TEXT_KEYS.map((key) => `${key}=${encodeURIComponent(cleanHonorText(options[key]))}`);
  const formats = honorFormatsJson(options.formats);
  if (formats !== '') texts.push(`formats=${encodeURIComponent(formats)}`);
  return `/print/honor-roll${head}${head === '' ? '?' : '&'}${texts.join('&')}`;
}

type Raw = Record<string, unknown>;
const first = (value: unknown): string => (Array.isArray(value) ? String(value[0] ?? '') : typeof value === 'string' ? value : '');

/** Reads the print page's address back; anything wrong or missing falls back to the default (5 names, classic gold, the standard wording). */
export function parseHonorQuery(query: Raw): { examinationId: number; classId: number | null; all: boolean; options: HonorOptions } {
  const count = Number(first(query.count));
  const style = first(query.style);
  const date = first(query.date);
  const classId = Number(first(query.classId));
  const text = (key: HonorTextKey): string => (query[key] === undefined ? STANDARD_HONOR_TEXTS[key] : cleanHonorText(first(query[key])));
  return {
    examinationId: Number(first(query.examinationId)),
    classId: Number.isInteger(classId) && classId > 0 ? classId : null,
    all: first(query.all) === '1',
    options: {
      count: count === 10 ? 10 : DEFAULT_HONOR_COUNT,
      style: isHonorStyleId(style) ? style : DEFAULT_HONOR_STYLE,
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
      header: text('header'),
      subtitle: text('subtitle'),
      dateLines: text('dateLines'),
      titleRight: text('titleRight'),
      titleLeft: text('titleLeft'),
      formats: parseHonorFormats(first(query.formats)),
    },
  };
}
