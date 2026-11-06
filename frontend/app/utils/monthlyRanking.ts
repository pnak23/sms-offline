import type { Gender, ReportCard } from '../types/api';
import {
  STANDARD_HONOR_FORMATS, cleanHonorText, formatStyleOf, formatsJsonFor, honorTextProblem, honorTokenValues, parseFormatsFor,
  type HonorFormat, type HonorTokenValues,
} from './honorRoll';
import { queryString } from './query';
import { compareKhmer } from './sort';

// The monthly ranking list (ភាពចំណាត់ថ្នាក់ប្រចាំខែ): EVERY student of one class in one examination, in rank order, with the total score, the average, the rank and the
// grade; and below it how many students there are, how many passed and how many did not. The figures are the report cards' own (the same backend results), so the
// list can never disagree with a report card. Every word on the sheet is the school's: the five texts around the table and the column headings can be changed and
// saved as the default, like the roll of honour. Nothing here is stored by printing.

export const RANKING_TEXT_KEYS = ['header', 'title', 'stats', 'dateLines', 'titleRight', 'titleLeft'] as const;
export type RankingTextKey = (typeof RANKING_TEXT_KEYS)[number];
export type RankingTexts = Record<RankingTextKey, string>;
export type RankingFormats = Record<RankingTextKey, HonorFormat>;

/** What each box says until the school saves its own wording (the backend ships the same words as the defaults of `ranking.*`, and a test keeps them equal). */
export const STANDARD_RANKING_TEXTS: RankingTexts = {
  header: '{school}\n{class}',
  title: 'ភាពចំណាត់ថ្នាក់ប្រចាំខែ{month} ({schoolYear})',
  stats: 'បញ្ចប់បញ្ជីត្រឹមចំនួនសិស្សសរុប {total} នាក់ ស្រី {female} នាក់\nសិស្សមានមធ្យមភាគសរុប {passed} នាក់ ស្រី {passedFemale} នាក់\nសិស្សធ្លាក់មធ្យមភាគសរុប {failed} នាក់ ស្រី {failedFemale} នាក់',
  dateLines: '{date}',
  titleRight: 'គ្រូប្រចាំថ្នាក់',
  titleLeft: 'បានឃើញ និងឯកភាព\nនាយក/នាយិកា',
};

/** The first problem of any of the six boxes (too many lines, too many characters), or null when all are fine. */
export const rankingTextsProblem = (texts: RankingTexts): 'lines' | 'length' | null => RANKING_TEXT_KEYS.map((k) => honorTextProblem(texts[k])).find((p) => p !== null) ?? null;

const plain: HonorFormat = { ...STANDARD_HONOR_FORMATS.header };
/** The look of the school's own sample: the school block at the left, the title in the title font and underlined, the figures at the left, the signature titles bold. */
export const STANDARD_RANKING_FORMATS: RankingFormats = {
  header: { ...plain, align: 'left' },
  title: { ...plain, font: 'title', underline: true },
  stats: { ...plain, align: 'left', fit: true },
  dateLines: { ...plain, fit: true },
  titleRight: { ...plain, bold: true },
  titleLeft: { ...plain, bold: true },
};
const BASE_PT: Record<RankingTextKey, number> = { header: 10.5, title: 14, stats: 10.5, dateLines: 10.5, titleRight: 11, titleLeft: 11 };
export const rankingFormatStyle = (key: RankingTextKey, format: HonorFormat): Record<string, string> => formatStyleOf(BASE_PT[key], format);
export const parseRankingFormats = (json: string | null | undefined): RankingFormats => parseFormatsFor(json, STANDARD_RANKING_FORMATS);
export const rankingFormatsJson = (formats: RankingFormats): string => formatsJsonFor(formats, STANDARD_RANKING_FORMATS);

// ---- the words in braces --------------------------------------------------------------------------------------------------------------------

