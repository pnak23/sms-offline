// The monthly ranking list (ភាពចំណាត់ថ្នាក់ប្រចាំខែ): who is on it and in what order, the figures under the table, the column headings, the saved default, and the print address.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Gender, ReportCard } from '../app/types/api';
import { STANDARD_HONOR_FORMATS, expandHonorText } from '../app/utils/honorRoll';
import {
  COLUMN_MAX, RANKING_COLUMN_KEYS, RANKING_TEXT_KEYS, RANKING_TOKENS, STANDARD_RANKING_COLUMNS, STANDARD_RANKING_DEFAULTS, STANDARD_RANKING_FORMATS, STANDARD_RANKING_TEXTS,
  bandClass, buildRankingRows, parseRankingColumns, parseRankingFormats, parseRankingQuery, rankingColumnsJson, rankingDefaultsFrom, rankingFormatsJson, rankingPrintPath,
  rankingSettingsOf, rankingStats, rankingTextsProblem, rankingTokenValues, sampleRankingRows,
  type RankingOptions,
} from '../app/utils/monthlyRanking';

const SETTINGS_JAVA = path.resolve(__dirname, '..', '..', 'backend', 'src', 'main', 'java', 'kh', 'school', 'sms', 'settings', 'AppSettingsService.java');

let nextId = 1;
/** A report card as the backend sends it, with only the fields the list reads; `rank` null means an incomplete result. */
function card(nameKm: string, rank: number | null, over: Partial<ReportCard> = {}): ReportCard {
  const id = nextId++;
  const complete = rank !== null;
  return {
    examinationId: 1, examinationName: 'ប្រចាំខែ', kind: 'MONTHLY', termNo: null, yearName: '2025-2026', classId: 1, className: 'ក', gradeName: 'ថ្នាក់ទី១',
    enrollmentId: id, studentId: id, studentCode: `2026-${String(id).padStart(4, '0')}`, nameKm, nameEn: null, gender: 'MALE', dateOfBirth: '2018-01-01', photoFile: null,
    subjects: [], total: complete ? 60 : 20, totalMax: 100, percent: complete ? 60 : null, bandLetter: complete ? 'D' : null, bandLabel: complete ? 'ល្អបង្គួរ' : null,
    passed: complete ? true : null, rank, rankedCount: 0, complete, attendance: {} as ReportCard['attendance'], comment: null,
    ...over,
  };
}
const girl = (nameKm: string, rank: number | null, over: Partial<ReportCard> = {}): ReportCard => card(nameKm, rank, { gender: 'FEMALE' as Gender, ...over });

describe('buildRankingRows', () => {
  it('lists every student of the class: ranked ones by rank, then the ones whose result is incomplete, numbered 1, 2, 3', () => {
    const rows = buildRankingRows([card('ខ', 2), card('គ', null), card('ក', 1), card('ឃ', 3)]);
    expect(rows.map((r) => r.nameKm)).toEqual(['ក', 'ខ', 'ឃ', 'គ']);
    expect(rows.map((r) => r.no)).toEqual([1, 2, 3, 4]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, null]);
  });

  it('leaves nobody out, and gives an incomplete student no total, average, rank or grade', () => {
    const rows = buildRankingRows([card('ក', 1), card('ខ', null, { total: 33, percent: 41 })]);
    expect(rows).toHaveLength(2);
    const waiting = rows[1]!;
    expect(waiting).toMatchObject({ complete: false, total: null, average: null, rank: null, bandLetter: null, bandLabel: null, passed: null });
  });

  it('keeps students tied on a rank together, in Khmer name order, with the same rank and different numbers', () => {
    const rows = buildRankingRows([card('ខ', 2), card('ក', 2), card('គ', 1)]);
    expect(rows.map((r) => [r.no, r.rank, r.nameKm])).toEqual([[1, 1, 'គ'], [2, 2, 'ក'], [3, 2, 'ខ']]);
  });

  it('takes the average as the percentage divided by ten, and never invents it', () => {
    const rows = buildRankingRows([card('ក', 1, { percent: 87.5, total: 525 }), card('ខ', 2, { percent: null })]);
    expect(rows[0]!.average).toBe(8.75);
    expect(rows[0]!.total).toBe(525);
    expect(rows[1]!.average).toBeNull();
  });

  it('is empty for an empty class', () => {
    expect(buildRankingRows([])).toEqual([]);
  });
});

