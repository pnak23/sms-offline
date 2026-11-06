import type { FieldError } from '../types/api';

/** The one error type services throw. `code` is a backend ApiException code (or a client-side one such as NETWORK_ERROR). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly fieldErrors: FieldError[] = [],
    readonly retryAfterSeconds?: number,
    readonly detail?: string,
    /** Any other fields of the problem body, e.g. `studentCode` of a POSSIBLE_DUPLICATE. */
    readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = 'ApiError';
  }

  /** No HTTP response at all: the backend is not reachable. */
  get isNetwork(): boolean {
    return this.status === 0;
  }

  get isLocked(): boolean {
    return this.code === 'ACCOUNT_LOCKED';
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/**
 * First server-side field error per form field, as `{ field: CODE }` ready for vee-validate's setErrors().
 * `aliases` renames server fields to form fields (e.g. `{ newPassword: 'password' }`).
 */
export function toFormErrors(error: ApiError, aliases: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const fe of error.fieldErrors) {
    const field = aliases[fe.field] ?? fe.field;
    if (!(field in out)) out[field] = fe.code;
  }
  return out;
}