/** The six words every printed certificate knows, plus the school year and the six figures below the table. */
export const RANKING_TOKENS = ['school', 'class', 'exam', 'date', 'month', 'year', 'schoolYear', 'total', 'female', 'passed', 'passedFemale', 'failed', 'failedFemale'] as const;
export type RankingToken = (typeof RANKING_TOKENS)[number];
export type RankingTokenValues = Record<RankingToken, string>;

const two = (n: number): string => String(n).padStart(2, '0');

/** The values of the words for one sheet: the school, the class, the examination, the school year (its name, "2025-2026"), the chosen date, and the figures of that class (two digits, as "03"). */
export function rankingTokenValues(date: string, parts: { school: string; classLabel: string; exam: string; schoolYear: string }, stats: RankingStats): RankingTokenValues {
  const basics: HonorTokenValues = honorTokenValues(date, parts);
  return {
    ...basics,
    schoolYear: parts.schoolYear,
    total: two(stats.total), female: two(stats.female), passed: two(stats.passed), passedFemale: two(stats.passedFemale), failed: two(stats.failed), failedFemale: two(stats.failedFemale),
  };
}

// ---- the column headings --------------------------------------------------------------------------------------------------------------------

export const RANKING_COLUMN_KEYS = ['no', 'name', 'gender', 'total', 'average', 'rank', 'grade', 'remarks', 'female', 'male'] as const;
export type RankingColumnKey = (typeof RANKING_COLUMN_KEYS)[number];
export type RankingColumns = Record<RankingColumnKey, string>;
export const COLUMN_MAX = 40;

/** The headings of the table as on the school's sample; "female" and "male" are the one-letter marks of the sex column (ស = ស្រី, ប = ប្រុស). */
export const STANDARD_RANKING_COLUMNS: RankingColumns = {
  no: 'ល.រ', name: 'គោត្តនាម និងនាមខ្លួន', gender: 'ភេទ', total: 'ពិន្ទុសរុប', average: 'មធ្យមភាគ', rank: 'ចំណាត់ថ្នាក់', grade: 'និទ្ទេស', remarks: 'ផ្សេងៗ', female: 'ស', male: 'ប',
};

// eslint-disable-next-line no-control-regex
const cleanColumn = (value: string): string => value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, COLUMN_MAX);

/** The headings from the JSON the settings or the address carry: anything missing or odd keeps the standard heading (a heading saved empty stays empty). */
export function parseRankingColumns(json: string | null | undefined): RankingColumns {
  let raw: unknown = null;
  try {
    raw = json ? JSON.parse(json) : null;
  } catch {
    raw = null;
  }
  const given = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out = {} as RankingColumns;
  for (const key of RANKING_COLUMN_KEYS) out[key] = typeof given[key] === 'string' ? cleanColumn(given[key]) : STANDARD_RANKING_COLUMNS[key];
  return out;
}

/** The JSON to save or send: only the headings that differ from the standard; empty when none does. */
export function rankingColumnsJson(columns: RankingColumns): string {
  const changed: Record<string, string> = {};
  for (const key of RANKING_COLUMN_KEYS) if (cleanColumn(columns[key]) !== STANDARD_RANKING_COLUMNS[key]) changed[key] = cleanColumn(columns[key]);
  return Object.keys(changed).length > 0 ? JSON.stringify(changed) : '';
}

// ---- the rows -------------------------------------------------------------------------------------------------------------------------------

export interface RankingRow {
  /** 1, 2, 3 ... in the order of the list (not the rank: students tied on a rank have the same rank and different numbers). */
  no: number;
  studentId: number;
  nameKm: string;
  gender: Gender;
  /** null while the result is incomplete (some subject has nothing entered). */
  total: number | null;
  /** The percentage divided by 10: the average out of 10 (the total divided by the number of subjects when every subject is out of 10). */
  average: number | null;
  rank: number | null;
  bandLetter: string | null;
  bandLabel: string | null;
  passed: boolean | null;
  complete: boolean;
}

