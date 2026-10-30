import { describe, expect, it, vi } from 'vitest';
import { HttpClient, type HttpConfig } from '~/services/http';
import { ApiError, isApiError, toFormErrors } from '~/utils/apiError';

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function makeClient(fetchMock: ReturnType<typeof vi.fn>, extra: Partial<HttpConfig> = {}) {
  const client = new HttpClient();
  const hooks = { onUnauthenticated: vi.fn(), onSetupRequired: vi.fn(), onNetworkError: vi.fn() };
  let token: string | null = null;
  client.configure({
    baseUrl: 'http://127.0.0.1:5555',
    getToken: () => token,
    fetch: fetchMock as unknown as typeof fetch,
    ...hooks,
    ...extra,
  });
  return { client, hooks, setToken: (value: string | null) => (token = value) };
}

const lastCall = (fetchMock: ReturnType<typeof vi.fn>) => {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit & { headers: Record<string, string> }];
  return { url, init };
};

describe('http client: requests', () => {
  it('prefixes /api/v1 to the base URL from the desktop bridge', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json(200, { ok: true }));
    const { client } = makeClient(fetchMock);
    await client.get('/auth/status');
    expect(lastCall(fetchMock).url).toBe('http://127.0.0.1:5555/api/v1/auth/status');
  });

  it('sends the Bearer token from memory only when there is one', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json(200, {}));
    const { client, setToken } = makeClient(fetchMock);
    await client.get('/x');
    expect(lastCall(fetchMock).init.headers.Authorization).toBeUndefined();
    setToken('tok-123');
    await client.get('/x');
    expect(lastCall(fetchMock).init.headers.Authorization).toBe('Bearer tok-123');
  });

  it('adds extra headers (the dev shim launch secret) and none otherwise', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json(200, {}));
    const plain = makeClient(fetchMock);
    await plain.client.get('/x');
    expect(lastCall(fetchMock).init.headers['X-SMS-Launch-Secret']).toBeUndefined();

    const dev = makeClient(fetchMock, { extraHeaders: () => ({ 'X-SMS-Launch-Secret': 's3cret' }) });
    await dev.client.get('/x');
    expect(lastCall(fetchMock).init.headers['X-SMS-Launch-Secret']).toBe('s3cret');
  });

  it('sends JSON bodies with a content type, and multipart forms without one (the browser adds the boundary)', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json(200, {}));
    const { client } = makeClient(fetchMock);
    await client.post('/auth/login', { username: 'a', password: 'b' });
    const jsonCall = lastCall(fetchMock);
    expect(jsonCall.init.headers['Content-Type']).toBe('application/json');
    expect(jsonCall.init.body).toBe('{"username":"a","password":"b"}');

    const form = new FormData();
    form.append('file', new Blob(['x']), 'logo.png');
    await client.postForm('/settings/school/logo', form);
    const formCall = lastCall(fetchMock);
    expect(formCall.init.headers['Content-Type']).toBeUndefined();
    expect(formCall.init.body).toBe(form);
  });

  it('returns undefined for 204 and the parsed body otherwise', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(json(200, { a: 1 }));
    const { client } = makeClient(fetchMock);
    expect(await client.post('/auth/logout')).toBeUndefined();
    expect(await client.get('/y')).toEqual({ a: 1 });
  });

  it('downloads binary data with the token (images are shown through blob URLs)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(['png-bytes']), { status: 200 }));
    const { client, setToken } = makeClient(fetchMock);
    setToken('tok');
    const blob = await client.blob('/files/school/logo-1.png');
    expect(await blob.text()).toBe('png-bytes');
    expect(lastCall(fetchMock).init.headers.Authorization).toBe('Bearer tok');
  });
});

