// The weekly timetable: the grid helpers, the three printed / Excel tables, the slot form's rules, the API client's exact calls, and the rule that it stays out of every other module.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { timetableSlotSchema } from '~/schemas/timetable';
import { http } from '~/services/http';
import { timetableApi } from '~/services/timetableApi';
import type { TimetableClassView, TimetableGrid, TimetableLesson, TimetableSlot, TimetableStudentView, TimetableTeacherView } from '~/types/api';
import { CELL_SEPARATOR, lessonAt, lessonsOfTeacher, slotLabel, slotTimes, sortedDays, visibleSlots } from '~/utils/timetable';
import { breakRowName, classTimetableTable, studentTimetableTable, teacherTimetableTable } from '~/utils/timetableTables';

const t = (key: string, params?: Record<string, unknown>): string => (params ? `${key}:${JSON.stringify(params)}` : key);

// Test values only: the program ships no time, no slot and no day.
const slot = (id: number, nameKm: string, startTime: string, endTime: string, breakSlot = false): TimetableSlot => ({ id, academicYearId: 1, nameKm, startTime, endTime, breakSlot, version: 0, lessons: 0 });
const SLOTS = [slot(1, 'ម៉ោង ១', '07:00', '07:45'), slot(2, 'ម៉ោង ២', '07:45', '08:30'), slot(3, 'សម្រាក', '08:30', '08:45', true), slot(4, 'ម៉ោង ៣', '08:45', '09:30'), slot(5, 'ម៉ោង ៤', '09:30', '10:15')];
const lesson = (id: number, day: number, slotId: number, subjectName: string, teacherName: string, over: Partial<TimetableLesson> = {}): TimetableLesson => ({
  id, classId: 1, className: 'ក', gradeName: 'ថ្នាក់ទី ៣', dayOfWeek: day, slotId, subjectId: id, subjectName, teacherId: id, teacherName, teacherActive: true, version: 0, ...over,
});
const grid = (lessons: TimetableLesson[], days = [1, 2, 3, 4, 5]): TimetableGrid => ({ days, daysAreDefault: false, slots: SLOTS, lessons });

describe('which rows a timetable shows', () => {
  it('shows every slot to an editor, so an empty cell can always be clicked', () => {
    expect(visibleSlots(SLOTS, [], 'all')).toEqual(SLOTS);
    expect(visibleSlots(SLOTS, [lesson(1, 1, 1, 'ក', 'គ្រូ')], 'all')).toEqual(SLOTS);
  });

  it('shows a reader only the slots in use, plus the breaks between the first and the last of them', () => {
    // lessons in slot 1 and slot 4: the break between them stays, slot 2 (unused) and slot 5 (after the last) go
    const shown = visibleSlots(SLOTS, [lesson(1, 1, 1, 'ក', 'គ្រូ'), lesson(2, 2, 4, 'ខ', 'គ្រូ')], 'used');
    expect(shown.map((s) => s.id)).toEqual([1, 3, 4]);
  });

  it('shows no row at all for a person with no lesson (the page says so instead of printing an empty frame)', () => {
    expect(visibleSlots(SLOTS, [], 'used')).toEqual([]);
    expect(visibleSlots([], [], 'used')).toEqual([]);
  });

  it('a break alone (before the first or after the last lesson) is not shown', () => {
    expect(visibleSlots(SLOTS, [lesson(1, 1, 4, 'ក', 'គ្រូ')], 'used').map((s) => s.id)).toEqual([4]);
  });
});

describe('small helpers', () => {
  it('finds the lesson of one cell, and the days are in week order without duplicates or strangers', () => {
    const l = lesson(1, 2, 4, 'ក', 'គ្រូ');
    expect(lessonAt([l], 2, 4)).toBe(l);
    expect(lessonAt([l], 3, 4)).toBeNull();
    expect(sortedDays([5, 1, 3, 3, 9, 0])).toEqual([1, 3, 5]);
  });

  it('writes a slot as times (an en dash) and a name, and counts a teacher\'s lessons', () => {
    expect(slotTimes(SLOTS[0] as TimetableSlot)).toBe('07:00–07:45');
    expect(slotLabel(SLOTS[0] as TimetableSlot)).toBe(`07:00–07:45${CELL_SEPARATOR}ម៉ោង ១`);
    expect(lessonsOfTeacher([lesson(1, 1, 1, 'ក', 'គ្រូ'), lesson(1, 2, 1, 'ក', 'គ្រូ'), lesson(2, 1, 4, 'ខ', 'គ្រូ')], 1)).toBe(2);
  });
});

