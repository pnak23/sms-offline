import type { ProblemBody } from '../types/api';
import { ApiError } from '../utils/apiError';

/**
 * The only place that calls fetch(). Components and stores go through services/*Api.ts, which use this client.
 *
 * - The base URL comes from Electron (`window.desktop.getInfo()`); in Electron the launch secret header is injected
 *   by the main process, so this code never sees it (the dev shim adds it through `extraHeaders`).
 * - The session token is read from memory on every call and is never written anywhere.
 * - Every non-2xx response becomes an ApiError carrying the backend's `code` (the backend sends no user-facing text).
 */
export interface HttpHooks {
  /** 401 UNAUTHENTICATED: the session is gone (expired, revoked, signed out elsewhere). */
  onUnauthenticated?(error: ApiError): void;
  /** 401 SETUP_REQUIRED: the database has no administrator yet. */
  onSetupRequired?(error: ApiError): void;
  /** No response at all (backend stopped or unreachable). */
  onNetworkError?(error: ApiError): void;
}

export interface HttpConfig extends HttpHooks {
  baseUrl: string;
  getToken: () => string | null;
  /** Extra headers for every request (dev shim only). */
  extraHeaders?: () => Record<string, string>;
  fetch?: typeof fetch;
}

export interface RequestOptions {
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

const API_PREFIX = '/api/v1';

export class HttpClient {
  private config: HttpConfig = { baseUrl: '', getToken: () => null };

  configure(partial: Partial<HttpConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  get baseUrl(): string {
    return this.config.baseUrl;
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.json<T>('GET', path, options);
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.json<T>('POST', path, { ...options, body });
  }

  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.json<T>('PUT', path, { ...options, body });
  }

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.json<T>('DELETE', path, options);
  }

  postForm<T>(path: string, form: FormData, options?: RequestOptions): Promise<T> {
    return this.json<T>('POST', path, { ...options, form });
  }

  /** Binary download with the Bearer token (an <img src> cannot send it). */
  async blob(path: string, options?: RequestOptions): Promise<Blob> {
    const response = await this.send('GET', path, options);
    return response.blob();
  }

  /** A POST whose answer is a file (the Excel export): the JSON body goes out, the bytes come back. */
  async postBlob(path: string, body?: unknown, options?: RequestOptions): Promise<Blob> {
    const response = await this.send('POST', path, { ...options, body });
    return response.blob();
  }

  private async json<T>(method: Method, path: string, options?: RequestOptions): Promise<T> {
    const response = await this.send(method, path, options);
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private async send(method: Method, path: string, options: RequestOptions = {}): Promise<Response> {
    const { baseUrl, getToken, extraHeaders } = this.config;
    const headers: Record<string, string> = { Accept: 'application/json', ...extraHeaders?.() };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let body: BodyInit | undefined;
    if (options.form) {
      body = options.form; // the browser sets the multipart boundary
    } else if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    const doFetch = this.config.fetch ?? fetch;
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${API_PREFIX}${path}`, { method, headers, body, signal: options.signal });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
      const error = new ApiError(0, 'NETWORK_ERROR');
      this.config.onNetworkError?.(error);
      throw error;
    }

    if (response.ok) return response;
    const error = await this.toApiError(response);
    if (error.status === 401 && error.code === 'UNAUTHENTICATED') this.config.onUnauthenticated?.(error);
    if (error.status === 401 && error.code === 'SETUP_REQUIRED') this.config.onSetupRequired?.(error);
    throw error;
  }

  private async toApiError(response: Response): Promise<ApiError> {
    let problem: ProblemBody = {};
    try {
      const parsed: unknown = JSON.parse(await response.text());
      if (parsed && typeof parsed === 'object') problem = parsed as ProblemBody;
    } catch {
      // not JSON (e.g. a proxy error page): fall through to a generic code
    }
    const header = Number(response.headers.get('Retry-After'));
    const retry = typeof problem.retryAfterSeconds === 'number' ? problem.retryAfterSeconds : header > 0 ? header : undefined;
    return new ApiError(
      response.status,
      typeof problem.code === 'string' && problem.code ? problem.code : 'UNKNOWN',
      Array.isArray(problem.fieldErrors) ? problem.fieldErrors : [],
      retry,
      typeof problem.detail === 'string' ? problem.detail : undefined,
      extraFields(problem),
    );
  }
}

const KNOWN_PROBLEM_FIELDS = new Set(['status', 'code', 'fieldErrors', 'retryAfterSeconds', 'detail', 'title', 'type', 'instance']);

/** The fields of a problem body that the client has no named slot for (e.g. `studentCode` of a POSSIBLE_DUPLICATE). */
function extraFields(problem: ProblemBody): Record<string, unknown> {
  return Object.fromEntries(Object.entries(problem).filter(([key]) => !KNOWN_PROBLEM_FIELDS.has(key)));
}

/** The app-wide client; configured once at start-up by plugins/api.ts. */
export const http = new HttpClient();
