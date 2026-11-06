import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventSchema } from '~/schemas/events';
import { amountProblem, feeCategorySchema, feeChargeSchema, feePaymentSchema, feeVoidSchema } from '~/schemas/fees';
import { dashboardApi, schoolEventsApi } from '~/services/dashboardApi';
import { feesApi } from '~/services/feesApi';
import { http } from '~/services/http';
import { reportsApi } from '~/services/reportsApi';
import { usePreferencesStore } from '~/stores/preferences';
import type { AttendanceSummaryRow, ExamResults, FeeClassSummary, RosterRow, StudentResult, StudentRow, Teacher } from '~/types/api';
import { todayIso } from '~/utils/date';
import { convertDigits, keepKhmerNumerals } from '~/utils/khmerNumerals';
import { formatMoney, parseDefaultAmount, parseMoney } from '~/utils/money';
import { attendanceTable, classRosterTable, feesTable, resultsTable, studentListTable, teachersTable, type Translate } from '~/utils/reportTables';

/** field -> first message (a validation code) */
function issues(schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } } }, value: unknown) {
  const result = schema.safeParse(value);
  const out: Record<string, string> = {};
  if (!result.success) for (const issue of result.error?.issues ?? []) out[String(issue.path[0])] ??= issue.message;
  return out;
}

describe('money', () => {
  it('shows riel as whole numbers with the riel sign and dollars with cents', () => {
    expect(formatMoney(15000, 'KHR')).toBe('15,000៛');
    expect(formatMoney(0, 'KHR')).toBe('0៛');
    expect(formatMoney(12.5, 'USD')).toBe('$12.50');
    expect(formatMoney(1234567.8, 'USD')).toBe('$1,234,567.80');
  });

  it('reads typed amounts: Khmer digits, spaces and commas ignored; riel have no decimals, dollars at most two', () => {
    expect(parseMoney('15000', 'KHR')).toBe(15000);
    expect(parseMoney('១៥,០០០', 'KHR')).toBe(15000);
    expect(parseMoney(' 15 000 ', 'KHR')).toBe(15000);
    expect(parseMoney('12.5', 'USD')).toBe(12.5);
    expect(parseMoney('12.50', 'USD')).toBe(12.5);
    expect(parseMoney('១២.៥', 'USD')).toBe(12.5);
  });

  it('refuses what the server would: decimals in riel, three decimals, zero, negatives, letters, empty, absurd sizes', () => {
    for (const bad of ['12.5', '1.', '', ' ', '0', '-5', 'abc', '1e3']) expect(parseMoney(bad, 'KHR'), `KHR ${bad}`).toBeNaN();
    for (const bad of ['12.345', '0', '0.00', '-1', '.5', 'x']) expect(parseMoney(bad, 'USD'), `USD ${bad}`).toBeNaN();
    expect(parseMoney('1000000000001', 'KHR')).toBeNaN();
  });

  it('a default amount may also be empty or 0 ("ask each time")', () => {
    expect(parseDefaultAmount('', 'KHR')).toBe(0);
    expect(parseDefaultAmount('0', 'KHR')).toBe(0);
    expect(parseDefaultAmount('០', 'USD')).toBe(0);
    expect(parseDefaultAmount('15000', 'KHR')).toBe(15000);
    expect(parseDefaultAmount('12.5', 'KHR')).toBeNaN();
  });
});

describe('school event form', () => {
  const ok = { titleKm: 'សប្តាហ៍ប្រឡង', startDate: '2026-11-02', endDate: '', note: '' };

  it('needs a title and a start day; the end day and the note are optional', () => {
    expect(issues(eventSchema, ok)).toEqual({});
    expect(issues(eventSchema, { ...ok, titleKm: ' ', startDate: '' })).toEqual({ titleKm: 'REQUIRED', startDate: 'REQUIRED' });
    expect(issues(eventSchema, { ...ok, titleKm: 'ក'.repeat(151) }).titleKm).toBe('Size');
    expect(issues(eventSchema, { ...ok, note: 'ក'.repeat(501) }).note).toBe('Size');
    expect(issues(eventSchema, { ...ok, startDate: '2026-02-30' }).startDate).toBe('INVALID_DATE');
  });

  it('may end on the day it starts, not before', () => {
    expect(issues(eventSchema, { ...ok, endDate: '2026-11-02' })).toEqual({});
    expect(issues(eventSchema, { ...ok, endDate: '2026-11-01' }).endDate).toBe('END_BEFORE_START');
  });
});

