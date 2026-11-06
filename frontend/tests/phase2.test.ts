import { beforeEach, describe, expect, it, vi } from 'vitest';
import { capacityOf, classSchema } from '~/schemas/schoolClass';
import { guardianProblems, studentSchema } from '~/schemas/student';
import { teacherSchema } from '~/schemas/teacher';
import { classesApi } from '~/services/classesApi';
import { enrollmentsApi } from '~/services/enrollmentsApi';
import { http } from '~/services/http';
import { studentsApi } from '~/services/studentsApi';
import { teachersApi } from '~/services/teachersApi';
import { isApiError } from '~/utils/apiError';
import { queryString } from '~/utils/query';
import { compareKhmer, sortByKhmer } from '~/utils/sort';

/** field -> first message (a validation code) */
function issues(schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } } }, value: unknown) {
  const result = schema.safeParse(value);
  const out: Record<string, string> = {};
  if (!result.success) for (const issue of result.error?.issues ?? []) out[String(issue.path[0])] ??= issue.message;
  return out;
}

describe('query strings', () => {
  it('leaves out empty values and encodes the rest', () => {
    expect(queryString({})).toBe('');
    expect(queryString({ q: '', status: undefined, gradeId: null })).toBe('');
    expect(queryString({ q: 'សុខ', status: 'ACTIVE', unenrolled: true, yearId: 3 })).toBe(`?q=${encodeURIComponent('សុខ')}&status=ACTIVE&unenrolled=true&yearId=3`);
  });
});

describe('Khmer sorting', () => {
  it('orders by the Khmer alphabet, not by how the names were typed', () => {
    const names = ['សុខ', 'កែវ', 'ម៉ៅ', 'ចាន់', 'ខ្ញុំ'];
    expect(sortByKhmer(names, (n) => n)).toEqual(['កែវ', 'ខ្ញុំ', 'ចាន់', 'ម៉ៅ', 'សុខ']);
    expect(names[0]).toBe('សុខ'); // the input is not changed
  });

  it('puts missing values first and compares numbers by value', () => {
    expect(compareKhmer(null, 'ក')).toBeLessThan(0);
    expect(compareKhmer('ថ្នាក់ 2', 'ថ្នាក់ 10')).toBeLessThan(0);
  });
});

describe('teacher form', () => {
  const ok = { nameKm: 'លោកគ្រូ សុខ', gender: 'MALE', phone: '', specialization: '', address: '', employmentDate: '' };

  it('needs a name and a gender; everything else is optional', () => {
    expect(issues(teacherSchema, ok)).toEqual({});
    expect(issues(teacherSchema, { ...ok, nameKm: '  ', gender: '' })).toEqual({ nameKm: 'REQUIRED', gender: 'REQUIRED' });
    expect(issues(teacherSchema, { ...ok, gender: 'OTHER' }).gender).toBe('REQUIRED');
    expect(issues(teacherSchema, { ...ok, employmentDate: '2015-02-30' }).employmentDate).toBe('INVALID_DATE');
    expect(issues(teacherSchema, { ...ok, employmentDate: '2015-10-01' })).toEqual({});
  });
});

describe('class form', () => {
  const ok = { gradeId: '1', nameKm: 'ក', capacity: '', homeroomTeacherId: '' };

  it('capacity is optional, 1-200, Khmer digits allowed', () => {
    expect(issues(classSchema, ok)).toEqual({});
    expect(issues(classSchema, { ...ok, capacity: '៣០' })).toEqual({});
    expect(issues(classSchema, { ...ok, capacity: '0' }).capacity).toBe('OUT_OF_RANGE');
    expect(issues(classSchema, { ...ok, capacity: '201' }).capacity).toBe('OUT_OF_RANGE');
    expect(issues(classSchema, { ...ok, capacity: 'abc' }).capacity).toBe('INVALID_NUMBER');
    expect(issues(classSchema, { ...ok, gradeId: '', nameKm: '' })).toEqual({ gradeId: 'REQUIRED', nameKm: 'REQUIRED' });
  });

  it('turns the capacity box into a number, or null for the default', () => {
    expect(capacityOf('')).toBeNull();
    expect(capacityOf(' ')).toBeNull();
    expect(capacityOf('៣០')).toBe(30);
  });
});