describe('http client: error mapping', () => {
  it('turns the problem body into an ApiError with code and field errors', async () => {
    const body = {
      status: 422,
      code: 'VALIDATION_FAILED',
      fieldErrors: [
        { field: 'password', code: 'PASSWORD_TOO_SHORT' },
        { field: 'password', code: 'PASSWORD_WEAK' },
        { field: 'username', code: 'USERNAME_INVALID' },
      ],
    };
    const { client } = makeClient(vi.fn().mockImplementation(async () => json(422, body)));
    const error = await client.post('/auth/setup', {}).catch((e: unknown) => e);
    expect(isApiError(error)).toBe(true);
    const api = error as ApiError;
    expect(api.status).toBe(422);
    expect(api.code).toBe('VALIDATION_FAILED');
    expect(api.fieldErrors).toHaveLength(3);
    expect(toFormErrors(api)).toEqual({ password: 'PASSWORD_TOO_SHORT', username: 'USERNAME_INVALID' }); // first error per field
  });

  it('maps server field names to form field names', () => {
    const error = new ApiError(422, 'VALIDATION_FAILED', [{ field: 'newPassword', code: 'PASSWORD_WEAK' }]);
    expect(toFormErrors(error, { newPassword: 'password' })).toEqual({ password: 'PASSWORD_WEAK' });
  });

  it('reads retryAfterSeconds from a 429 ACCOUNT_LOCKED body', async () => {
    const { client } = makeClient(vi.fn().mockImplementation(async () => json(429, { status: 429, code: 'ACCOUNT_LOCKED', retryAfterSeconds: 58 })));
    const error = (await client.post('/auth/login', {}).catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(429);
    expect(error.isLocked).toBe(true);
    expect(error.retryAfterSeconds).toBe(58);
  });

  it('falls back to the Retry-After header', async () => {
    const { client } = makeClient(vi.fn().mockImplementation(async () => json(429, { code: 'ACCOUNT_LOCKED' }, { 'Retry-After': '30' })));
    const error = (await client.post('/auth/login', {}).catch((e: unknown) => e)) as ApiError;
    expect(error.retryAfterSeconds).toBe(30);
  });

  it('accepts filter-level bodies that carry only a code', async () => {
    const { client } = makeClient(vi.fn().mockImplementation(async () => json(403, { code: 'FORBIDDEN' })));
    const error = (await client.get('/x').catch((e: unknown) => e)) as ApiError;
    expect([error.status, error.code]).toEqual([403, 'FORBIDDEN']);
  });

  it('uses UNKNOWN for bodies without a code or that are not JSON at all', async () => {
    const noCode = makeClient(vi.fn().mockImplementation(async () => json(404, { timestamp: 1, status: 404, error: 'Not Found', path: '/x' })));
    expect(((await noCode.client.get('/x').catch((e: unknown) => e)) as ApiError).code).toBe('UNKNOWN');
    const html = makeClient(vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 })));
    const error = (await html.client.get('/x').catch((e: unknown) => e)) as ApiError;
    expect([error.status, error.code]).toEqual([502, 'UNKNOWN']);
  });

  it('reports a missing backend as status 0 NETWORK_ERROR and notifies the app', async () => {
    const { client, hooks } = makeClient(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const error = (await client.get('/auth/status').catch((e: unknown) => e)) as ApiError;
    expect(error.isNetwork).toBe(true);
    expect(error.code).toBe('NETWORK_ERROR');
    expect(hooks.onNetworkError).toHaveBeenCalledOnce();
  });
});

describe('http client: session and setup reactions', () => {
  it('401 UNAUTHENTICATED tells the app to drop the session', async () => {
    const { client, hooks } = makeClient(vi.fn().mockImplementation(async () => json(401, { code: 'UNAUTHENTICATED' })));
    await client.get('/system/info').catch(() => undefined);
    expect(hooks.onUnauthenticated).toHaveBeenCalledOnce();
    expect(hooks.onSetupRequired).not.toHaveBeenCalled();
  });

  it('401 INVALID_CREDENTIALS is a normal form error, not a session expiry', async () => {
    const { client, hooks } = makeClient(vi.fn().mockImplementation(async () => json(401, { code: 'INVALID_CREDENTIALS' })));
    const error = (await client.post('/auth/login', {}).catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('INVALID_CREDENTIALS');
    expect(hooks.onUnauthenticated).not.toHaveBeenCalled();
  });

  it('401 SETUP_REQUIRED sends the user to the wizard', async () => {
    const { client, hooks } = makeClient(vi.fn().mockImplementation(async () => json(401, { code: 'SETUP_REQUIRED' })));
    await client.get('/settings/school').catch(() => undefined);
    expect(hooks.onSetupRequired).toHaveBeenCalledOnce();
    expect(hooks.onUnauthenticated).not.toHaveBeenCalled();
  });

  it('other statuses call no hooks', async () => {
    const { client, hooks } = makeClient(vi.fn().mockImplementation(async () => json(409, { code: 'OPTIMISTIC_LOCK' })));
    await client.put('/settings/school', {}).catch(() => undefined);
    expect(hooks.onUnauthenticated).not.toHaveBeenCalled();
    expect(hooks.onSetupRequired).not.toHaveBeenCalled();
    expect(hooks.onNetworkError).not.toHaveBeenCalled();
  });
});
