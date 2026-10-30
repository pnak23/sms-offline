import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http } from '~/services/http';
import { useAppStore } from '~/stores/app';
import { usePreferencesStore } from '~/stores/preferences';
import { useRecoveryStore } from '~/stores/recovery';
import { useRecoveryKeyStore } from '~/stores/recoveryKey';
import { useSessionStore } from '~/stores/session';
import { useSetupStore } from '~/stores/setup';
import { ApiError } from '~/utils/apiError';

type Handler = (init: RequestInit & { headers: Record<string, string> }) => Response | Promise<Response>;

const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** A fake backend: `"METHOD /path"` -> handler. Unknown routes fail the test loudly. */
function mockBackend(routes: Record<string, Handler>) {
  const calls: { key: string; init: RequestInit & { headers: Record<string, string> } }[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit & { headers: Record<string, string> }) => {
    const key = `${init.method} ${new URL(url).pathname.replace('/api/v1', '')}`;
    calls.push({ key, init });
    const handler = routes[key];
    if (!handler) throw new Error(`unexpected request ${key}`);
    return handler(init);
  });
  http.configure({
    baseUrl: 'http://127.0.0.1:1',
    fetch: fetchMock as unknown as typeof fetch,
    getToken: () => useSessionStore().token,
    onUnauthenticated: undefined,
    onSetupRequired: undefined,
    onNetworkError: undefined,
    extraHeaders: undefined,
  });
  return { calls, fetchMock };
}

const user = { username: 'admin', displayName: 'អ្នកគ្រប់គ្រង' };
const TOKEN = 'TOKEN-abcdefghijklmnopqrstuvwxyz-0123456789';

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('session store', () => {
  it('keeps the token in memory ONLY: nothing in localStorage, sessionStorage, cookies or the URL', async () => {
    mockBackend({ 'POST /auth/login': () => reply(200, { token: TOKEN, user, recoveryKeyPending: false }) });
    const session = useSessionStore();
    const result = await session.login('admin', 'secret-pass');
    expect(result.recoveryKeyPending).toBe(false);
    expect(session.isAuthenticated).toBe(true);
    expect(session.token).toBe(TOKEN);
    expect(JSON.stringify({ ...localStorage })).not.toContain(TOKEN);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(TOKEN);
    expect(document.cookie).not.toContain(TOKEN);
    expect(window.location.href).not.toContain(TOKEN);
  });

  it('sends the token as a Bearer header on later calls', async () => {
    const { calls } = mockBackend({
      'POST /auth/login': () => reply(200, { token: TOKEN, user, recoveryKeyPending: false }),
      'POST /auth/unlock': () => reply(204),
    });
    const session = useSessionStore();
    await session.login('admin', 'secret-pass');
    session.lock();
    await session.unlock('secret-pass');
    expect(calls.at(-1)?.init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0]?.init.headers.Authorization).toBeUndefined(); // the login itself carries no token
  });

  it('reports the unconfirmed-key flag from the login response', async () => {
    mockBackend({ 'POST /auth/login': () => reply(200, { token: TOKEN, user, recoveryKeyPending: true }) });
    expect((await useSessionStore().login('admin', 'x')).recoveryKeyPending).toBe(true);
  });

  it('a failed login stores nothing and surfaces the code', async () => {
    mockBackend({ 'POST /auth/login': () => reply(401, { status: 401, code: 'INVALID_CREDENTIALS' }) });
    const session = useSessionStore();
    const error = (await session.login('admin', 'wrong').catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('INVALID_CREDENTIALS');
    expect(session.isAuthenticated).toBe(false);
    expect(session.user).toBeNull();
  });

  it('surfaces the lock-out length for the countdown', async () => {
    mockBackend({ 'POST /auth/login': () => reply(429, { status: 429, code: 'ACCOUNT_LOCKED', retryAfterSeconds: 61 }) });
    const error = (await useSessionStore().login('admin', 'wrong').catch((e: unknown) => e)) as ApiError;
    expect([error.status, error.code, error.retryAfterSeconds]).toEqual([429, 'ACCOUNT_LOCKED', 61]);
  });

  it('logout clears the session even when the backend cannot be reached', async () => {
    const { fetchMock } = mockBackend({ 'POST /auth/login': () => reply(200, { token: TOKEN, user, recoveryKeyPending: false }) });
    const session = useSessionStore();
    await session.login('admin', 'x');
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await session.logout();
    expect(session.token).toBeNull();
    expect(session.user).toBeNull();
  });

  it('lock keeps the session; unlock needs the right password; a wrong one stays locked', async () => {
    let attempts = 0;
    mockBackend({
      'POST /auth/login': () => reply(200, { token: TOKEN, user, recoveryKeyPending: false }),
      'POST /auth/unlock': () => {
        attempts += 1;
        return attempts === 1 ? reply(422, { code: 'VALIDATION_FAILED', fieldErrors: [{ field: 'password', code: 'INVALID_PASSWORD' }] }) : reply(204);
      },
    });
    const session = useSessionStore();
    session.lock();
    expect(session.locked).toBe(false); // nothing to lock when signed out
    await session.login('admin', 'x');
    session.lock();
    expect(session.locked).toBe(true);
    expect(session.token).toBe(TOKEN);
    const error = (await session.unlock('nope').catch((e: unknown) => e)) as ApiError;
    expect(error.fieldErrors[0]).toEqual({ field: 'password', code: 'INVALID_PASSWORD' });
    expect(session.locked).toBe(true);
    await session.unlock('right');
    expect(session.locked).toBe(false);
  });

  it('clear() forgets token, user and lock state', async () => {
    mockBackend({ 'POST /auth/login': () => reply(200, { token: TOKEN, user, recoveryKeyPending: false }) });
    const session = useSessionStore();
    await session.login('admin', 'x');
    session.lock();
    session.clear();
    expect([session.token, session.user, session.locked]).toEqual([null, null, false]);
  });
});