describe('rankingStats', () => {
  it('counts the students, the ones who passed and the ones who did not, each with how many are girls', () => {
    const rows = buildRankingRows([
      girl('ក', 1, { passed: true }), card('ខ', 2, { passed: true }), girl('គ', 3, { passed: false }), card('ឃ', 4, { passed: false }), card('ង', 5, { passed: false }),
      girl('ច', null), card('ឆ', null),
    ]);
    expect(rankingStats(rows)).toEqual({ total: 7, female: 3, passed: 2, passedFemale: 1, failed: 3, failedFemale: 1, waiting: 2 });
  });

  it('counts an incomplete student in the total but neither as passed nor as failed', () => {
    const stats = rankingStats(buildRankingRows([card('ក', null)]));
    expect(stats).toMatchObject({ total: 1, passed: 0, failed: 0, waiting: 1 });
  });
});

describe('bandClass', () => {
  it('gives a colour class to the grades A to F and leaves anything else plain', () => {
    expect(['A', 'B', 'C', 'D', 'E', 'F'].map(bandClass)).toEqual(['ranking-band-A', 'ranking-band-B', 'ranking-band-C', 'ranking-band-D', 'ranking-band-E', 'ranking-band-F']);
    expect(bandClass(null)).toBe('');
    expect(bandClass('G')).toBe('');
    expect(bandClass('AB')).toBe('');
    expect(bandClass('a')).toBe('');
  });
});

describe('the words in braces', () => {
  it('fills the figures in with two digits and the school year as it is named', () => {
    const stats = { total: 25, female: 12, passed: 20, passedFemale: 9, failed: 3, failedFemale: 1, waiting: 2 };
    const values = rankingTokenValues('2026-11-05', { school: 'សាលាគំរូ', classLabel: 'ថ្នាក់ទី១ ក', exam: 'ប្រចាំខែវិច្ឆិកា', schoolYear: '2025-2026' }, stats);
    expect(Object.keys(values).sort()).toEqual([...RANKING_TOKENS].sort());
    expect(values).toMatchObject({ school: 'សាលាគំរូ', class: 'ថ្នាក់ទី១ ក', exam: 'ប្រចាំខែវិច្ឆិកា', schoolYear: '2025-2026', year: '2026', total: '25', female: '12', passed: '20', passedFemale: '09', failed: '03', failedFemale: '01' });
    expect(expandHonorText(STANDARD_RANKING_TEXTS.title, values)).toContain('(2025-2026)');
    expect(expandHonorText(STANDARD_RANKING_TEXTS.stats, values)).toContain('សរុប 25 នាក់ ស្រី 12 នាក់');
  });

  it('leaves a word it does not know exactly as typed', () => {
    const stats = { total: 1, female: 0, passed: 0, passedFemale: 0, failed: 0, failedFemale: 0, waiting: 0 };
    const values = rankingTokenValues('2026-11-05', { school: 'ក', classLabel: 'ខ', exam: 'គ', schoolYear: 'ឃ' }, stats);
    expect(expandHonorText('{total} {nothing}', values)).toBe('01 {nothing}');
  });
});