const classView = (lessons: TimetableLesson[]): TimetableClassView => ({
  classId: 1, className: 'ក', gradeId: 3, gradeName: 'ថ្នាក់ទី ៣', yearId: 1, yearName: 'ឆ្នាំសាកល្បង', yearClosed: false, grid: grid(lessons), subjects: [], teachers: [],
});

describe('the printed and Excel timetable of a class', () => {
  const lessons = [lesson(1, 1, 1, 'គណិតវិទ្យា', 'គ្រូ ក'), lesson(2, 2, 1, 'ភាសាខ្មែរ', 'គ្រូ ខ'), lesson(3, 1, 4, 'វិទ្យាសាស្ត្រ', 'គ្រូ គ')];

  it('is ONE table: the time column then one column per school day, one row per slot in use, a break in its place', () => {
    const table = classTimetableTable(t, classView(lessons));
    expect(table.columns.map((c) => c.label)).toEqual(['timetable.time', 'timetable.day.1', 'timetable.day.2', 'timetable.day.3', 'timetable.day.4', 'timetable.day.5']);
    expect(table.columns.every((c) => c.type === 'TEXT')).toBe(true);
    expect(table.rows).toHaveLength(3);                               // slot 1, the break, slot 4 (slots 2 and 5 are unused)
    expect(table.rows[0]).toEqual([`07:00–07:45${CELL_SEPARATOR}ម៉ោង ១`, `គណិតវិទ្យា${CELL_SEPARATOR}គ្រូ ក`, `ភាសាខ្មែរ${CELL_SEPARATOR}គ្រូ ខ`, '', '', '']);
    expect(table.rows[1]).toEqual([`08:30–08:45${CELL_SEPARATOR}សម្រាក`, 'សម្រាក', 'សម្រាក', 'សម្រាក', 'សម្រាក', 'សម្រាក']);
    expect(table.rows[2]?.[1]).toBe(`វិទ្យាសាស្ត្រ${CELL_SEPARATOR}គ្រូ គ`);
    expect(table.title).toBe('reports.timetableClass.title');
    expect(table.sheetName).toBe('reports.timetableClass.sheet');
    expect(table.subtitle).toContain('ថ្នាក់ទី ៣ ក');
    expect(table.subtitle).toContain('ឆ្នាំសាកល្បង');
    expect(table.subtitle).toContain('"n":3');
  });

  it('has a column for every school day the year has (Saturday included when the school ticked it), in week order', () => {
    const view = classView(lessons);
    view.grid = grid(lessons, [6, 1, 2, 3, 4, 5]);
    expect(classTimetableTable(t, view).columns.map((c) => c.label).slice(1)).toEqual(['timetable.day.1', 'timetable.day.2', 'timetable.day.3', 'timetable.day.4', 'timetable.day.5', 'timetable.day.6']);
  });

  it('has no row for a class with no lesson, so the printed page can say so', () => {
    expect(classTimetableTable(t, classView([])).rows).toEqual([]);
  });

  it('recognises a break row (every day cell is the break\'s own name) and nothing else', () => {
    const table = classTimetableTable(t, classView(lessons));
    expect(breakRowName(table.rows[1] as (string | number | null)[])).toBe('សម្រាក');
    expect(breakRowName(table.rows[0] as (string | number | null)[])).toBeNull();
    expect(breakRowName(['07:00–07:45 · ម៉ោង ១', 'គណិត · គ្រូ'])).toBeNull();   // a single-day week: the lesson text is not the slot's name
    expect(breakRowName(['08:30–08:45 · សម្រាក', 'សម្រាក'])).toBe('សម្រាក');
  });
});