/**
 * Every student of the class, ranked ones first by rank (students tied on a rank in Khmer name order), then the students whose result is incomplete (nobody is
 * left out of the list), numbered 1, 2, 3. The figures are the report cards': a student with a missing mark has no total, average, rank or grade yet.
 */
export function buildRankingRows(cards: readonly ReportCard[]): RankingRow[] {
  const isRanked = (c: ReportCard): boolean => c.complete && c.rank !== null;
  const byName = (a: ReportCard, b: ReportCard): number => compareKhmer(a.nameKm, b.nameKm);
  const ranked = cards.filter(isRanked).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || byName(a, b));
  const waiting = cards.filter((c) => !isRanked(c)).sort(byName);
  return [...ranked, ...waiting].map((c, i) => ({
    no: i + 1,
    studentId: c.studentId,
    nameKm: c.nameKm,
    gender: c.gender,
    total: isRanked(c) ? c.total : null,
    average: c.percent === null || !c.complete ? null : c.percent / 10,
    rank: isRanked(c) ? c.rank : null,
    bandLetter: isRanked(c) ? c.bandLetter : null,
    bandLabel: isRanked(c) ? c.bandLabel : null,
    passed: isRanked(c) ? c.passed : null,
    complete: c.complete,
  }));
}

export interface RankingStats {
  total: number;
  female: number;
  passed: number;
  passedFemale: number;
  failed: number;
  failedFemale: number;
  /** Students whose result is incomplete: they are in `total` but neither passed nor failed yet. */
  waiting: number;
}

/** How many students there are, how many passed (their percentage reaches the pass mark of the grading scale) and how many did not, each with how many of them are girls. */
export function rankingStats(rows: readonly RankingRow[]): RankingStats {
  const girls = (list: readonly RankingRow[]): number => list.filter((r) => r.gender === 'FEMALE').length;
  const passed = rows.filter((r) => r.passed === true);
  const failed = rows.filter((r) => r.passed === false);
  return { total: rows.length, female: girls(rows), passed: passed.length, passedFemale: girls(passed), failed: failed.length, failedFemale: girls(failed), waiting: rows.filter((r) => !r.complete).length };
}

/**
 * Eight made-up students for the options page's preview while no real class is chosen, one in every kind of row: the grades A to F of the default grading scale
 * (the school's own scale replaces them on a real list), a girl and a boy in turn, and the last one not passed. Never printed.
 */
export function sampleRankingRows(nameOf: (n: number) => string): RankingRow[] {
  const made: [string, string, number][] = [
    ['A', 'ល្អប្រសើរ', 9.5], ['A', 'ល្អប្រសើរ', 9.1], ['B', 'ល្អណាស់', 8.4], ['B', 'ល្អណាស់', 8], ['C', 'ល្អ', 7.2], ['D', 'ល្អបង្គួរ', 6.3], ['E', 'មធ្យម', 5.4], ['F', 'ខ្សោយ', 3.8],
  ];
  return made.map(([letter, label, average], i) => ({
    no: i + 1,
    studentId: -(i + 1),
    nameKm: nameOf(i + 1),
    gender: i % 2 === 0 ? 'FEMALE' : 'MALE',
    total: Math.round(average * 60) / 10,
    average,
    rank: i + 1,
    bandLetter: letter,
    bandLabel: label,
    passed: average >= 5,
    complete: true,
  }));
}

/** The colour class of a grade: A green, B blue, C yellow, D orange, E and F red; a letter outside A to F (a school may use its own) is left plain. */
export const bandClass = (letter: string | null): string => (letter && /^[A-F]$/.test(letter) ? `ranking-band-${letter}` : '');

// ---- the saved default ----------------------------------------------------------------------------------------------------------------------

/**
 * The ONE saved default of the ranking list: its six texts, how each is set, the column headings, "every class" and the table colours
 * (`colours`: true = the heading, the rows by grade and the remarks column are filled; false = every cell transparent, only the lines are printed).
 */
