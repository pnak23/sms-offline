import { beforeEach, describe, expect, it, vi } from 'vitest';
import { auditApi } from '~/services/auditApi';
import { backupApi } from '~/services/backupApi';
import { http } from '~/services/http';
import type { BackupItem } from '~/types/api';
import { backupState, daysSince, formatBytes, newestVerified } from '~/utils/backup';

const item = (over: Partial<BackupItem>): BackupItem => ({
  id: 'SchoolBackup_2026-11-01_08-00-00',
  fileName: 'SchoolBackup_2026-11-01_08-00-00.zip',
  kind: 'MANUAL',
  createdAt: '2026-11-01T01:00:00Z',
  sizeBytes: 1024,
  schemaVersion: 5,
  appVersion: '0.1.0',
  verifiedAt: '2026-11-01T01:00:05Z',
  verifyError: null,
  externalCopyAt: null,
  ...over,
});

describe('backup helpers', () => {
  it('writes sizes the way a person reads them', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(250 * 1024 * 1024)).toBe('250 MB');
    expect(formatBytes(3.2 * 1024 ** 3)).toBe('3.2 GB');
  });

  it('counts whole days and never goes negative (a clock that is behind)', () => {
    const now = Date.parse('2026-11-10T12:00:00Z');
    expect(daysSince('2026-11-10T11:00:00Z', now)).toBe(0);
    expect(daysSince('2026-11-09T12:00:00Z', now)).toBe(1);
    expect(daysSince('2026-11-02T12:00:01Z', now)).toBe(7);
    expect(daysSince('2026-11-02T12:00:00Z', now)).toBe(8);
    expect(daysSince('2026-12-01T00:00:00Z', now)).toBe(0);
  });

  it('a backup is verified only while it was read back whole; damaged beats verified', () => {
    expect(backupState(item({}))).toBe('verified');
    expect(backupState(item({ verifiedAt: null }))).toBe('unchecked');
    expect(backupState(item({ verifiedAt: null, verifyError: 'BACKUP_CHECKSUM_MISMATCH' }))).toBe('damaged');
    expect(backupState(item({ verifyError: 'BACKUP_CORRUPT' }))).toBe('damaged');
  });

  it('offers the newest VERIFIED backup for copying, skipping a damaged or unchecked newer one', () => {
    const damaged = item({ id: 'SchoolBackup_2026-11-03_08-00-00', verifiedAt: null, verifyError: 'BACKUP_CORRUPT' });
    const unchecked = item({ id: 'SchoolBackup_2026-11-02_08-00-00', verifiedAt: null });
    const good = item({ id: 'SchoolBackup_2026-11-01_08-00-00' });
    expect(newestVerified([damaged, unchecked, good])?.id).toBe(good.id);
    expect(newestVerified([damaged, unchecked])).toBeNull();
    expect(newestVerified([])).toBeNull();
  });
});

// The clients must call exactly the endpoints the Phase 5 controllers serve (method, path, body).
describe('Phase 5 API clients', () => {
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

  const id = 'SchoolBackup_2026-11-01_08-00-00';
  const hash = 'a'.repeat(64);

  it.each([
    ['overview', () => backupApi.overview(), 'GET', '/backups', undefined],
    ['create', () => backupApi.create(), 'POST', '/backups', undefined],
    ['verify', () => backupApi.verify(id), 'POST', `/backups/${id}/verify`, undefined],
    ['remove', () => backupApi.remove(id), 'DELETE', `/backups/${id}`, undefined],
    ['record a copy', () => backupApi.recordCopy(id, hash), 'POST', `/backups/${id}/external-copy`, { sha256: hash }],
    ['restore state', () => backupApi.restoreState(), 'GET', '/backups/restore', undefined],
    ['stage a file', () => backupApi.stageFile('incoming-1735000000000.zip'), 'POST', '/backups/restore/stage', { fileName: 'incoming-1735000000000.zip' }],
    ['stage a listed backup', () => backupApi.stageListed(id), 'POST', '/backups/restore/stage', { backupId: id }],
    ['apply', () => backupApi.apply(), 'POST', '/backups/restore/apply', undefined],
    ['cancel', () => backupApi.cancelStaged(), 'DELETE', '/backups/restore', undefined],

    ['audit list (all)', () => auditApi.list(), 'GET', '/audit', undefined],
    ['audit list (filtered)', () => auditApi.list({ from: '2026-11-01', to: '2026-11-02', action: 'STUDENT_CREATED', actor: 'admin.sokha', limit: 50, beforeId: 90 }), 'GET',
      '/audit?from=2026-11-01&to=2026-11-02&action=STUDENT_CREATED&actor=admin.sokha&limit=50&beforeId=90', undefined],
    ['audit list (blank filters are left out)', () => auditApi.list({ from: '', action: '', entityType: 'backup' }), 'GET', '/audit?entityType=backup', undefined],
    ['audit filters', () => auditApi.filters(), 'GET', '/audit/filters', undefined],
  ])('%s', async (_name, call, method, path, body) => {
    await call();
    expect(last()).toEqual({ url: `http://127.0.0.1:5555/api/v1${path}`, method, body });
  });

  it('never sends a file path: the stage request carries a name or an id, nothing else', async () => {
    await backupApi.stageFile('incoming-1.zip');
    expect(Object.keys(last().body)).toEqual(['fileName']);
    await backupApi.stageListed(id);
    expect(Object.keys(last().body)).toEqual(['backupId']);
  });
});