describe('student form', () => {
  const ok = {
    nameKm: 'សុខ វណ្ណា', nameEn: '', gender: 'FEMALE', dateOfBirth: '2019-05-01', enrollmentDate: '', placeOfBirth: '', address: '',
    village: '', commune: '', district: '', province: '', notes: '', classId: '',
  };

  it('needs only the Khmer name, gender and a past date of birth', () => {
    expect(issues(studentSchema, ok)).toEqual({});
    expect(issues(studentSchema, { ...ok, nameKm: '', gender: '', dateOfBirth: '' })).toEqual({ nameKm: 'REQUIRED', gender: 'REQUIRED', dateOfBirth: 'REQUIRED' });
    expect(issues(studentSchema, { ...ok, dateOfBirth: '2999-01-01' }).dateOfBirth).toBe('Past');
    expect(issues(studentSchema, { ...ok, dateOfBirth: '2019-02-30' }).dateOfBirth).toBe('INVALID_DATE');
    expect(issues(studentSchema, { ...ok, enrollmentDate: 'tomorrow' }).enrollmentDate).toBe('INVALID_DATE');
    expect(issues(studentSchema, { ...ok, notes: 'x'.repeat(2001) }).notes).toBe('Size');
  });

  it('checks every guardian row for a name and a relationship', () => {
    expect(guardianProblems([])).toEqual({});
    expect(guardianProblems([{ nameKm: 'សុខ ចាន់', relationship: 'FATHER', phone: '', primary: true }])).toEqual({});
    expect(guardianProblems([
      { nameKm: 'សុខ ចាន់', relationship: 'FATHER', phone: '', primary: true },
      { nameKm: '  ', relationship: '', phone: '', primary: false },
      { nameKm: 'ម៉ៅ', relationship: 'MOTHER', phone: '1'.repeat(51), primary: false },
    ])).toEqual({ 1: { nameKm: 'REQUIRED', relationship: 'REQUIRED' }, 2: { phone: 'Size' } });
  });
});