describe('the column headings', () => {
  it('start as the school\'s sample words, one for each of the ten places', () => {
    expect(Object.keys(STANDARD_RANKING_COLUMNS)).toEqual([...RANKING_COLUMN_KEYS]);
    expect(parseRankingColumns('')).toEqual(STANDARD_RANKING_COLUMNS);
    expect(parseRankingColumns(null)).toEqual(STANDARD_RANKING_COLUMNS);
    expect(rankingColumnsJson(STANDARD_RANKING_COLUMNS)).toBe('');
  });

  it('save only the headings that differ, and read back as the same headings', () => {
    const changed = { ...STANDARD_RANKING_COLUMNS, rank: 'លំដាប់', female: 'F' };
    const json = rankingColumnsJson(changed);
    expect(JSON.parse(json)).toEqual({ rank: 'លំដាប់', female: 'F' });
    expect(parseRankingColumns(json)).toEqual(changed);
  });

  it('keep a heading the school emptied empty, and fall back to the standard for anything odd', () => {
    expect(parseRankingColumns('{"remarks":""}').remarks).toBe('');
    expect(rankingColumnsJson({ ...STANDARD_RANKING_COLUMNS, remarks: '' })).toBe('{"remarks":""}');
    expect(parseRankingColumns('not json')).toEqual(STANDARD_RANKING_COLUMNS);
    expect(parseRankingColumns('[1,2]')).toEqual(STANDARD_RANKING_COLUMNS);
    expect(parseRankingColumns('{"rank":5,"colour":"red"}')).toEqual(STANDARD_RANKING_COLUMNS);
  });

  it('are one tidy line of at most the limit', () => {
    const long = 'ក'.repeat(COLUMN_MAX + 20);
    expect(parseRankingColumns(JSON.stringify({ name: long })).name).toHaveLength(COLUMN_MAX);
    expect(parseRankingColumns(JSON.stringify({ name: '  ក\n\tខ   គ ' })).name).toBe('ក ខ គ');
  });
});

describe('the formats', () => {
  it('start as the look of the school\'s sample and save only what differs', () => {
    expect(parseRankingFormats('')).toEqual(STANDARD_RANKING_FORMATS);
    expect(rankingFormatsJson(STANDARD_RANKING_FORMATS)).toBe('');
    const changed = parseRankingFormats('{"title":{"bold":true,"size":"XL"}}');
    expect(changed.title).toMatchObject({ bold: true, size: 'XL', underline: true, font: 'title' });
    expect(JSON.parse(rankingFormatsJson(changed))).toEqual({ title: { bold: true, size: 'XL' } });
  });

  it('give the title its own font and underline, and the figures and the date the keep-on-one-line setting', () => {
    expect(STANDARD_RANKING_FORMATS.title).toMatchObject({ font: 'title', underline: true });
    expect(STANDARD_RANKING_FORMATS.stats.fit).toBe(true);
    expect(STANDARD_RANKING_FORMATS.dateLines.fit).toBe(true);
    expect(STANDARD_RANKING_FORMATS.header.align).toBe('left');
    expect(STANDARD_RANKING_FORMATS.titleRight.bold).toBe(true);
    expect(STANDARD_RANKING_FORMATS.titleLeft.bold).toBe(true);
    expect(STANDARD_HONOR_FORMATS.header.align).not.toBe(STANDARD_RANKING_FORMATS.header.align);   // the roll of honour's own look is not touched
  });
});

describe('the texts', () => {
  it('warn about too many lines or too many characters in any of the six boxes', () => {
    expect(rankingTextsProblem(STANDARD_RANKING_TEXTS)).toBeNull();
    expect(rankingTextsProblem({ ...STANDARD_RANKING_TEXTS, stats: 'ក\nខ\nគ\nឃ\nង' })).toBe('lines');
    expect(rankingTextsProblem({ ...STANDARD_RANKING_TEXTS, title: 'ក'.repeat(301) })).toBe('length');
  });
});

