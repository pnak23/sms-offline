import { beforeEach, describe, expect, it, vi } from 'vitest';
import { academicApi } from '~/services/academicApi';
import { http } from '~/services/http';

// The client must call exactly the endpoints AcademicController serves (method, path, body).
describe('academic API client', () => {
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

  const year = { nameKm: '២០២៦-២០២៧', startDate: '2026-11-01', endDate: '2027-08-31' };

  it.each([
    ['grades', () => academicApi.grades(), 'GET', '/grades', undefined],
    ['setGradeSubjects', () => academicApi.setGradeSubjects(3, [1, 2]), 'PUT', '/grades/3/subjects', { subjectIds: [1, 2] }],
    ['years', () => academicApi.years(), 'GET', '/academic-years', undefined],
    ['createYear', () => academicApi.createYear({ ...year, makeCurrent: false }), 'POST', '/academic-years', { ...year, makeCurrent: false }],
    ['updateYear', () => academicApi.updateYear(4, { ...year, version: 2 }), 'PUT', '/academic-years/4', { ...year, version: 2 }],
    ['setCurrentYear', () => academicApi.setCurrentYear(4), 'POST', '/academic-years/4/set-current', undefined],
    ['closeYear', () => academicApi.closeYear(4), 'POST', '/academic-years/4/close', undefined],
    ['reopenYear', () => academicApi.reopenYear(4), 'POST', '/academic-years/4/reopen', undefined],
    ['subjects', () => academicApi.subjects(), 'GET', '/subjects', undefined],
    ['createSubject', () => academicApi.createSubject({ nameKm: 'កុំព្យូទ័រ', nameEn: '' }), 'POST', '/subjects', { nameKm: 'កុំព្យូទ័រ', nameEn: '' }],
    ['updateSubject', () => academicApi.updateSubject(9, { nameKm: 'ក', nameEn: 'A' }, 5), 'PUT', '/subjects/9', { nameKm: 'ក', nameEn: 'A', version: 5 }],
    ['setSubjectActive', () => academicApi.setSubjectActive(9, true, 5), 'PUT', '/subjects/9/active', { active: true, version: 5 }],
  ])('%s', async (_name, call, method, path, body) => {
    await call();
    expect(last()).toEqual({ url: `http://127.0.0.1:5555/api/v1${path}`, method, body });
  });
});