describe('fee forms', () => {
  it('a category needs a name and a currency; the default amount follows the currency (riel have no decimals)', () => {
    const ok = { nameKm: 'ថ្លៃសិក្សា', currency: 'KHR', defaultAmount: '15000' };
    expect(issues(feeCategorySchema, ok)).toEqual({});
    expect(issues(feeCategorySchema, { ...ok, defaultAmount: '' })).toEqual({});
    expect(issues(feeCategorySchema, { ...ok, defaultAmount: '12.5' }).defaultAmount).toBe('INVALID_NUMBER');
    expect(issues(feeCategorySchema, { ...ok, currency: 'USD', defaultAmount: '12.5' })).toEqual({});
    expect(issues(feeCategorySchema, { ...ok, currency: 'USD', defaultAmount: '12.345' }).defaultAmount).toBe('INVALID_NUMBER');
    expect(issues(feeCategorySchema, { ...ok, nameKm: ' ', currency: '' })).toEqual({ nameKm: 'REQUIRED', currency: 'REQUIRED' });
  });

  it('a charge needs a category; an empty amount means the category default', () => {
    const ok = { categoryId: '3', amount: '', dueDate: '', note: '' };
    expect(issues(feeChargeSchema, ok)).toEqual({});
    expect(issues(feeChargeSchema, { ...ok, categoryId: '' }).categoryId).toBe('REQUIRED');
    expect(issues(feeChargeSchema, { ...ok, dueDate: '2026-13-45' }).dueDate).toBe('INVALID_DATE');
    expect(amountProblem('', 'KHR')).toBeNull();
    expect(amountProblem('20000', 'KHR')).toBeNull();
    expect(amountProblem('2.5', 'KHR')).toBe('INVALID_NUMBER');
    expect(amountProblem('2.5', 'USD')).toBeNull();
  });

  it('a payment needs an amount, a real day that is not in the future, a method', () => {
    const ok = { amount: '5000', paidOn: todayIso(), method: 'CASH', reference: '' };
    expect(issues(feePaymentSchema, ok)).toEqual({});
    expect(issues(feePaymentSchema, { ...ok, amount: '', method: '' })).toEqual({ amount: 'REQUIRED', method: 'REQUIRED' });
    expect(issues(feePaymentSchema, { ...ok, paidOn: '2099-01-01' }).paidOn).toBe('FUTURE_DATE');
    expect(issues(feePaymentSchema, { ...ok, paidOn: '2026-02-30' }).paidOn).toBe('INVALID_DATE');
    expect(issues(feePaymentSchema, { ...ok, reference: 'ក'.repeat(101) }).reference).toBe('Size');
  });

  it('voiding needs a reason', () => {
    expect(issues(feeVoidSchema, { reason: 'ព្រីនខុស' })).toEqual({});
    expect(issues(feeVoidSchema, { reason: '  ' }).reason).toBe('REQUIRED');
    expect(issues(feeVoidSchema, { reason: 'ក'.repeat(201) }).reason).toBe('Size');
  });
});

