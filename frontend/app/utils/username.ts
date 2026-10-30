import { codePointLength, normalizeUsername } from './password';

// Mirror of backend UsernamePolicy: 3-32 characters, letters (Khmer included, with combining marks), digits, . _ -
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;
const USERNAME_PATTERN = /^[\p{L}\p{M}\p{N}._-]+$/u;

/** Validation codes (key `validation.<CODE>`); empty when acceptable. */
export function usernameIssues(username: string): string[] {
  const normalized = normalizeUsername(username);
  if (!normalized) return ['REQUIRED'];
  const length = codePointLength(normalized);
  if (length < USERNAME_MIN || length > USERNAME_MAX || !USERNAME_PATTERN.test(normalized)) return ['USERNAME_INVALID'];
  return [];
}
