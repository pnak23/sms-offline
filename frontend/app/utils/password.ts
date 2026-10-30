// Client-side mirror of backend PasswordPolicy (approved default 2): at least 8 characters (counted as code points),
// at most 72 UTF-8 bytes (BCrypt's limit; a Khmer character takes 3 bytes), not equal to the username.
// The weak-password list stays on the server and comes back as PASSWORD_WEAK.
export const PASSWORD_MIN_CHARS = 8;
export const PASSWORD_MAX_BYTES = 72;

export function codePointLength(value: string): number {
  return Array.from(value).length;
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** Same normalisation the server uses before comparing: NFC, trimmed, lower-cased. */
export function normalizeUsername(username: string): string {
  return username.normalize('NFC').trim().toLowerCase();
}

/** Validation codes (key `validation.<CODE>`); empty when the password is acceptable to the client rules. */
export function passwordIssues(password: string, username?: string): string[] {
  if (!password) return ['REQUIRED'];
  const issues: string[] = [];
  if (codePointLength(password) < PASSWORD_MIN_CHARS) issues.push('PASSWORD_TOO_SHORT');
  if (utf8ByteLength(password) > PASSWORD_MAX_BYTES) issues.push('PASSWORD_TOO_LONG');
  if (username && password.toLowerCase() === normalizeUsername(username)) issues.push('PASSWORD_EQUALS_USERNAME');
  return issues;
}

export type PasswordStrength = 'none' | 'weak' | 'fair' | 'good';

/** A hint, not a rule: length first, then variety. Anything the policy rejects is "weak". */
export function passwordStrength(password: string, username?: string): PasswordStrength {
  if (!password) return 'none';
  if (passwordIssues(password, username).length > 0) return 'weak';
  const length = codePointLength(password);
  const hasDigit = /\p{N}/u.test(password);
  const hasLetter = /\p{L}/u.test(password);
  const hasMixed = /\p{Lu}/u.test(password) && /\p{Ll}/u.test(password);
  const hasSymbol = /[^\p{L}\p{M}\p{N}\s]/u.test(password);
  let score = 0;
  if (length >= 12) score += 2;
  else if (length >= 10) score += 1;
  if (hasDigit && hasLetter) score += 1;
  if (hasMixed || hasSymbol) score += 1;
  if (score >= 3) return 'good';
  return score >= 1 ? 'fair' : 'weak';
}