describe('report tables', () => {
  const t: Translate = (key, params) => (params ? `${key}${JSON.stringify(params)}` : key);

  const student = (id: number, nameKm: string, over: Partial<StudentRow> = {}): StudentRow => ({
    id, studentCode: `2026-000${id}`, nameKm, nameEn: null, gender: 'MALE', dateOfBirth: '2019-01-01', status: 'ACTIVE', photoFile: null, enrollmentId: null,
    classId: 1, className: 'ក', gradeId: 1, gradeName: 'ថ្នាក់ទី១', gradeLevel: 1, yearId: 1, yearName: 'Y', ...over,
  });

  it('the student list is in Khmer alphabetical order, numbered, with the class as one text', () => {
    const table = studentListTable(t, [student(1, 'សុខ'), student(2, 'កែវ', { classId: null, className: null, gradeName: null }), student(3, 'ចាន់')], 'ឆ្នាំ');
    expect(table.rows.map((r) => r[2])).toEqual(['កែវ', 'ចាន់', 'សុខ']);
    expect(table.rows.map((r) => r[0])).toEqual([1, 2, 3]);
    expect(table.rows[0]?.[6]).toBeNull();
    expect(table.rows[1]?.[6]).toBe('ថ្នាក់ទី១ ក');
    expect(table.rows[0]?.[4]).toBe('gender.MALE');
    expect(table.columns.map((c) => c.type)).toEqual(['INTEGER', 'TEXT', 'TEXT', 'TEXT', 'TEXT', 'DATE', 'TEXT', 'TEXT']);
    expect(table.rows.every((r) => r.length === table.columns.length)).toBe(true);
  });

  it('the roster and the attendance summary keep every row the length of the columns', () => {
    const roster: RosterRow[] = [{ enrollmentId: 1, studentId: 1, studentCode: 'c1', nameKm: 'សុខ', nameEn: 'S', gender: 'FEMALE', dateOfBirth: '2019-02-02', photoFile: null, studentStatus: 'ACTIVE', status: 'ACTIVE', enrolledOn: '2026-10-01' }];
    const r = classRosterTable(t, roster, 'ថ្នាក់ទី១ ក', 'Y');
    expect(r.rows[0]).toEqual([1, 'c1', 'សុខ', 'S', 'gender.FEMALE', '2019-02-02', '2026-10-01']);
    expect(r.rows[0]?.length).toBe(r.columns.length);
    // 8 sessions on 6 days: one day had two sessions, and the student was present in one and absent in the other (a partial day, not two days)
    const summary: AttendanceSummaryRow[] = [{ enrollmentId: 1, studentId: 1, studentCode: 'c1', nameKm: 'សុខ', present: 5, absent: 1, late: 2, leave: 0, total: 8,
      days: { present: 3, late: 2, partial: 1, absent: 0, leave: 0, total: 6 } }];
    const bySessions = attendanceTable(t, summary, 'ក', 'period', 8, 'SESSION');
    expect(bySessions.rows[0]).toEqual([1, 'c1', 'សុខ', 5, 1, 2, 0, 8]);
    expect(bySessions.columns.length).toBe(8);
    const byDays = attendanceTable(t, summary, 'ក', 'period', 6, 'DAY');
    expect(byDays.rows[0]).toEqual([1, 'c1', 'សុខ', 3, 2, 1, 0, 0, 6]);
    expect(byDays.columns.length).toBe(9);
    expect(byDays.rows[0]?.length).toBe(byDays.columns.length);
    // every count column says its unit, and so does the subtitle: a printed page and an Excel file have no other place to
    expect(byDays.columns.slice(3).map((c) => c.label).every((l) => l.endsWith('(attendance.unit.DAY)') || l === 'attendance.totalDays')).toBe(true);
    expect(bySessions.columns.slice(3, 7).map((c) => c.label).every((l) => l.endsWith('(attendance.unit.SESSION)'))).toBe(true);
    expect(byDays.subtitle).toContain('attendance.basis.DAY');
    expect(bySessions.subtitle).toContain('attendance.basis.SESSION');
  });

  it('teachers: the status label, the date and a phone kept as text', () => {
    const teacher: Teacher = { id: 1, teacherCode: 'T-001', nameKm: 'សុខា', gender: 'FEMALE', phone: '0123456789', address: null, specialization: null, employmentDate: '2015-01-01', status: 'ACTIVE', version: 0 };
    const table = teachersTable(t, [teacher], '');
    expect(table.rows[0]).toEqual([1, 'T-001', 'សុខា', 'gender.FEMALE', '0123456789', null, '2015-01-01', 'teacherStatus.ACTIVE']);
    expect(table.columns.find((c) => c.label === 'common.phone')?.type).toBe('TEXT');
  });

  const result = (id: number, nameKm: string, over: Partial<StudentResult>): StudentResult => ({
    enrollmentId: id, studentId: id, studentCode: `c${id}`, nameKm, scores: [{ examSubjectId: 10, score: 8, absent: false }, { examSubjectId: 11, score: 50, absent: false }],
    total: 58, totalMax: 110, percent: 60, bandLetter: 'D', bandLabel: 'ល្អបង្គួរ', passed: true, rank: 1, complete: true, absentCount: 0, subScores: [], ...over,
  });
  const results: ExamResults = {
    examinationId: 1, classId: 1, passPercent: 50, scaleName: 'S',
    subjects: [{ examSubjectId: 10, subjectId: 1, subjectName: 'ភាសាខ្មែរ', maxScore: 10, weight: 1, scoreSource: 'DIRECT', subSubjects: [] }, { examSubjectId: 11, subjectId: 2, subjectName: 'គណិត', maxScore: 100, weight: 2, scoreSource: 'DIRECT', subSubjects: [] }],
    students: [
      result(1, 'សុខ', { rank: 2, percent: 55 }),
      result(2, 'កែវ', { rank: 1, percent: 90, bandLetter: 'A', bandLabel: 'ល្អប្រសើរ' }),
      result(3, 'ចាន់', { rank: null, percent: null, bandLetter: null, bandLabel: null, passed: null, complete: false, scores: [{ examSubjectId: 10, score: 5, absent: false }, { examSubjectId: 11, score: null, absent: false }] }),
      result(4, 'ដារា', { rank: 3, percent: 52, scores: [{ examSubjectId: 10, score: null, absent: true }, { examSubjectId: 11, score: 60, absent: false }], absentCount: 1 }),
    ],
  };

  it('results by rank: the best first, a shared rank in name order, the incomplete last', () => {
    const table = resultsTable(t, results, { examName: 'E', className: 'C' }, 'rank');
    expect(table.rows.map((r) => r[2])).toEqual(['កែវ', 'សុខ', 'ដារា', 'ចាន់']);
    expect(table.rows.map((r) => r[0])).toEqual([1, 2, 3, null]);
  });

  it('results by name: Khmer alphabetical', () => {
    const table = resultsTable(t, results, { examName: 'E', className: 'C' }, 'name');
    expect(table.rows.map((r) => r[2])).toEqual(['កែវ', 'ចាន់', 'ដារា', 'សុខ']);   // ក ច ដ ស: the order of the Khmer alphabet
  });

  it('results: one number column per subject, a missed subject is empty and named in the notes, an incomplete result says so', () => {
    const table = resultsTable(t, results, { examName: 'E', className: 'C' }, 'name');
    expect(table.columns.slice(3, 5).map((c) => c.label)).toEqual(['ភាសាខ្មែរ (10)', 'គណិត (100)']);
    expect(table.columns.slice(3, 5).every((c) => c.type === 'DECIMAL')).toBe(true);
    const absent = table.rows.find((r) => r[2] === 'ដារា')!;
    expect(absent.slice(3, 5)).toEqual([null, 60]);
    expect(absent.at(-1)).toBe('exams.absent: ភាសាខ្មែរ');
    const incomplete = table.rows.find((r) => r[2] === 'ចាន់')!;
    expect(incomplete.slice(3, 5)).toEqual([5, null]);
    expect(incomplete.at(-2)).toBe('exams.incomplete');
    expect(incomplete.at(-1)).toBeNull();
    const best = table.rows.find((r) => r[2] === 'កែវ')!;
    expect(best.at(-4)).toBe(90);   // the percentage
    expect(best.at(-3)).toBe('A · ល្អប្រសើរ');
    expect(best.at(-2)).toBe('exams.passed');
    expect(table.rows.every((r) => r.length === table.columns.length)).toBe(true);
  });

  const summary: FeeClassSummary = {
    classId: 1,
    rows: [
      { enrollmentId: 1, studentId: 1, studentCode: 'c1', nameKm: 'សុខ', totals: [{ currency: 'KHR', due: 40000, paid: 15000, balance: 25000 }] },
      { enrollmentId: 2, studentId: 2, studentCode: 'c2', nameKm: 'កែវ', totals: [] },
    ],
    totals: [{ currency: 'KHR', due: 40000, paid: 15000, balance: 25000 }],
  };

  it('fees in riel: three columns, a student without a charge shows zeros, and a total row closes the table', () => {
    const table = feesTable(t, summary, 'ក', ['KHR']);
    expect(table.columns.map((c) => c.label)).toEqual(['print.attendance.number', 'students.code', 'students.nameKm', 'fees.due', 'fees.paid', 'fees.balance']);
    expect(table.rows[0]).toEqual([1, 'c2', 'កែវ', 0, 0, 0]);
    expect(table.rows[1]).toEqual([2, 'c1', 'សុខ', 40000, 15000, 25000]);
    expect(table.rows[2]).toEqual([null, null, 'fees.classTotal', 40000, 15000, 25000]);
  });

  it('fees in two currencies: a set of three columns per currency that appears, named with the currency', () => {
    const both: FeeClassSummary = { ...summary, totals: [...summary.totals, { currency: 'USD', due: 12.5, paid: 0, balance: 12.5 }] };
    const table = feesTable(t, both, 'ក', ['KHR', 'USD']);
    expect(table.columns.slice(3).map((c) => c.label)).toEqual(['fees.due (KHR)', 'fees.paid (KHR)', 'fees.balance (KHR)', 'fees.due (USD)', 'fees.paid (USD)', 'fees.balance (USD)']);
    expect(table.rows.at(-1)).toEqual([null, null, 'fees.classTotal', 40000, 15000, 25000, 12.5, 0, 12.5]);
    expect(table.rows.every((r) => r.length === table.columns.length)).toBe(true);
  });
});