describe('the printed and Excel timetable of a teacher and of a student', () => {
  it('a teacher\'s cell is the subject and the class, and the subtitle carries the weekly lesson count', () => {
    const lessons = [lesson(1, 1, 1, 'គណិតវិទ្យា', 'គ្រូ ក', { className: 'ក' }), lesson(1, 2, 1, 'គណិតវិទ្យា', 'គ្រូ ក', { className: 'ខ', classId: 2 })];
    const view: TimetableTeacherView = { teacherId: 1, teacherName: 'គ្រូ ក', teacherActive: true, yearId: 1, yearName: 'ឆ្នាំសាកល្បង', yearClosed: false, grid: grid(lessons), lessonCount: 2 };
    const table = teacherTimetableTable(t, view);
    expect(table.rows[0]).toEqual([`07:00–07:45${CELL_SEPARATOR}ម៉ោង ១`, `គណិតវិទ្យា${CELL_SEPARATOR}ថ្នាក់ទី ៣ ក`, `គណិតវិទ្យា${CELL_SEPARATOR}ថ្នាក់ទី ៣ ខ`, '', '', '']);
    expect(table.subtitle).toContain('គ្រូ ក');
    expect(table.subtitle).toContain('timetable.teacherLessons:{"n":2}');
    expect(table.title).toBe('reports.timetableTeacher.title');
  });

  it('a student\'s timetable is the class\'s, with the student\'s name on it; a student with no class has an empty table', () => {
    const view: TimetableStudentView = { studentId: 9, state: 'OK', classId: 1, className: 'ក', gradeName: 'ថ្នាក់ទី ៣', yearId: 1, yearName: 'ឆ្នាំសាកល្បង', yearClosed: false, grid: grid([lesson(1, 1, 1, 'គណិតវិទ្យា', 'គ្រូ ក')]) };
    const table = studentTimetableTable(t, view, 'សិស្ស ក');
    expect(table.rows[0]?.[1]).toBe(`គណិតវិទ្យា${CELL_SEPARATOR}គ្រូ ក`);
    expect(table.subtitle).toBe(['សិស្ស ក', 'ថ្នាក់ទី ៣ ក', 'ឆ្នាំសាកល្បង'].join(' · '));
    const none = studentTimetableTable(t, { ...view, state: 'NOT_ENROLLED', classId: null, className: null, gradeName: null, grid: grid([]) }, 'សិស្ស ខ');
    expect(none.rows).toEqual([]);
    expect(none.subtitle).toContain('timetable.notEnrolledShort');
  });
});

describe('the slot form', () => {
  const ok = { nameKm: 'ម៉ោង ១', startTime: '07:00', endTime: '07:45', breakSlot: false };
  const codes = (value: unknown): string[] => {
    const result = timetableSlotSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`);
  };

  it('needs a name and both times (a slot without a time is not a slot: the school types its own)', () => {
    expect(codes(ok)).toEqual([]);
    expect(codes({ ...ok, nameKm: '  ' })).toEqual(['nameKm:REQUIRED']);
    expect(codes({ ...ok, startTime: '', endTime: '' })).toEqual(['startTime:REQUIRED', 'endTime:REQUIRED']);
    expect(codes({ ...ok, nameKm: 'x'.repeat(51) })).toEqual(['nameKm:Size']);
  });

  it('takes 24-hour times, forgives a missing leading zero, and wants the end after the start', () => {
    expect(codes({ ...ok, startTime: '7:00' })).toEqual([]);
    expect(codes({ ...ok, startTime: '25:00' })).toEqual(['startTime:INVALID_TIME']);
    expect(codes({ ...ok, endTime: '07:60' })).toEqual(['endTime:INVALID_TIME']);
    expect(codes({ ...ok, endTime: '07:00' })).toEqual(['endTime:END_TIME_BEFORE_START']);
    expect(codes({ ...ok, startTime: '08:00', endTime: '07:45' })).toEqual(['endTime:END_TIME_BEFORE_START']);
  });
});

describe('the timetable API client', () => {
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
    ['settings', () => timetableApi.settings(4), 'GET', '/timetable/settings?yearId=4', undefined],
    ['setDays', () => timetableApi.setDays(4, [1, 2, 3]), 'PUT', '/timetable/days', { yearId: 4, days: [1, 2, 3] }],
    ['createSlot', () => timetableApi.createSlot(4, 'ម៉ោង ១', '07:00', '07:45', false), 'POST', '/timetable/slots', { yearId: 4, nameKm: 'ម៉ោង ១', startTime: '07:00', endTime: '07:45', breakSlot: false }],
    ['updateSlot', () => timetableApi.updateSlot(9, 'សម្រាក', '08:30', '08:45', true, 2), 'PUT', '/timetable/slots/9', { nameKm: 'សម្រាក', startTime: '08:30', endTime: '08:45', breakSlot: true, version: 2 }],
    ['removeSlot', () => timetableApi.removeSlot(9), 'DELETE', '/timetable/slots/9', undefined],
    ['copyYear (preview)', () => timetableApi.copyYear(5, 4, true), 'POST', '/timetable/years/5/copy-from/4', { preview: true }],
    ['copyYear (copy)', () => timetableApi.copyYear(5, 4, false), 'POST', '/timetable/years/5/copy-from/4', { preview: false }],
    ['classView', () => timetableApi.classView(7), 'GET', '/timetable/classes/7', undefined],
    ['setCell', () => timetableApi.setCell(7, 2, 9, 3, 6), 'PUT', '/timetable/classes/7/cell', { dayOfWeek: 2, slotId: 9, subjectId: 3, teacherId: 6 }],
    ['clearCell', () => timetableApi.clearCell(7, 2, 9), 'DELETE', '/timetable/classes/7/cell?dayOfWeek=2&slotId=9', undefined],
    ['copyClass (preview)', () => timetableApi.copyClass(7, 8, false, true), 'POST', '/timetable/classes/7/copy-from/8', { replace: false, preview: true }],
    ['copyClass (replace)', () => timetableApi.copyClass(7, 8, true, false), 'POST', '/timetable/classes/7/copy-from/8', { replace: true, preview: false }],
    ['teacherView', () => timetableApi.teacherView(3, 4), 'GET', '/timetable/teachers/3?yearId=4', undefined],
    ['teacherLoads', () => timetableApi.teacherLoads(4), 'GET', '/timetable/teacher-loads?yearId=4', undefined],
    ['studentView (current year)', () => timetableApi.studentView(12), 'GET', '/timetable/students/12', undefined],
    ['studentView (a year)', () => timetableApi.studentView(12, 4), 'GET', '/timetable/students/12?yearId=4', undefined],
  ] as const)('%s calls exactly what TimetableController serves', async (_name, call, method, url, body) => {
    await call();
    const seen = last();
    expect(seen.method).toBe(method);
    expect(seen.url).toBe(`http://127.0.0.1:5555/api/v1${url}`);
    expect(seen.body).toEqual(body);
  });
});

