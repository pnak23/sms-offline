// The change round after Phase 5: system identity and version, the readiness (acceptance) states, and the full-width layout.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attendancePeriodSchema, normalizeClock } from '~/schemas/attendance';
import { acceptanceApi } from '~/services/acceptanceApi';
import { attendanceApi } from '~/services/attendanceApi';
import { attendancePeriodsApi } from '~/services/attendancePeriodsApi';
import { http } from '~/services/http';
import { systemApi } from '~/services/systemApi';
import { useAcceptanceStore } from '~/stores/acceptance';
import { useProductStore } from '~/stores/product';
import { usePreferencesStore } from '~/stores/preferences';
import type { AcceptanceItem, AttendanceSession } from '~/types/api';
import { isSignedOff, stateOf, stateVariant, summarize } from '~/utils/acceptance';
import { ATTENDANCE_BASES, columnLabels, countsOf, isBasis, isClockTime, periodLabel, recordedDays, statusColumns, timeRange } from '~/utils/attendance';
import { DEFAULT_CARD_OPTIONS, cardOptionsFrom, cardSettingsOf, orderSubjects, type ReportCardOptions } from '~/utils/reportCardOptions';
import { sampleReportCard } from '~/utils/sampleReportCard';

const FRONTEND = path.resolve(__dirname, '..');
const km = JSON.parse(readFileSync(path.join(FRONTEND, 'i18n', 'locales', 'km.json'), 'utf8')) as Record<string, unknown>;
const has = (key: string) => typeof key.split('.').reduce<unknown>((n, p) => (n as Record<string, unknown> | undefined)?.[p], km) === 'string';
const shipped = JSON.parse(readFileSync(path.resolve(FRONTEND, '..', 'release', 'acceptance.json'), 'utf8')) as { items: { id: string }[] };

const item = (over: Partial<AcceptanceItem>): AcceptanceItem => ({ id: 'usb-backup', group: 'hardware', development: 'COMPLETED', pending: 'PHYSICAL_TESTING', signOff: null, ...over });
const signed = { signedBy: 'សុខា', at: '2026-11-01T01:00:00Z', note: null };

describe('the five states', () => {
  it('an item is pending for exactly one reason until the administrator signs it off', () => {
    expect(stateOf(item({}))).toBe('PHYSICAL_TESTING_PENDING');
    expect(stateOf(item({ pending: 'CONFIGURATION' }))).toBe('CONFIGURATION_PENDING');
    expect(stateOf(item({ pending: 'OFFICIAL_INFORMATION' }))).toBe('OFFICIAL_INFORMATION_PENDING');
    expect(stateOf(item({ signOff: signed }))).toBe('FINAL_ACCEPTANCE_COMPLETED');
  });

  it('counts each state separately, and "development completed" is a different count from "accepted"', () => {
    const items = [
      item({ id: 'a', development: 'IN_PROGRESS', pending: 'CONFIGURATION' }),
      item({ id: 'b', pending: 'OFFICIAL_INFORMATION' }),
      item({ id: 'c', pending: 'OFFICIAL_INFORMATION' }),
      item({ id: 'd', pending: 'PHYSICAL_TESTING' }),
      item({ id: 'e', pending: 'PHYSICAL_TESTING', signOff: signed }),
    ];
    expect(summarize(items)).toEqual({ total: 5, developmentCompleted: 4, configurationPending: 1, officialInformationPending: 2, physicalTestingPending: 1, finalAccepted: 1 });
    expect(summarize([])).toEqual({ total: 0, developmentCompleted: 0, configurationPending: 0, officialInformationPending: 0, physicalTestingPending: 0, finalAccepted: 0 });
  });

  it('nothing is assumed accepted: an unknown item, an empty list or a list not loaded yet is "not signed"', () => {
    expect(isSignedOff([], 'grading-rules')).toBe(false);
    expect(isSignedOff([item({ id: 'grading-rules' })], 'grading-rules')).toBe(false);
    expect(isSignedOff([item({ id: 'grading-rules', signOff: signed })], 'grading-rules')).toBe(true);
    expect(isSignedOff([item({ id: 'grading-rules', signOff: signed })], 'fee-currency')).toBe(false);
  });

  it('every state has a colour and the accepted one is the only green', () => {
    expect(stateVariant('FINAL_ACCEPTANCE_COMPLETED')).toBe('success');
    for (const s of ['CONFIGURATION_PENDING', 'OFFICIAL_INFORMATION_PENDING', 'PHYSICAL_TESTING_PENDING'] as const) expect(stateVariant(s)).not.toBe('success');
  });
});