describe('Khmer numerals on a printed page', () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
  const page = (html: string): HTMLElement => {
    const root = document.createElement('div');
    root.innerHTML = html;
    document.body.append(root);
    return root;
  };

  it('turns the digits of text into Khmer digits and leaves the toolbar, inputs and marked parts alone', () => {
    const root = page('<p id="a">2026-0001 · 31 តុលា</p><div class="no-print">2026</div><input value="123"><span data-keep-digits>77</span><textarea>55</textarea>');
    convertDigits(root);
    expect(root.querySelector('#a')?.textContent).toBe('២០២៦-០០០១ · ៣១ តុលា');
    expect(root.querySelector('.no-print')?.textContent).toBe('2026');
    expect(root.querySelector('span')?.textContent).toBe('77');
    expect(root.querySelector('textarea')?.textContent).toBe('55');
    expect(root.querySelector('input')?.value).toBe('123');
  });

  it('keeps converting what is added or changed later (a page fills in after its data loads) until it is stopped', async () => {
    const root = page('<p id="a">1</p>');
    const stop = keepKhmerNumerals(root);
    expect(root.querySelector('#a')?.textContent).toBe('១');
    const added = document.createElement('p');
    added.textContent = 'ចំនួន 12';
    root.append(added);
    root.querySelector('#a')!.firstChild!.nodeValue = '99';
    await tick();
    expect(added.textContent).toBe('ចំនួន ១២');
    expect(root.querySelector('#a')?.textContent).toBe('៩៩');
    stop();
    const later = document.createElement('p');
    later.textContent = '34';
    root.append(later);
    await tick();
    expect(later.textContent).toBe('34');
  });
});