describe('the saved default', () => {
  it('is the standard wording and look when nothing was saved', () => {
    expect(rankingDefaultsFrom({})).toEqual(STANDARD_RANKING_DEFAULTS);
    expect(STANDARD_RANKING_DEFAULTS.allClasses).toBe(false);
    expect(STANDARD_RANKING_DEFAULTS.colours).toBe(true);
    expect(STANDARD_RANKING_DEFAULTS.columns).toEqual(STANDARD_RANKING_COLUMNS);
  });

  it('keeps a box the school emptied empty, and tidies line ends and the two ends of a text', () => {
    const saved = rankingDefaultsFrom({ 'ranking.header': '', 'ranking.stats': ' ក\r\nខ  ស្រី \r\n', 'ranking.allClasses': 'true' });
    expect(saved.header).toBe('');
    expect(saved.stats).toBe('ក\nខ  ស្រី');
    expect(saved.allClasses).toBe(true);
    expect(saved.title).toBe(STANDARD_RANKING_TEXTS.title);
    expect(rankingDefaultsFrom({ 'ranking.allClasses': 'maybe' }).allClasses).toBe(false);
  });

  it('has a coloured table until the school switches the colours off, and only the exact word false switches them off', () => {
    expect(rankingDefaultsFrom({}).colours).toBe(true);
    expect(rankingDefaultsFrom({ 'ranking.colours': 'true' }).colours).toBe(true);
    expect(rankingDefaultsFrom({ 'ranking.colours': 'false' }).colours).toBe(false);
    expect(rankingDefaultsFrom({ 'ranking.colours': 'no' }).colours).toBe(true);
    expect(rankingDefaultsFrom({ 'ranking.colours': '' }).colours).toBe(true);
    expect(rankingSettingsOf({ ...STANDARD_RANKING_DEFAULTS, colours: false })['ranking.colours']).toBe('false');
    expect(rankingSettingsOf(STANDARD_RANKING_DEFAULTS)['ranking.colours']).toBe('true');
  });

  it('saves every key, and what is saved reads back as the same default', () => {
    const wanted = {
      ...STANDARD_RANKING_TEXTS, title: 'ចំណាត់ថ្នាក់\n  ខែ{month}', dateLines: '', formats: parseRankingFormats('{"stats":{"bold":true,"size":"L"}}'),
      columns: { ...STANDARD_RANKING_COLUMNS, rank: 'លំដាប់', remarks: '' }, allClasses: true, colours: false,
    };
    const settings = rankingSettingsOf(wanted);
    expect(Object.keys(settings).sort()).toEqual(['ranking.allClasses', 'ranking.colours', 'ranking.columns', 'ranking.dateLines', 'ranking.formats', 'ranking.header', 'ranking.stats', 'ranking.title', 'ranking.titleLeft', 'ranking.titleRight']);
    expect(rankingDefaultsFrom(settings)).toEqual(wanted);
  });
});

describe('the print address', () => {
  const options = (over: Partial<RankingOptions> = {}): RankingOptions => ({ ...STANDARD_RANKING_TEXTS, date: '2026-11-05', formats: STANDARD_RANKING_FORMATS, columns: STANDARD_RANKING_COLUMNS, colours: true, ...over });

  it('carries the examination, the class, the date and every text, and reads back the same', () => {
    const wanted = options({ title: 'ក  ខ\nគ & ឃ = ង', stats: '' });
    const path = rankingPrintPath(7, 3, wanted);
    expect(path.startsWith('/print/monthly-ranking?')).toBe(true);
    const url = new URL(path, 'http://localhost');
    const query = Object.fromEntries(url.searchParams.entries());
    const parsed = parseRankingQuery(query);
    expect(parsed).toMatchObject({ examinationId: 7, classId: 3, all: false });
    expect(parsed.options).toEqual(wanted);
  });

  it('asks for every class with no class number', () => {
    const url = new URL(rankingPrintPath(7, null, options()), 'http://localhost');
    expect(url.searchParams.get('all')).toBe('1');
    expect(url.searchParams.has('classId')).toBe(false);
    const parsed = parseRankingQuery(Object.fromEntries(url.searchParams.entries()));
    expect(parsed).toMatchObject({ examinationId: 7, classId: null, all: true });
  });

  it('adds the formats and the column headings only when they differ from the standard', () => {
    const plain = new URL(rankingPrintPath(1, 1, options()), 'http://localhost');
    expect(plain.searchParams.has('formats')).toBe(false);
    expect(plain.searchParams.has('columns')).toBe(false);
    const changed = options({ formats: parseRankingFormats('{"title":{"italic":true}}'), columns: { ...STANDARD_RANKING_COLUMNS, grade: 'ថ្នាក់' } });
    const url = new URL(rankingPrintPath(1, 1, changed), 'http://localhost');
    expect(url.searchParams.has('formats')).toBe(true);
    expect(url.searchParams.has('columns')).toBe(true);
    expect(parseRankingQuery(Object.fromEntries(url.searchParams.entries())).options).toEqual(changed);
  });

  it('carries the table colours both ways: coloured unless the address says 0', () => {
    const off = new URL(rankingPrintPath(1, 1, options({ colours: false })), 'http://localhost');
    expect(off.searchParams.get('colours')).toBe('0');
    expect(parseRankingQuery(Object.fromEntries(off.searchParams.entries())).options.colours).toBe(false);
    const on = new URL(rankingPrintPath(1, 1, options({ colours: true })), 'http://localhost');
    expect(on.searchParams.get('colours')).toBe('1');
    expect(parseRankingQuery(Object.fromEntries(on.searchParams.entries())).options.colours).toBe(true);
    expect(parseRankingQuery({ examinationId: '1' }).options.colours).toBe(true);
    expect(parseRankingQuery({ examinationId: '1', colours: 'x' }).options.colours).toBe(true);
  });

  it('falls back to the standard wording and look for anything missing or wrong', () => {
    const parsed = parseRankingQuery({ examinationId: '4', date: 'yesterday', formats: '{{', columns: 'x' });
    expect(parsed.options).toEqual({ ...STANDARD_RANKING_TEXTS, date: '', formats: STANDARD_RANKING_FORMATS, columns: STANDARD_RANKING_COLUMNS, colours: true });
    expect(parsed).toMatchObject({ examinationId: 4, classId: null, all: false });
    expect(parseRankingQuery({}).examinationId).toBe(0);   // no examination in the address: the print page then says it cannot find it
  });

  it('keeps a text box the school emptied empty (an address that says nothing is not the standard wording)', () => {
    const parsed = parseRankingQuery({ examinationId: '1', header: '', title: 'ក' });
    expect(parsed.options.header).toBe('');
    expect(parsed.options.title).toBe('ក');
    expect(parsed.options.stats).toBe(STANDARD_RANKING_TEXTS.stats);
  });
});

