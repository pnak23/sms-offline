// Recovery key helpers. They mirror backend RecoveryKeys: 25 characters of Crockford Base32 (no I, L, O, U),
// case-insensitive, dashes and spaces ignored, O -> 0 and I/L -> 1.
export const RECOVERY_KEY_LENGTH = 25;
export const RECOVERY_KEY_GROUP = 5;
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function mapCharacter(ch: string): string {
  if (ch === 'O') return '0';
  if (ch === 'I' || ch === 'L') return '1';
  return ch;
}

/** Keeps only valid key characters (tolerant of pasted dashes, spaces, line breaks, look-alike letters). Not length-capped. */
function significantCharacters(input: string): string {
  let out = '';
  for (const raw of input.toUpperCase()) {
    const ch = mapCharacter(raw);
    if (ALPHABET.includes(ch)) out += ch;
  }
  return out;
}

/** Canonical form: valid characters only, at most 25. */
export function normalizeRecoveryKey(input: string): string {
  return significantCharacters(input).slice(0, RECOVERY_KEY_LENGTH);
}

/** XXXXX-XXXXX-XXXXX-XXXXX-XXXXX (works for partial input while typing). */
export function formatRecoveryKey(input: string): string {
  const key = normalizeRecoveryKey(input);
  const groups: string[] = [];
  for (let i = 0; i < key.length; i += RECOVERY_KEY_GROUP) groups.push(key.slice(i, i + RECOVERY_KEY_GROUP));
  return groups.join('-');
}

export function isCompleteRecoveryKey(input: string): boolean {
  return normalizeRecoveryKey(input).length === RECOVERY_KEY_LENGTH;
}

export function firstGroupOf(key: string): string {
  return normalizeRecoveryKey(key).slice(0, RECOVERY_KEY_GROUP);
}

/** The "I have really saved it" check: the user retypes the first group (case-insensitive, look-alikes tolerated). */
export function matchesFirstGroup(key: string, typed: string): boolean {
  const expected = firstGroupOf(key);
  return expected.length === RECOVERY_KEY_GROUP && normalizeRecoveryKey(typed) === expected;
}

/**
 * Re-formats a text field's value while the user types or pastes, and keeps the caret next to the same character
 * (inserting dashes would otherwise throw it to the end).
 */
export function formatWithCaret(value: string, caret: number): { value: string; caret: number } {
  const formatted = formatRecoveryKey(value);
  const before = Math.min(significantCharacters(value.slice(0, caret)).length, RECOVERY_KEY_LENGTH);
  const position = before === 0 ? 0 : before + Math.floor((before - 1) / RECOVERY_KEY_GROUP);
  return { value: formatted, caret: Math.min(position, formatted.length) };
}