describe('Khmer wording for the readiness screens', () => {
  it('has a title and "what closes it" for every item the program ships with, and every state and group', () => {
    const wanted = [
      ...shipped.items.flatMap((i) => [`acceptance.item.${i.id}.title`, `acceptance.item.${i.id}.closes`]),
      ...['CONFIGURATION_PENDING', 'OFFICIAL_INFORMATION_PENDING', 'PHYSICAL_TESTING_PENDING', 'FINAL_ACCEPTANCE_COMPLETED'].map((s) => `acceptance.state.${s}`),
      ...['COMPLETED', 'IN_PROGRESS'].map((s) => `acceptance.development.${s}`),
      ...['information', 'hardware'].map((g) => `acceptance.group.${g}`),
      ...['shell', 'chromium', 'java', 'spring', 'sqlite', 'schema', 'os'].map((k) => `about.tech.${k}`),
    ];
    expect(wanted.filter((k) => !has(k))).toEqual([]);
  });
});

describe('the clients ask exactly the endpoints the backend serves', () => {
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

  it.each([
    ['about', () => systemApi.about(), 'GET', '/system/about', undefined],
    ['acceptance list', () => acceptanceApi.list(), 'GET', '/acceptance', undefined],
    ['sign off', () => acceptanceApi.signOff('usb-backup', 'ពិនិត្យរួច'), 'POST', '/acceptance/usb-backup/sign-off', { note: 'ពិនិត្យរួច' }],
    ['sign off without a note', () => acceptanceApi.signOff('usb-backup', null), 'POST', '/acceptance/usb-backup/sign-off', { note: null }],
    ['withdraw', () => acceptanceApi.withdraw('usb-backup'), 'DELETE', '/acceptance/usb-backup/sign-off', undefined],
  ])('%s', async (_name, call, method, p, body) => {
    await call();
    expect(last()).toEqual({ url: `http://127.0.0.1:5555/api/v1${p}`, method, body });
  });
});

describe('the stores', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('the product store asks the backend once and shows "KPSMS v1.0.0"; a backend that is down is not an error on the sign-in screen', async () => {
    const identity = { name: 'Khmer Primary School Management System', shortName: 'KPSMS', developer: 'PHEA NAK', version: '1.0.0', channel: 'Stable', copyright: '© 2026 PHEA NAK. All rights reserved.' };
    const spy = vi.spyOn(systemApi, 'about').mockResolvedValue(identity);
    const store = useProductStore();
    expect(store.shortLabel).toBe('');
    await store.load();
    await store.load();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(store.shortLabel).toBe('KPSMS v1.0.0');
    spy.mockRestore();

    setActivePinia(createPinia());
    vi.spyOn(systemApi, 'about').mockRejectedValue(new Error('down'));
    const quiet = useProductStore();
    await expect(quiet.load()).resolves.toBeUndefined();
    expect(quiet.info).toBeNull();
  });

  it('the acceptance store treats "not loaded yet" as not signed (a slow request never makes a placeholder look official)', async () => {
    const store = useAcceptanceStore();
    expect(store.signed('grading-rules')).toBe(false);
    vi.spyOn(acceptanceApi, 'list').mockResolvedValue([item({ id: 'grading-rules', signOff: signed }), item({ id: 'fee-currency' })]);
    await store.load();
    expect(store.loaded).toBe(true);
    expect(store.signed('grading-rules')).toBe(true);
    expect(store.signed('fee-currency')).toBe(false);
    expect(store.summary.finalAccepted).toBe(1);
    store.reset();
    expect(store.signed('grading-rules')).toBe(false);
    expect(store.loaded).toBe(false);
  });
});

describe('the layout fills the window', () => {
  const css = readFileSync(path.join(FRONTEND, 'app', 'assets', 'css', 'layout.css'), 'utf8');
  const rule = (selector: string) => new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';

  it('a normal page has no width cap and is not centred in a wide window; only forms keep a readable width, from the left', () => {
    const base = rule('.page-container');
    expect(base).not.toMatch(/max-width/);
    expect(base).not.toMatch(/margin:\s*0\s+auto/);
    expect(rule('.page-container.is-form')).toMatch(/max-width:\s*960px/);
    expect(rule('.page-container.is-narrow')).toMatch(/max-width:\s*720px/);
    expect(css).not.toMatch(/max-width:\s*1100px/);
  });
});