export type RankingDefaults = RankingTexts & { formats: RankingFormats; columns: RankingColumns; allClasses: boolean; colours: boolean };

export function rankingDefaultsFrom(values: Record<string, string | undefined>): RankingDefaults {
  const text = (key: RankingTextKey): string => {
    const saved = values[`ranking.${key}`];
    return saved === undefined ? STANDARD_RANKING_TEXTS[key] : cleanHonorText(saved);
  };
  return {
    header: text('header'), title: text('title'), stats: text('stats'), dateLines: text('dateLines'), titleRight: text('titleRight'), titleLeft: text('titleLeft'),
    formats: parseRankingFormats(values['ranking.formats']),
    columns: parseRankingColumns(values['ranking.columns']),
    allClasses: values['ranking.allClasses'] === 'true',
    colours: values['ranking.colours'] !== 'false',   // coloured until the school says otherwise (anything but the exact word "false" keeps the colours)
  };
}

export const STANDARD_RANKING_DEFAULTS: RankingDefaults = rankingDefaultsFrom({});

export function rankingSettingsOf(d: RankingDefaults): Record<string, string> {
  return {
    'ranking.header': cleanHonorText(d.header), 'ranking.title': cleanHonorText(d.title), 'ranking.stats': cleanHonorText(d.stats),
    'ranking.dateLines': cleanHonorText(d.dateLines), 'ranking.titleRight': cleanHonorText(d.titleRight), 'ranking.titleLeft': cleanHonorText(d.titleLeft),
    'ranking.formats': rankingFormatsJson(d.formats), 'ranking.columns': rankingColumnsJson(d.columns), 'ranking.allClasses': String(d.allClasses), 'ranking.colours': String(d.colours),
  };
}

// ---- the print page's address ---------------------------------------------------------------------------------------------------------------

/** What a person chooses before printing (nothing of it is saved by printing; the print page reads it from its address). */
export type RankingOptions = RankingTexts & { date: string; formats: RankingFormats; columns: RankingColumns; colours: boolean };

export function rankingPrintPath(examinationId: number, classId: number | null, options: RankingOptions): string {
  const head = queryString({ examinationId, classId, all: classId === null ? 1 : null, date: options.date });
  const parts = RANKING_TEXT_KEYS.map((key) => `${key}=${encodeURIComponent(cleanHonorText(options[key]))}`);
  const formats = rankingFormatsJson(options.formats);
  if (formats !== '') parts.push(`formats=${encodeURIComponent(formats)}`);
  const columns = rankingColumnsJson(options.columns);
  if (columns !== '') parts.push(`columns=${encodeURIComponent(columns)}`);
  parts.push(`colours=${options.colours ? 1 : 0}`);
  return `/print/monthly-ranking${head}${head === '' ? '?' : '&'}${parts.join('&')}`;
}

type Raw = Record<string, unknown>;
const first = (value: unknown): string => (Array.isArray(value) ? String(value[0] ?? '') : typeof value === 'string' ? value : '');

/** Reads the print page's address back; anything wrong or missing falls back to the standard wording and look. */
export function parseRankingQuery(query: Raw): { examinationId: number; classId: number | null; all: boolean; options: RankingOptions } {
  const date = first(query.date);
  const classId = Number(first(query.classId));
  const text = (key: RankingTextKey): string => (query[key] === undefined ? STANDARD_RANKING_TEXTS[key] : cleanHonorText(first(query[key])));
  return {
    examinationId: Number(first(query.examinationId)),
    classId: Number.isInteger(classId) && classId > 0 ? classId : null,
    all: first(query.all) === '1',
    options: {
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
      header: text('header'), title: text('title'), stats: text('stats'), dateLines: text('dateLines'), titleRight: text('titleRight'), titleLeft: text('titleLeft'),
      formats: parseRankingFormats(first(query.formats)),
      columns: parseRankingColumns(first(query.columns)),
      colours: first(query.colours) !== '0',
    },
  };
}