describe('Phase 2 API clients call exactly what the backend serves', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    http.configure({ baseUrl: 'http://127.0.0.1:5555', getToken: () => 'token', fetch: fetchMock as unknown as typeof fetch });
  });

  const last = () => {
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    return { url: url.replace('http://127.0.0.1:5555/api/v1', ''), method: init.method, body: init.body && typeof init.body === 'string' ? JSON.parse(init.body) : undefined };
  };

  const teacher = { nameKm: 'ក', gender: 'MALE' as const, phone: '', address: '', specialization: '', employmentDate: '' };
  const student = {
    nameKm: 'ក', nameEn: '', gender: 'FEMALE' as const, dateOfBirth: '2019-05-01', placeOfBirth: '', address: '', village: '', commune: '', district: '',
    province: '', enrollmentDate: '', notes: '', guardians: [], allowDuplicate: false,
  };

  it('teachers', async () => {
    await teachersApi.list({ q: 'សុខ', status: 'ACTIVE' });
    expect(last()).toEqual({ url: `/teachers?q=${encodeURIComponent('សុខ')}&status=ACTIVE`, method: 'GET', body: undefined });
    await teachersApi.create(teacher);
    expect(last()).toEqual({ url: '/teachers', method: 'POST', body: { ...teacher, employmentDate: null } });
    await teachersApi.update(4, { ...teacher, employmentDate: '2015-10-01' }, 2);
    expect(last()).toEqual({ url: '/teachers/4', method: 'PUT', body: { ...teacher, employmentDate: '2015-10-01', version: 2 } });
    await teachersApi.setActive(4, false, 3);
    expect(last()).toEqual({ url: '/teachers/4/active', method: 'PUT', body: { active: false, version: 3 } });
    await teachersApi.classes(4);
    expect(last().url).toBe('/teachers/4/classes');
  });

  it('classes', async () => {
    await classesApi.list({ yearId: 3, gradeId: null });
    expect(last().url).toBe('/classes?yearId=3');
    await classesApi.create({ academicYearId: 3, gradeId: 1, nameKm: 'ក', capacity: null, homeroomTeacherId: null });
    expect(last()).toEqual({ url: '/classes', method: 'POST', body: { academicYearId: 3, gradeId: 1, nameKm: 'ក', capacity: null, homeroomTeacherId: null } });
    await classesApi.update(7, { nameKm: 'ខ', capacity: 30, homeroomTeacherId: 2 }, 5);
    expect(last()).toEqual({ url: '/classes/7', method: 'PUT', body: { nameKm: 'ខ', capacity: 30, homeroomTeacherId: 2, version: 5 } });
    await classesApi.setTeachers(7, [{ subjectId: 1, teacherId: 2 }]);
    expect(last()).toEqual({ url: '/classes/7/teachers', method: 'PUT', body: { assignments: [{ subjectId: 1, teacherId: 2 }] } });
    await classesApi.remove(7);
    expect(last()).toEqual({ url: '/classes/7', method: 'DELETE', body: undefined });
    await classesApi.students(7);
    expect(last().url).toBe('/classes/7/students');
    await classesApi.students(7, true);
    expect(last().url).toBe('/classes/7/students?includeEnded=true');
  });

  it('students', async () => {
    await studentsApi.list({ q: 'x', yearId: 3, classId: 9, unenrolled: false, status: 'ACTIVE' });
    expect(last().url).toBe('/students?q=x&yearId=3&classId=9&status=ACTIVE');
    await studentsApi.list({ unenrolled: true });
    expect(last().url).toBe('/students?unenrolled=true');
    await studentsApi.create(student, 9);
    expect(last()).toEqual({ url: '/students', method: 'POST', body: { ...student, enrollmentDate: null, classId: 9 } });
    await studentsApi.update(5, student, 2);
    expect(last()).toEqual({ url: '/students/5', method: 'PUT', body: { ...student, enrollmentDate: null, version: 2 } });
    await studentsApi.setStatus(5, 'GRADUATED', 3);
    expect(last()).toEqual({ url: '/students/5/status', method: 'PUT', body: { status: 'GRADUATED', version: 3, reason: '' } });
    await studentsApi.remove(5);
    expect(last().method).toBe('DELETE');
    await studentsApi.exportExcel({ gender: 'FEMALE', unenrolled: false }, { sheet: 'x' });
    expect(last()).toEqual({ url: '/students/export', method: 'POST', body: { gender: 'FEMALE', labels: { sheet: 'x' } } });
    await studentsApi.photoBlob('photo-1.jpg');
    expect(last().url).toBe('/files/students/photo-1.jpg');
  });

  it('enrollments and promotion (a preview unless dryRun is false)', async () => {
    await enrollmentsApi.enroll(5, 9);
    expect(last()).toEqual({ url: '/enrollments', method: 'POST', body: { studentId: 5, classId: 9, enrolledOn: null } });
    await enrollmentsApi.transfer(11, 10, '2026-11-02', 'ហេតុផល');
    expect(last()).toEqual({ url: '/enrollments/11/transfer', method: 'POST', body: { classId: 10, date: '2026-11-02', reason: 'ហេតុផល' } });
    await enrollmentsApi.leave(11);
    expect(last()).toEqual({ url: '/enrollments/11/leave', method: 'POST', body: { date: null, reason: '' } });
    const decisions = [{ enrollmentId: 1, outcome: 'PROMOTED' as const, toClassId: 4 }, { enrollmentId: 2, outcome: 'GRADUATED' as const, toClassId: null }];
    await enrollmentsApi.promote(1, 2, decisions, true);
    expect(last()).toEqual({ url: '/enrollments/promote?dryRun=true', method: 'POST', body: { fromYearId: 1, toYearId: 2, decisions } });
    await enrollmentsApi.promote(1, 2, decisions, false);
    expect(last().url).toBe('/enrollments/promote?dryRun=false');
  });

  it('a POSSIBLE_DUPLICATE answer carries the existing student code for the confirmation dialog', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ status: 409, code: 'POSSIBLE_DUPLICATE', studentId: 7, studentCode: '2026-0001' }), { status: 409, headers: { 'Content-Type': 'application/json' } }));
    const error = await studentsApi.create(student, null).catch((e: unknown) => e);
    expect(isApiError(error)).toBe(true);
    if (isApiError(error)) {
      expect(error.status).toBe(409);
      expect(error.code).toBe('POSSIBLE_DUPLICATE');
      expect(error.extra).toEqual({ studentId: 7, studentCode: '2026-0001' });
    }
  });
});
