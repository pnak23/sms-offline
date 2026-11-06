import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bandProblems, gradingScaleSchema, MAX_BANDS, percentProblem } from '~/schemas/grading';
import { examSchema, positiveAmountProblem, termOf } from '~/schemas/exam';
import { homeworkSchema } from '~/schemas/homework';
import { attendanceApi } from '~/services/attendanceApi';
import { examsApi } from '~/services/examsApi';
import { gradingApi } from '~/services/gradingApi';
import { homeworkApi } from '~/services/homeworkApi';
import { http } from '~/services/http';
import { reportCardsApi } from '~/services/reportCardsApi';
import { monthStartIso, todayIso } from '~/utils/date';
import { formatNumber, parseDecimal, parseWholeNumberInRange } from '~/utils/score';

/** field -> first message (a validation code) */
function issues(schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } } }, value: unknown) {
  const result = schema.safeParse(value);
  const out: Record<string, string> = {};
  if (!result.success) for (const issue of result.error?.issues ?? []) out[String(issue.path[0])] ??= issue.message;
  return out;
}

describe('typed scores', () => {
  it('accepts up to two decimals, Khmer digits and a decimal comma', () => {
    expect(parseDecimal('8.5')).toBe(8.5);
    expect(parseDecimal(' 100 ')).toBe(100);
    expect(parseDecimal('៨.៥')).toBe(8.5);
    expect(parseDecimal('7,25')).toBe(7.25);
    expect(parseDecimal('0')).toBe(0);
  });

  it('rejects what the backend would (three decimals, signs, letters, empty)', () => {
    for (const bad of ['7.255', '-1', '+1', 'abc', '', ' ', '1e3', '1.', '.5', '1 000', '1234567']) expect(parseDecimal(bad), bad).toBeNaN();
  });

  it('shows at most two decimals without trailing zeros', () => {
    expect(formatNumber(8.5)).toBe('8.5');
    expect(formatNumber(100)).toBe('100');
    expect(formatNumber(52.857)).toBe('52.86');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(null)).toBe('');
    expect(formatNumber(undefined)).toBe('');
  });

  it('reads whole numbers inside a range', () => {
    expect(parseWholeNumberInRange('៣', 1, 12)).toBe(3);
    expect(parseWholeNumberInRange('13', 1, 12)).toBe('range');
    expect(parseWholeNumberInRange('0', 1, 12)).toBe('range');
    expect(parseWholeNumberInRange('x', 1, 12)).toBe('invalid');
    expect(parseWholeNumberInRange('', 1, 12)).toBe('invalid');
    expect(parseWholeNumberInRange('1.5', 1, 12)).toBe('invalid');
  });
});