describe('attendance sessions', () => {
  const issues = (value: { nameKm: string; startTime: string; endTime: string }) => {
    const result = attendancePeriodSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`);
  };

  it('a session needs a name; the times are both or neither, 24-hour, the end after the start; overlapping is the school\'s business', () => {
    expect(issues({ nameKm: 'ពេលព្រឹក', startTime: '', endTime: '' })).toEqual([]);
    expect(issues({ nameKm: 'ពេលព្រឹក', startTime: '07:00', endTime: '11:00' })).toEqual([]);
    expect(issues({ nameKm: 'ពេលព្រឹក', startTime: '7:30', endTime: '11:00' }), '"7:30" is accepted and kept as 07:30').toEqual([]);
    expect(issues({ nameKm: '  ', startTime: '', endTime: '' })).toEqual(['nameKm:REQUIRED']);
    expect(issues({ nameKm: 'ក'.repeat(51), startTime: '', endTime: '' })).toEqual(['nameKm:Size']);
    expect(issues({ nameKm: 'ក', startTime: '07:00', endTime: '' })).toEqual(['endTime:REQUIRED']);
    expect(issues({ nameKm: 'ក', startTime: '', endTime: '11:00' })).toEqual(['startTime:REQUIRED']);
    expect(issues({ nameKm: 'ក', startTime: '25:00', endTime: '26:00' })).toEqual(['startTime:INVALID_TIME', 'endTime:INVALID_TIME']);
    expect(issues({ nameKm: 'ក', startTime: '7am', endTime: '11:00' })).toEqual(['startTime:INVALID_TIME']);
    expect(issues({ nameKm: 'ក', startTime: '11:00', endTime: '07:00' })).toEqual(['endTime:END_TIME_BEFORE_START']);
    expect(issues({ nameKm: 'ក', startTime: '11:00', endTime: '11:00' })).toEqual(['endTime:END_TIME_BEFORE_START']);
  });

  it('time text is kept in one shape', () => {
    expect(normalizeClock('7:30')).toBe('07:30');
    expect(normalizeClock(' 13:05 ')).toBe('13:05');
    expect(normalizeClock('')).toBe('');
    expect(normalizeClock('abc')).toBe('abc');
    expect(isClockTime('00:00') && isClockTime('23:59')).toBe(true);
    expect(isClockTime('24:00') || isClockTime('7:30') || isClockTime('07:60') || isClockTime('')).toBe(false);
    expect(timeRange('07:00', '11:00')).toBe('07:00–11:00');
    expect(timeRange(null, null)).toBe('');
    expect(periodLabel('ពេលព្រឹក', '07:00', '11:00')).toBe('ពេលព្រឹក (07:00–11:00)');
    expect(periodLabel('ពេញមួយថ្ងៃ', null, null)).toBe('ពេញមួយថ្ងៃ');
  });

  it('"days recorded" counts days, not sheets: a day taken in two sessions is one day', () => {
    const s = (sessionId: number, date: string, periodId: number): AttendanceSession => ({ sessionId, date, periodId, periodNameKm: 'x', present: 1, absent: 0, late: 0, leave: 0, total: 1 });
    expect(recordedDays([])).toBe(0);
    expect(recordedDays([s(1, '2026-11-02', 1), s(2, '2026-11-02', 2), s(3, '2026-11-03', 1)])).toBe(2);
  });

  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    http.configure({ baseUrl: 'http://127.0.0.1:5555', getToken: () => 'token', fetch: fetchMock as unknown as typeof fetch });
  });
  const last = () => {
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    return { url, method: init.method, body: init.body ? JSON.parse(String(init.body)) : undefined };
  };

  it.each([
    ['list', () => attendancePeriodsApi.list(2), 'GET', '/attendance-periods?academicYearId=2', undefined],
    ['create', () => attendancePeriodsApi.create(2, 'ពេលព្រឹក', '07:00', '11:00'), 'POST', '/attendance-periods', { academicYearId: 2, nameKm: 'ពេលព្រឹក', startTime: '07:00', endTime: '11:00' }],
    ['create without times', () => attendancePeriodsApi.create(2, 'ថ្នាក់បន្ថែម', null, null), 'POST', '/attendance-periods', { academicYearId: 2, nameKm: 'ថ្នាក់បន្ថែម', startTime: null, endTime: null }],
    ['update', () => attendancePeriodsApi.update(5, 'ព្រឹក', '07:30', '11:30', 3), 'PUT', '/attendance-periods/5', { nameKm: 'ព្រឹក', startTime: '07:30', endTime: '11:30', version: 3 }],
    ['switch off', () => attendancePeriodsApi.setEnabled(5, false, 4), 'PUT', '/attendance-periods/5/enabled', { enabled: false, version: 4 }],
    ['confirm', () => attendancePeriodsApi.confirm(5), 'POST', '/attendance-periods/5/confirm', undefined],
    ['reorder', () => attendancePeriodsApi.reorder(2, [7, 5, 6]), 'PUT', '/attendance-periods/order', { academicYearId: 2, ids: [7, 5, 6] }],
    ['copy', () => attendancePeriodsApi.copy(1, 2), 'POST', '/attendance-periods/copy', { fromYearId: 1, toYearId: 2 }],
    ['delete', () => attendancePeriodsApi.remove(5), 'DELETE', '/attendance-periods/5', undefined],
  ])('%s', async (_name, call, method, p, body) => {
    await call();
    expect(last()).toEqual({ url: `http://127.0.0.1:5555/api/v1${p}`, method, body });
  });

  it('has Khmer wording for the page, the screen, the errors, the audit trail and the draft notice', () => {
    const wanted = [
      'nav.attendanceSessions', 'attendance.session', 'attendance.noSession', 'attendance.copyFrom', 'attendance.copied', 'attendance.savedAs',
      'attendancePeriods.title', 'attendancePeriods.intro', 'attendancePeriods.keepsHistory', 'attendancePeriods.unconfirmed', 'attendancePeriods.confirmed',
      'acceptance.draft.attendanceSessions',
      'validation.INVALID_TIME', 'validation.END_TIME_BEFORE_START',
      ...['ATTENDANCE_PERIOD_DISABLED', 'ATTENDANCE_ALREADY_RECORDED', 'ATTENDANCE_PERIOD_IN_USE', 'LAST_ENABLED_PERIOD'].map((c) => `error.${c}`),
      ...['CREATED', 'UPDATED', 'ENABLED', 'DISABLED', 'REORDERED', 'DELETED', 'CONFIRMED', 'COPIED'].map((a) => `audit.action.ATTENDANCE_PERIOD_${a}`),
      'audit.action.ATTENDANCE_DUPLICATE_DROPPED', 'audit.entity.attendance_period',
    ];
    expect(wanted.filter((k) => !has(k))).toEqual([]);
  });
});