describe('sampleRankingRows', () => {
  it('makes eight made-up students with every grade A to F, girls and boys in turn, and the last one not passed', () => {
    const rows = sampleRankingRows((n) => `សិស្សគំរូ ${n}`);
    expect(rows).toHaveLength(8);
    expect(rows.map((r) => r.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(rows.map((r) => r.bandLetter))).toEqual(new Set(['A', 'B', 'C', 'D', 'E', 'F']));
    expect(rows[0]!.gender).toBe('FEMALE');
    expect(rows[1]!.gender).toBe('MALE');
    expect(rows.map((r) => r.passed)).toEqual([true, true, true, true, true, true, true, false]);
    expect(rows.every((r) => r.complete && r.studentId < 0)).toBe(true);
    expect(rankingStats(rows)).toMatchObject({ total: 8, passed: 7, failed: 1, waiting: 0 });
  });
});

describe.skipIf(!existsSync(SETTINGS_JAVA))('the backend\'s side of the same defaults', () => {
  const java = existsSync(SETTINGS_JAVA) ? readFileSync(SETTINGS_JAVA, 'utf8') : '';

  it('ships the same standard wording for the six texts', () => {
    for (const key of RANKING_TEXT_KEYS) {
      const shipped = new RegExp(`new Def\\("ranking\\.${key}", "((?:[^"\\\\]|\\\\.)*)"`).exec(java)?.[1];
      expect(shipped, `ranking.${key} in the backend`).toBeDefined();
      expect(JSON.parse(`"${shipped}"`), `ranking.${key}`).toBe(STANDARD_RANKING_TEXTS[key]);
    }
  });

  it('knows the same six boxes and the same ten column places', () => {
    const boxes = /RANKING_BOXES = List\.of\(([^)]*)\)/.exec(java)?.[1] ?? '';
    expect([...boxes.matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1])).toEqual([...RANKING_TEXT_KEYS]);
    const columns = /RANKING_COLUMNS = List\.of\(([^)]*)\)/.exec(java)?.[1] ?? '';
    expect([...columns.matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1])).toEqual([...RANKING_COLUMN_KEYS]);
  });

  it('has the same longest heading as the page allows', () => {
    expect(java).toContain(`text.length() > ${COLUMN_MAX}`);
  });

  it('starts with no formats or headings saved and "every class" off', () => {
    expect(java).toContain('new Def("ranking.formats", ""');
    expect(java).toContain('new Def("ranking.columns", ""');
    expect(java).toContain('new Def("ranking.allClasses", "false"');
    expect(java).toContain('new Def("ranking.colours", "true"');
  });
});