describe('dates on the PC calendar', () => {
  it('formats a given day as YYYY-MM-DD and finds the first of its month', () => {
    expect(todayIso(new Date(2026, 9, 31, 23, 59))).toBe('2026-10-31');
    expect(monthStartIso(new Date(2026, 9, 31))).toBe('2026-10-01');
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('examination form', () => {
  const ok = { nameKm: 'ប្រឡងប្រចាំខែតុលា', kind: 'MONTHLY', termNo: '', startDate: '', endDate: '' };

  it('needs a name and a kind; the term and dates are optional', () => {
    expect(issues(examSchema, ok)).toEqual({});
    expect(issues(examSchema, { ...ok, nameKm: ' ', kind: '' })).toEqual({ nameKm: 'REQUIRED', kind: 'REQUIRED' });
    expect(issues(examSchema, { ...ok, nameKm: 'ក'.repeat(101) }).nameKm).toBe('Size');
  });

  it('keeps the term between 1 and 12 and accepts Khmer digits', () => {
    expect(issues(examSchema, { ...ok, termNo: '៣' })).toEqual({});
    expect(issues(examSchema, { ...ok, termNo: '0' }).termNo).toBe('OUT_OF_RANGE');
    expect(issues(examSchema, { ...ok, termNo: '13' }).termNo).toBe('OUT_OF_RANGE');
    expect(issues(examSchema, { ...ok, termNo: 'x' }).termNo).toBe('INVALID_NUMBER');
    expect(termOf('')).toBeNull();
    expect(termOf('៣')).toBe(3);
  });

  it('may end on the day it starts, but not before', () => {
    expect(issues(examSchema, { ...ok, startDate: '2026-11-01', endDate: '2026-11-01' })).toEqual({});
    expect(issues(examSchema, { ...ok, startDate: '2026-11-02', endDate: '2026-11-01' }).endDate).toBe('END_BEFORE_START');
    expect(issues(examSchema, { ...ok, startDate: '2026-02-30' }).startDate).toBe('INVALID_DATE');
  });

  it('checks a maximum score or weight: a number above 0 and not above 100000', () => {
    expect(positiveAmountProblem('100')).toBeNull();
    expect(positiveAmountProblem('0.5')).toBeNull();
    expect(positiveAmountProblem('0')).toBe('OUT_OF_RANGE');
    expect(positiveAmountProblem('100001')).toBe('OUT_OF_RANGE');
    expect(positiveAmountProblem('abc')).toBe('INVALID_NUMBER');
    expect(positiveAmountProblem('')).toBe('INVALID_NUMBER');
  });
});

describe('grading scale form', () => {
  const band = (minPercent: string, labelKm = 'ល្អ', letter = 'A') => ({ minPercent, labelKm, letter });

  it('needs a name and a pass mark from 0 to 100', () => {
    expect(issues(gradingScaleSchema, { nameKm: 'ស្តង់ដារ', passPercent: '50' })).toEqual({});
    expect(issues(gradingScaleSchema, { nameKm: 'ស្តង់ដារ', passPercent: '45.5' })).toEqual({});
    expect(issues(gradingScaleSchema, { nameKm: ' ', passPercent: '' })).toEqual({ nameKm: 'REQUIRED', passPercent: 'REQUIRED' });
    expect(issues(gradingScaleSchema, { nameKm: 'ក', passPercent: '50.555' }).passPercent).toBe('INVALID_NUMBER');
    expect(issues(gradingScaleSchema, { nameKm: 'ក', passPercent: '100.01' }).passPercent).toBe('OUT_OF_RANGE');
    expect(issues(gradingScaleSchema, { nameKm: 'ក', passPercent: '101' }).passPercent).toBe('OUT_OF_RANGE');
    expect(percentProblem('0')).toBeNull();
    expect(percentProblem('100')).toBeNull();
  });

  it('accepts bands where one starts at 0', () => {
    const result = bandProblems([band('90', 'ល្អប្រសើរ', 'A'), band('0', 'ខ្សោយ', 'F')]);
    expect(result).toEqual({ rows: {}, general: null, ok: true });
  });

  it('reports each row problem next to its row', () => {
    const result = bandProblems([band('', 'ល្អ', 'A'), band('0', ' ', ''), band('x', 'ល្អ', 'B')]);
    expect(result.ok).toBe(false);
    expect(result.rows).toEqual({
      0: { minPercent: 'REQUIRED' },
      1: { labelKm: 'REQUIRED', letter: 'REQUIRED' },
      2: { minPercent: 'INVALID_NUMBER' },
    });
  });

  it('refuses two bands with the same minimum (the second one is flagged)', () => {
    const result = bandProblems([band('50'), band('0'), band('50.00', 'ល្អ', 'C')]);
    expect(result.rows).toEqual({ 2: { minPercent: 'DUPLICATE' } });
    expect(result.ok).toBe(false);
  });

  it('needs a band at 0 so every score falls into one, at least one band, and at most twelve', () => {
    expect(bandProblems([band('10')]).general).toBe('BAND_ZERO_REQUIRED');
    expect(bandProblems([]).general).toBe('BANDS_REQUIRED');
    const many = Array.from({ length: MAX_BANDS + 1 }, (_, i) => band(String(i)));
    expect(bandProblems(many).general).toBe('INVALID');
    expect(bandProblems(Array.from({ length: MAX_BANDS }, (_, i) => band(String(i), 'ល្អ', String(i)))).ok).toBe(true);
  });

  it('limits the label to 50 and the letter to 5 characters', () => {
    expect(bandProblems([band('0', 'ក'.repeat(51), 'A')]).rows[0]).toEqual({ labelKm: 'Size' });
    expect(bandProblems([band('0', 'ក', 'ABCDEF')]).rows[0]).toEqual({ letter: 'Size' });
  });
});

describe('homework form', () => {
  const ok = { classId: '1', subjectId: '2', title: 'លំហាត់ទំព័រ ១២', description: '', assignedDate: '2026-11-02', dueDate: '2026-11-04', remark: '' };

  it('needs a class, a subject, a title and both dates', () => {
    expect(issues(homeworkSchema, ok)).toEqual({});
    expect(issues(homeworkSchema, { ...ok, classId: '', subjectId: '', title: ' ', assignedDate: '', dueDate: '' })).toEqual({
      classId: 'REQUIRED', subjectId: 'REQUIRED', title: 'REQUIRED', assignedDate: 'REQUIRED', dueDate: 'REQUIRED',
    });
    expect(issues(homeworkSchema, { ...ok, dueDate: '2026-02-30' }).dueDate).toBe('INVALID_DATE');
  });

  it('may be due the day it is given, not before', () => {
    expect(issues(homeworkSchema, { ...ok, dueDate: '2026-11-02' })).toEqual({});
    expect(issues(homeworkSchema, { ...ok, dueDate: '2026-11-01' }).dueDate).toBe('DUE_BEFORE_ASSIGNED');
  });

  it('has marks only when "has a score" is on, and then needs a maximum above zero (typed, never defaulted)', () => {
    expect(issues(homeworkSchema, { ...ok, scored: false, maxScore: '' })).toEqual({});
    expect(issues(homeworkSchema, { ...ok, scored: false, maxScore: 'abc' })).toEqual({});   // ignored while it is a record only
    expect(issues(homeworkSchema, { ...ok, scored: true, maxScore: '10' })).toEqual({});
    expect(issues(homeworkSchema, { ...ok, scored: true, maxScore: '8.5' })).toEqual({});
    expect(issues(homeworkSchema, { ...ok, scored: true, maxScore: '' }).maxScore).toBe('REQUIRED');
    expect(issues(homeworkSchema, { ...ok, scored: true }).maxScore).toBe('REQUIRED');
    expect(issues(homeworkSchema, { ...ok, scored: true, maxScore: 'abc' }).maxScore).toBe('INVALID_NUMBER');
    expect(issues(homeworkSchema, { ...ok, scored: true, maxScore: '10.123' }).maxScore).toBe('INVALID_NUMBER');
    expect(issues(homeworkSchema, { ...ok, scored: true, maxScore: '0' }).maxScore).toBe('OUT_OF_RANGE');
    expect(issues(homeworkSchema, { ...ok, scored: true, maxScore: '100001' }).maxScore).toBe('OUT_OF_RANGE');
  });
});

// The clients must call exactly the endpoints the Phase 3 controllers serve (method, path, body).
describe('Phase 3 API clients', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    http.configure({ baseUrl: 'http://127.0.0.1:5555', getToken: () => 'token', fetch: fetchMock as unknown as typeof fetch });
  });

  const last = () => {
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    return { url, method: init.method, body: init.body ? JSON.parse(String(init.body)) : undefined };
  };

  const exam = { nameKm: 'ប្រឡងខែ១', kind: 'MONTHLY' as const, termNo: 1, startDate: '2026-11-01', endDate: null };
  const band = { minPercent: 0, labelKm: 'ខ្សោយ', letter: 'F' };
  const homework = { classId: 3, subjectId: 4, title: 'ក', description: null, assignedDate: '2026-11-02', dueDate: '2026-11-04', remark: null, maxScore: null };

  it.each([
    ['attendance sheet', () => attendanceApi.sheet(3, '2026-11-02'), 'GET', '/attendance/sheet?classId=3&date=2026-11-02', undefined],
    ['attendance sheet of one session', () => attendanceApi.sheet(3, '2026-11-02', 12), 'GET', '/attendance/sheet?classId=3&date=2026-11-02&periodId=12', undefined],
    [
      'attendance save',
      () => attendanceApi.save(3, '2026-11-02', 12, null, [{ enrollmentId: 7, status: 'LATE', remark: null }]),
      'PUT', '/attendance/sheet', { classId: 3, date: '2026-11-02', periodId: 12, note: null, records: [{ enrollmentId: 7, status: 'LATE', remark: null }] },
    ],
    ['attendance sessions', () => attendanceApi.sessions(3, '2026-11-01', '2026-11-30'), 'GET', '/attendance/sessions?classId=3&from=2026-11-01&to=2026-11-30', undefined],
    ['attendance summary', () => attendanceApi.summary(3, '2026-11-01', '2026-11-30'), 'GET', '/attendance/summary?classId=3&from=2026-11-01&to=2026-11-30', undefined],
    ['student attendance', () => attendanceApi.forStudent(9, '2026-11-01', '2026-11-30'), 'GET', '/students/9/attendance?from=2026-11-01&to=2026-11-30', undefined],

    ['exams list', () => examsApi.list(2), 'GET', '/examinations?yearId=2', undefined],
    ['exams list (all years)', () => examsApi.list(), 'GET', '/examinations', undefined],
    ['exam get', () => examsApi.get(5), 'GET', '/examinations/5', undefined],
    ['exam create', () => examsApi.create(2, exam), 'POST', '/examinations', { academicYearId: 2, ...exam }],
    ['exam update', () => examsApi.update(5, exam, 3), 'PUT', '/examinations/5', { ...exam, version: 3 }],
    ['exam remove', () => examsApi.remove(5), 'DELETE', '/examinations/5', undefined],
    ['exam subjects', () => examsApi.subjects(5), 'GET', '/examinations/5/subjects', undefined],
    ['exam add subject', () => examsApi.addSubject(5, { gradeId: 1, subjectId: 2, maxScore: 10, weight: 1 }), 'POST', '/examinations/5/subjects', { gradeId: 1, subjectId: 2, maxScore: 10, weight: 1 }],
    ['exam update subject', () => examsApi.updateSubject(5, 8, { maxScore: 20, weight: 2 }), 'PUT', '/examinations/5/subjects/8', { maxScore: 20, weight: 2 }],
    ['exam remove subject', () => examsApi.removeSubject(5, 8), 'DELETE', '/examinations/5/subjects/8', undefined],
    ['score sheet', () => examsApi.scoreSheet(5, 3, 4), 'GET', '/examinations/5/scores?classId=3&subjectId=4', undefined],
    [
      'save scores',
      () => examsApi.saveScores(5, 3, 4, [{ enrollmentId: 7, score: 8.5, absent: false, remark: null }, { enrollmentId: 8, score: null, absent: true, remark: null }]),
      'PUT', '/examinations/5/scores',
      { classId: 3, subjectId: 4, scores: [{ enrollmentId: 7, score: 8.5, absent: false, remark: null }, { enrollmentId: 8, score: null, absent: true, remark: null }] },
    ],
    ['results', () => examsApi.results(5, 3), 'GET', '/examinations/5/results?classId=3', undefined],
    ['student results', () => examsApi.studentResults(9), 'GET', '/students/9/results', undefined],

    ['grading list', () => gradingApi.list(), 'GET', '/grading-scales', undefined],
    ['grading create', () => gradingApi.create({ nameKm: 'ក', passPercent: 50, bands: [band] }), 'POST', '/grading-scales', { nameKm: 'ក', passPercent: 50, bands: [band] }],
    ['grading update', () => gradingApi.update(2, { nameKm: 'ក', passPercent: 40, bands: [band] }, 6), 'PUT', '/grading-scales/2', { nameKm: 'ក', passPercent: 40, bands: [band], version: 6 }],
    ['grading default', () => gradingApi.setDefault(2), 'POST', '/grading-scales/2/set-default', undefined],

    ['report cards of a class', () => reportCardsApi.data(5, 3), 'GET', '/report-cards/data?examinationId=5&classId=3', undefined],
    ['report card of a student', () => reportCardsApi.data(5, 3, 9), 'GET', '/report-cards/data?examinationId=5&classId=3&studentId=9', undefined],
    ['report card comment', () => reportCardsApi.saveComment(5, 7, 'ល្អ'), 'PUT', '/report-cards/comment', { examinationId: 5, enrollmentId: 7, comment: 'ល្អ' }],

    ['homework list', () => homeworkApi.list({ classId: 3, status: 'DONE', from: '2026-11-01', to: '2026-11-30' }), 'GET', '/homework?classId=3&status=DONE&from=2026-11-01&to=2026-11-30', undefined],
    ['homework list (no filters)', () => homeworkApi.list(), 'GET', '/homework', undefined],
    ['homework list (class cleared)', () => homeworkApi.list({ classId: null, status: undefined }), 'GET', '/homework', undefined],
    ['homework get', () => homeworkApi.get(4), 'GET', '/homework/4', undefined],
    ['homework create', () => homeworkApi.create(homework), 'POST', '/homework', homework],
    ['homework update', () => homeworkApi.update(4, homework, 2), 'PUT', '/homework/4', { ...homework, version: 2 }],
    ['homework status', () => homeworkApi.setStatus(4, 'DONE', 2), 'PUT', '/homework/4/status', { status: 'DONE', version: 2 }],
  ])('%s', async (_name, call, method, path, body) => {
    await call();
    expect(last()).toEqual({ url: `http://127.0.0.1:5555/api/v1${path}`, method, body });
  });
});