describe('the report card template', () => {
  const backendSource = readFileSync(path.resolve(FRONTEND, '..', 'backend', 'src', 'main', 'java', 'kh', 'school', 'sms', 'settings', 'AppSettingsService.java'), 'utf8');

  it('starts as the card always was: every block on except the photo (new), one signature box with the default caption, no note, the list\'s order', () => {
    expect(DEFAULT_CARD_OPTIONS).toEqual({
      showLogo: true, showNationalHeader: true, showPhoto: false, showAttendance: true, showRank: true, showComment: true,
      signatures: [''], footerNote: '', subjectOrder: 'default', showSubSubjects: false,
    });
  });

  it('reads what the server sent, and anything odd falls back to the default instead of breaking a printed page', () => {
    const o = cardOptionsFrom({ 'card.showRank': 'false', 'card.showPhoto': 'true', 'card.signatureCount': '3', 'card.signature1': '  នាយក ', 'card.signature3': 'ឪពុកម្តាយ', 'card.footerNote': ' ចំណាំ ', 'card.subjectOrder': 'name' });
    expect(o).toMatchObject({ showRank: false, showPhoto: true, showLogo: true, signatures: ['នាយក', '', 'ឪពុកម្តាយ'], footerNote: 'ចំណាំ', subjectOrder: 'name' });
    expect(cardOptionsFrom({ 'card.signatureCount': '0' }).signatures).toEqual([]);
    for (const bad of ['4', '-1', 'x', '1.5', '']) expect(cardOptionsFrom({ 'card.signatureCount': bad }).signatures, bad).toEqual(['']);
    expect(cardOptionsFrom({ 'card.subjectOrder': 'random' }).subjectOrder).toBe('default');
    expect(cardOptionsFrom({ 'card.showLogo': 'maybe' }).showLogo).toBe(false);   // only "true" is true; the server never stores anything else
    expect(cardOptionsFrom({}).showSubSubjects).toBe(false);   // the sub-subject detail is off until the school switches it on
    expect(cardOptionsFrom({ 'card.showSubSubjects': 'true' }).showSubSubjects).toBe(true);
  });

  it('saving writes every key (so nothing depends on what was stored before) and reading it back gives the same options', () => {
    const options: ReportCardOptions[] = [
      DEFAULT_CARD_OPTIONS,
      { ...DEFAULT_CARD_OPTIONS, showLogo: false, showNationalHeader: false, showAttendance: false, showComment: false, signatures: [] },
      { ...DEFAULT_CARD_OPTIONS, showPhoto: true, signatures: ['ក', '', 'គ'], footerNote: 'ចំណាំ', subjectOrder: 'name', showSubSubjects: true },
    ];
    for (const o of options) {
      const settings = cardSettingsOf(o);
      expect(Object.keys(settings)).toHaveLength(13);
      expect(cardOptionsFrom(settings)).toEqual(o);
    }
    expect(cardSettingsOf({ ...DEFAULT_CARD_OPTIONS, signatures: ['  x  '] })['card.signature1']).toBe('x');
    expect(cardSettingsOf({ ...DEFAULT_CARD_OPTIONS, signatures: ['x'] })['card.signature2']).toBe('');
  });

  it('every setting the screen saves is one the backend accepts (a key the backend does not know would reject the whole save)', () => {
    for (const key of Object.keys(cardSettingsOf(DEFAULT_CARD_OPTIONS))) expect(backendSource, key).toContain(`new Def("${key}"`);
  });

  it('subjects come in the school\'s list order, or by Khmer alphabet; the list itself is never changed', () => {
    const subjects = [{ subjectName: 'គណិតវិទ្យា' }, { subjectName: 'ភាសាខ្មែរ' }, { subjectName: 'កីឡា' }];
    expect(orderSubjects(subjects, 'default')).toEqual(subjects);
    expect(orderSubjects(subjects, 'name').map((s) => s.subjectName)).toEqual(['កីឡា', 'គណិតវិទ្យា', 'ភាសាខ្មែរ']);
    expect(subjects[0]!.subjectName).toBe('គណិតវិទ្យា');
  });

  it('the preview student is made up, complete and never a real child', () => {
    const card = sampleReportCard((key) => key, 5);
    expect(card.subjects).toHaveLength(5);
    expect(card.photoFile).toBeNull();
    expect(card.total).toBe(card.subjects.reduce((s, x) => s + (x.score ?? 0), 0));
    expect(card.percent).toBeCloseTo((card.total / card.totalMax) * 100, 1);
    expect(card.studentCode).toBe('2026-0001');
    expect(sampleReportCard((key) => key, 12).subjects).toHaveLength(12);
  });

  it('has Khmer wording for the page, the preview and the draft notice', () => {
    const wanted = [
      'nav.reportCardTemplate', 'print.reportCard.guardian', 'acceptance.draft.reportCardTemplate',
      ...['title', 'subtitle', 'blocksTitle', 'logo', 'nationalHeader', 'nationalHeaderHint', 'photo', 'photoHint', 'attendance', 'rank', 'comment', 'signaturesTitle', 'signatureCount', 'signatureCaption',
        'signatureHint', 'twelve', 'compactNote', 'moreTitle', 'footerNote', 'footerNoteHint', 'order', 'orderDefault', 'orderName', 'reset', 'unsaved', 'saved', 'previewTitle', 'previewHint'].map((k) => `reportCardTemplate.${k}`),
      ...['student', 'exam', 'year', 'grade', 'class', 'band', 'comment', 'subject1', 'subject2', 'subject3', 'subject4', 'subject5'].map((k) => `reportCardTemplate.sample.${k}`),
    ];
    expect(wanted.filter((k) => !has(k))).toEqual([]);
  });
});