describe('the timetable stays out of every other module', () => {
  // Results, report cards, rankings, attendance, homework and fees must not know the timetable exists, and the timetable code must not know them.
  const APP = path.resolve(__dirname, '..', 'app');
  const walk = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).flatMap((n) => (statSync(path.join(dir, n)).isDirectory() ? walk(path.join(dir, n)) : [path.join(dir, n)])) : []);

  it('no examination, report-card, ranking, attendance, homework or fee code mentions the timetable', () => {
    const files = [
      'utils/monthlyRanking.ts', 'utils/honorRoll.ts', 'utils/score.ts', 'utils/exam.ts', 'utils/attendance.ts', 'utils/homework.ts', 'utils/money.ts',
      'services/examsApi.ts', 'services/reportCardsApi.ts', 'services/attendanceApi.ts', 'services/attendancePeriodsApi.ts', 'services/homeworkApi.ts', 'services/feesApi.ts',
      'pages/monthly-ranking/index.vue', 'pages/honor-roll/index.vue', 'pages/report-cards/index.vue',
    ].map((f) => path.join(APP, f)).filter(existsSync);
    const all = [...files, ...walk(path.join(APP, 'components', 'exams')), ...walk(path.join(APP, 'components', 'reportCards')), ...walk(path.join(APP, 'components', 'attendance')),
      ...walk(path.join(APP, 'components', 'homework')), ...walk(path.join(APP, 'components', 'fees')), ...walk(path.join(APP, 'components', 'print'))];
    expect(all.length).toBeGreaterThan(20);   // the scan itself found the files
    // what counts is a dependency (an import of the timetable's service, utils or schema, or one of its components), not a word in a comment
    const mentions = all.filter((f) => /timetableApi|utils[/\\]timetable|schemas[/\\]timetable|<Timetable/.test(readFileSync(f, 'utf8'))).map((f) => path.relative(APP, f));
    expect(mentions).toEqual([]);
  });

  it('the timetable code reads no examination, attendance, homework or fee service', () => {
    const mine = [...walk(path.join(APP, 'components', 'timetable')), path.join(APP, 'utils', 'timetable.ts'), path.join(APP, 'utils', 'timetableTables.ts'), path.join(APP, 'services', 'timetableApi.ts')];
    expect(mine.length).toBeGreaterThan(8);
    for (const file of mine) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/examsApi|reportCardsApi|attendanceApi|attendancePeriodsApi|homeworkApi|feesApi/);
    }
  });
});
