// Client-side pre-check for the school logo (the server re-validates and re-encodes anyway).
export const LOGO_MAX_BYTES = 5 * 1024 * 1024;
export const LOGO_ACCEPT = 'image/png,image/jpeg';
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg']);

/** Validation code (key `validation.<CODE>`) or null when the file is acceptable. */
export function logoFileIssue(file: { type: string; size: number; name?: string }): string | null {
  const byName = /\.(png|jpe?g)$/i.test(file.name ?? '');
  if (!ALLOWED_TYPES.has(file.type) && !(file.type === '' && byName)) return 'INVALID_FILE_TYPE';
  if (file.size <= 0) return 'INVALID_IMAGE';
  if (file.size > LOGO_MAX_BYTES) return 'FILE_TOO_LARGE';
  return null;
}