describe('the printed-report and fee settings', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('are off by default and read from the settings', () => {
    const prefs = usePreferencesStore();
    expect(prefs.khmerNumerals).toBe(false);
    expect(prefs.moeysHeader).toBe(false);
    expect(prefs.headerLines).toEqual([]);
    expect(prefs.feesEnabled).toBe(false);
    expect(prefs.feeCurrencies).toEqual(['KHR']);
    prefs.values = {
      'report.khmerNumerals': 'true', 'report.moeysHeader': 'true', 'report.headerLine1': ' ព្រះរាជាណាចក្រកម្ពុជា ', 'report.headerLine2': '', 'report.headerLine3': 'ខេត្តកណ្តាល',
      'fees.enabled': 'true', 'fees.currencies': 'KHR,USD',
    };
    expect(prefs.khmerNumerals).toBe(true);
    expect(prefs.moeysHeader).toBe(true);
    expect(prefs.headerLines).toEqual(['ព្រះរាជាណាចក្រកម្ពុជា', 'ខេត្តកណ្តាល']);
    expect(prefs.feesEnabled).toBe(true);
    expect(prefs.feeCurrencies).toEqual(['KHR', 'USD']);
  });

  it('ignore a currency the app does not know', () => {
    const prefs = usePreferencesStore();
    prefs.values = { 'fees.currencies': 'EUR' };
    expect(prefs.feeCurrencies).toEqual(['KHR']);

    // the preferred currency (KHR until chosen): first when both are allowed, ignored when it is not allowed or only one is
    prefs.values = { 'fees.currencies': 'KHR,USD' };
    expect(prefs.feeDefaultCurrency).toBe('KHR');
    expect(prefs.feeCurrencies).toEqual(['KHR', 'USD']);
    prefs.values = { 'fees.currencies': 'KHR,USD', 'fees.defaultCurrency': 'USD' };
    expect(prefs.feeDefaultCurrency).toBe('USD');
    expect(prefs.feeCurrencies).toEqual(['USD', 'KHR']);
    prefs.values = { 'fees.currencies': 'USD,KHR', 'fees.defaultCurrency': 'KHR' };
    expect(prefs.feeCurrencies).toEqual(['KHR', 'USD']);
    prefs.values = { 'fees.currencies': 'KHR', 'fees.defaultCurrency': 'USD' };
    expect(prefs.feeCurrencies).toEqual(['KHR']);
    prefs.values = { 'fees.currencies': 'USD', 'fees.defaultCurrency': 'KHR' };
    expect(prefs.feeCurrencies).toEqual(['USD']);
    prefs.values = { 'fees.currencies': 'KHR,USD', 'fees.defaultCurrency': 'EUR' };
    expect(prefs.feeDefaultCurrency).toBe('KHR');
  });
});