describe('attendance counted by days and by sessions', () => {
  // a student with 8 sessions on 6 days: present in 5, late in 2, absent in 1; one of the days was a partial one (present in one session, absent in the other)
  const row = { present: 5, absent: 1, late: 2, leave: 0, total: 8, days: { present: 3, late: 2, partial: 1, absent: 0, leave: 0, total: 6 } };
  const keyed = (key: string, values?: Record<string, unknown>) => (values ? `${key}${JSON.stringify(values)}` : key);

  it('the same record is read as days or as sessions, in the order of its columns, and the two totals differ', () => {
    expect(statusColumns('DAY')).toEqual(['PRESENT', 'LATE', 'PARTIAL', 'ABSENT', 'LEAVE']);
    expect(statusColumns('SESSION')).toEqual(['PRESENT', 'ABSENT', 'LATE', 'LEAVE']);
    expect(countsOf(row, 'DAY')).toEqual([3, 2, 1, 0, 0, 6]);
    expect(countsOf(row, 'SESSION')).toEqual([5, 1, 2, 0, 8]);
    expect(countsOf(row, 'DAY').length).toBe(statusColumns('DAY').length + 1);
    expect(countsOf(row, 'SESSION').length).toBe(statusColumns('SESSION').length + 1);
  });

  it('every column label says its unit (days or sessions) and the last one is the matching total', () => {
    const days = columnLabels(keyed, 'DAY');
    expect(days).toHaveLength(6);
    expect(days.slice(0, 5).every((l) => l.endsWith('(attendance.unit.DAY)'))).toBe(true);
    expect(days[2]).toBe('attendance.status.PARTIAL (attendance.unit.DAY)');
    expect(days[5]).toBe('attendance.totalDays');
    const sessions = columnLabels(keyed, 'SESSION');
    expect(sessions).toHaveLength(5);
    expect(sessions.slice(0, 4).every((l) => l.endsWith('(attendance.unit.SESSION)'))).toBe(true);
    expect(sessions[4]).toBe('attendance.totalSessions');
    expect(sessions.join()).not.toContain('PARTIAL');
  });

  it('only DAY and SESSION are methods', () => {
    expect(ATTENDANCE_BASES).toEqual(['DAY', 'SESSION']);
    expect(isBasis('DAY') && isBasis('SESSION')).toBe(true);
    expect(isBasis('WEEK') || isBasis('') || isBasis(undefined) || isBasis(null)).toBe(false);
  });

  it('the official method is DAY until the school chooses sessions; anything else stored falls back to DAY', () => {
    setActivePinia(createPinia());
    const preferences = usePreferencesStore();
    expect(preferences.attendanceBasis).toBe('DAY');
    preferences.values = { 'attendance.officialBasis': 'SESSION' };
    expect(preferences.attendanceBasis).toBe('SESSION');
    preferences.values = { 'attendance.officialBasis': 'nonsense' };
    expect(preferences.attendanceBasis).toBe('DAY');
  });

  it('asks the days endpoint exactly', async () => {
    const fetchMock = vi.fn(async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    http.configure({ baseUrl: 'http://127.0.0.1:5555', getToken: () => 'token', fetch: fetchMock as unknown as typeof fetch });
    await attendanceApi.days(3, '2026-11-01', '2026-11-30');
    expect((fetchMock.mock.calls.at(-1) as unknown as [string])[0]).toBe('http://127.0.0.1:5555/api/v1/attendance/days?classId=3&from=2026-11-01&to=2026-11-30');
  });

  it('has Khmer wording for the units, the new status, both methods, the setting, the dashboard and the readiness item', () => {
    const wanted = [
      'attendance.unit.DAY', 'attendance.unit.SESSION', 'attendance.status.PARTIAL', 'attendance.totalDays', 'attendance.totalSessions', 'attendance.recordedDays', 'attendance.recordedSessions',
      'attendance.sheetsTaken', 'attendance.students',
      ...['label', 'DAY', 'SESSION', 'official', 'title', 'intro', 'DAYHint', 'SESSIONHint', 'saved', 'unsaved', 'current'].map((k) => `attendance.basis.${k}`),
      'dashboard.attendanceSplitDays', 'dashboard.attendanceSplitSessions', 'dashboard.sheetsToday', 'students.attendanceBoth', 'reports.attendance.sessions', 'print.attendance.periodSessions',
      'acceptance.item.attendance-counting.title', 'acceptance.item.attendance-counting.closes', 'acceptance.draft.attendanceCounting',
    ];
    expect(wanted.filter((k) => !has(k))).toEqual([]);
  });
});