describe('app store: /auth/status and connection loss', () => {
  const status = (overrides = {}) => ({ setupRequired: false, authenticated: true, recoveryKeyPending: false, setupCompleted: true, ...overrides });

  it('stores the status and clears a previous backend-down state', async () => {
    mockBackend({ 'GET /auth/status': () => reply(200, status()) });
    const app = useAppStore();
    app.markBackendDown('NETWORK_ERROR');
    expect(await app.refreshStatus()).toEqual(status());
    expect(app.backendDown).toBeNull();
  });

  it('notices a session that expired on the server: clears it and leaves a one-time notice', async () => {
    mockBackend({ 'GET /auth/status': () => reply(200, status({ authenticated: false })) });
    const session = useSessionStore();
    session.begin(TOKEN, user);
    const app = useAppStore();
    await app.refreshStatus();
    expect(session.isAuthenticated).toBe(false);
    expect(app.takeNotice()).toBe('SESSION_EXPIRED');
    expect(app.takeNotice()).toBeNull(); // shown once
  });

  it('keeps a valid session untouched', async () => {
    mockBackend({ 'GET /auth/status': () => reply(200, status()) });
    const session = useSessionStore();
    session.begin(TOKEN, user);
    await useAppStore().refreshStatus();
    expect(session.isAuthenticated).toBe(true);
  });

  it('an unreachable backend returns null and raises the overlay with NETWORK_ERROR', async () => {
    const { fetchMock } = mockBackend({});
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const app = useAppStore();
    expect(await app.refreshStatus()).toBeNull();
    expect(app.backendDown).toEqual({ code: 'NETWORK_ERROR' });
  });

  it('an error response from /auth/status raises the overlay with that code', async () => {
    mockBackend({ 'GET /auth/status': () => reply(500, { code: 'INTERNAL_ERROR' }) });
    const app = useAppStore();
    expect(await app.refreshStatus()).toBeNull();
    expect(app.backendDown).toEqual({ code: 'INTERNAL_ERROR' });
  });
});