// The clients must call exactly the endpoints the Phase 4 controllers serve (method, path, body).
describe('Phase 4 API clients', () => {
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

  const charge = { categoryId: 3, amount: null, dueDate: '2026-11-30', note: null };
  const table = { sheetName: 'S', title: 'T', subtitle: '', columns: [{ label: 'a', type: 'TEXT' as const }], rows: [['x']] };

  it.each([
    ['dashboard', () => dashboardApi.get(), 'GET', '/dashboard', undefined],
    ['events list', () => schoolEventsApi.list({ from: '2026-11-01', limit: 5 }), 'GET', '/school-events?from=2026-11-01&limit=5', undefined],
    ['events list (all)', () => schoolEventsApi.list(), 'GET', '/school-events', undefined],
    ['event create', () => schoolEventsApi.create({ titleKm: 'ក', startDate: '2026-11-02', endDate: null, note: null }), 'POST', '/school-events', { titleKm: 'ក', startDate: '2026-11-02', endDate: null, note: null }],
    ['event update', () => schoolEventsApi.update(4, { titleKm: 'ក', startDate: '2026-11-02', endDate: null, note: null }, 2), 'PUT', '/school-events/4', { titleKm: 'ក', startDate: '2026-11-02', endDate: null, note: null, version: 2 }],
    ['event remove', () => schoolEventsApi.remove(4), 'DELETE', '/school-events/4', undefined],

    ['fee categories', () => feesApi.categories(), 'GET', '/fees/categories', undefined],
    ['fee category create', () => feesApi.createCategory({ nameKm: 'ក', defaultAmount: 15000, currency: 'KHR' }), 'POST', '/fees/categories', { nameKm: 'ក', defaultAmount: 15000, currency: 'KHR' }],
    ['fee category update', () => feesApi.updateCategory(2, { nameKm: 'ក', defaultAmount: null, currency: 'USD' }, 5), 'PUT', '/fees/categories/2', { nameKm: 'ក', defaultAmount: null, currency: 'USD', version: 5 }],
    ['fee category active', () => feesApi.setCategoryActive(2, false, 5), 'PUT', '/fees/categories/2/active', { active: false, version: 5 }],
    ['fees of a class', () => feesApi.classSummary(3), 'GET', '/fees/class?classId=3', undefined],
    ['fee ledger', () => feesApi.ledger(7), 'GET', '/fees/enrollments/7', undefined],
    ['fee charge', () => feesApi.charge(7, charge), 'POST', '/fees/charges', { enrollmentId: 7, ...charge }],
    ['fee charge class', () => feesApi.chargeClass(3, charge), 'POST', '/fees/charges/class', { classId: 3, ...charge }],
    ['fee charge update', () => feesApi.updateCharge(9, { amount: 16000, dueDate: null, note: null }, 1), 'PUT', '/fees/charges/9', { amount: 16000, dueDate: null, note: null, version: 1 }],
    ['fee charge delete', () => feesApi.deleteCharge(9), 'DELETE', '/fees/charges/9', undefined],
    ['fee payment', () => feesApi.pay(9, { amount: 5000, paidOn: '2026-11-02', method: 'CASH', reference: null }), 'POST', '/fees/charges/9/payments', { amount: 5000, paidOn: '2026-11-02', method: 'CASH', reference: null }],
    ['fee payment void', () => feesApi.voidPayment(11, 'ព្រីនខុស'), 'POST', '/fees/payments/11/void', { reason: 'ព្រីនខុស' }],
    ['fee receipt', () => feesApi.receipt(11), 'GET', '/fees/payments/11/receipt', undefined],

    ['report export', () => reportsApi.exportTable(table), 'POST', '/reports/export', table],
  ])('%s', async (_name, call, method, path, body) => {
    await call();
    expect(last()).toEqual({ url: `http://127.0.0.1:5555/api/v1${path}`, method, body });
  });
});