describe('recovery key and recovery flow stores (memory only, wiped on clear)', () => {
  it('formats the key, remembers where to return, and never touches browser storage', () => {
    const store = useRecoveryKeyStore();
    store.issue('ab3d5f7g9hjkmnpqrstvwxyz0', '/settings/security');
    expect(store.key).toBe('AB3D5-F7G9H-JKMNP-QRSTV-WXYZ0');
    expect(store.hasKey).toBe(true);
    expect(store.returnTo).toBe('/settings/security');
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('AB3D5');
    expect(document.cookie).not.toContain('AB3D5');
    store.clear();
    expect([store.key, store.issuedAt, store.hasKey, store.returnTo]).toEqual([null, null, false, '/dashboard']);
  });

  it('the recover flow holds the new password only until reset()', () => {
    const flow = useRecoveryStore();
    flow.begin({ username: 'admin', displayName: 'A' }, 'New-Password-1');
    expect([flow.phase, flow.username, flow.newPassword]).toEqual(['key', 'admin', 'New-Password-1']);
    flow.reset();
    expect([flow.phase, flow.username, flow.newPassword]).toEqual(['form', '', '']);
  });
});

describe('setup store: wizard position', () => {
  it('before an account exists it starts at step 1 and makes no API call', async () => {
    const { calls } = mockBackend({});
    const setup = useSetupStore();
    await setup.init(false);
    expect(setup.step).toBe(1);
    await setup.goTo(2, false);
    expect(setup.step).toBe(2);
    expect(calls).toHaveLength(0); // progress cannot be saved before there is an account
  });

  it('a signed-in user resumes at the saved step but never before step 4', async () => {
    mockBackend({ 'GET /setup/progress': () => reply(200, { step: 3, completed: false }) });
    const setup = useSetupStore();
    await setup.init(true);
    expect(setup.step).toBe(4);
  });

  it('resumes at a later saved step as it is', async () => {
    mockBackend({ 'GET /setup/progress': () => reply(200, { step: 6, completed: false }) });
    const setup = useSetupStore();
    await setup.init(true);
    expect(setup.step).toBe(6);
  });

  it('saves the new step on the server after each move (PUT /setup/progress)', async () => {
    const { calls } = mockBackend({ 'PUT /setup/progress': () => reply(200, { step: 5, completed: false }) });
    const setup = useSetupStore();
    await setup.goTo(5, true);
    expect(setup.step).toBe(5);
    expect(calls[0]?.key).toBe('PUT /setup/progress');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ step: 5 });
  });

  it('does not move when saving the step fails', async () => {
    mockBackend({ 'PUT /setup/progress': () => reply(500, { code: 'INTERNAL_ERROR' }) });
    const setup = useSetupStore();
    await expect(setup.goTo(5, true)).rejects.toBeInstanceOf(ApiError);
    expect(setup.step).toBe(1);
  });

  it('keeps its place when the page is entered again (e.g. back from the print page)', async () => {
    mockBackend({ 'PUT /setup/progress': () => reply(200, { step: 3, completed: false }), 'GET /setup/progress': () => reply(200, { step: 1, completed: false }) });
    const setup = useSetupStore();
    await setup.init(false);
    await setup.goTo(3, true);
    await setup.init(true);
    expect(setup.step).toBe(3);
  });
});

describe('preferences store', () => {
  it('uses the approved defaults (10 minutes idle lock, 7 days backup reminder) until loaded', () => {
    const prefs = usePreferencesStore();
    expect([prefs.idleLockMinutes, prefs.backupReminderDays]).toEqual([10, 7]);
  });

  it('reads the saved values, and ignores nonsense', async () => {
    mockBackend({ 'GET /settings/app': () => reply(200, { 'ui.idleLockMinutes': '3', 'backup.reminderDays': 'abc', 'report.khmerNumerals': 'false' }) });
    const prefs = usePreferencesStore();
    await prefs.load();
    expect(prefs.idleLockMinutes).toBe(3);
    expect(prefs.backupReminderDays).toBe(7);
  });

  it('save() sends strings and adopts the server answer', async () => {
    const { calls } = mockBackend({ 'PUT /settings/app': () => reply(200, { 'ui.idleLockMinutes': '15', 'backup.reminderDays': '30' }) });
    const prefs = usePreferencesStore();
    await prefs.save({ 'ui.idleLockMinutes': '15', 'backup.reminderDays': '30' });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ 'ui.idleLockMinutes': '15', 'backup.reminderDays': '30' });
    expect(prefs.idleLockMinutes).toBe(15);
  });
});
