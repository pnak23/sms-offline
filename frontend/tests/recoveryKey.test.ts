import { describe, expect, it } from 'vitest';
import {
  firstGroupOf,
  formatRecoveryKey,
  formatWithCaret,
  isCompleteRecoveryKey,
  matchesFirstGroup,
  normalizeRecoveryKey,
} from '~/utils/recoveryKey';

const KEY = 'AB3D5-F7G9H-JKMNP-QRSTV-WXYZ0';

describe('recovery key formatting', () => {
  it('groups 25 characters as XXXXX-XXXXX-XXXXX-XXXXX-XXXXX', () => {
    expect(formatRecoveryKey('AB3D5F7G9HJKMNPQRSTVWXYZ0')).toBe(KEY);
  });

  it('upper-cases and accepts dashes, spaces and line breaks from a paste', () => {
    expect(formatRecoveryKey('  ab3d5-f7g9h\nJKMNP qrstv wxyz0 ')).toBe(KEY);
  });

  it('maps look-alikes exactly like the backend: O -> 0, I and L -> 1', () => {
    expect(normalizeRecoveryKey('oilOIL')).toBe('011011');
  });

  it('drops characters that can never be part of a key (U and symbols) and caps at 25', () => {
    expect(normalizeRecoveryKey('UU!!AB3D5F7G9HJKMNPQRSTVWXYZ0EXTRA')).toBe('AB3D5F7G9HJKMNPQRSTVWXYZ0');
  });

  it('formats partial input while typing without a trailing dash', () => {
    expect(formatRecoveryKey('ab3d5f')).toBe('AB3D5-F');
    expect(formatRecoveryKey('ab3d5')).toBe('AB3D5');
    expect(formatRecoveryKey('')).toBe('');
  });

  it('is idempotent', () => {
    expect(formatRecoveryKey(formatRecoveryKey('ab3d5f7g9h'))).toBe('AB3D5-F7G9H');
  });

  it('knows when the key is complete', () => {
    expect(isCompleteRecoveryKey(KEY)).toBe(true);
    expect(isCompleteRecoveryKey(KEY.slice(0, -1))).toBe(false);
    expect(isCompleteRecoveryKey('')).toBe(false);
  });
});

describe('recovery key confirmation (retype the first group)', () => {
  it('returns the first group', () => {
    expect(firstGroupOf(KEY)).toBe('AB3D5');
  });

  it('accepts the first group in any case, with or without the dash and spaces', () => {
    expect(matchesFirstGroup(KEY, 'AB3D5')).toBe(true);
    expect(matchesFirstGroup(KEY, 'ab3d5')).toBe(true);
    expect(matchesFirstGroup(KEY, ' ab3d5 ')).toBe(true);
    expect(matchesFirstGroup(KEY, 'AB3D5-')).toBe(true);
  });

  it('tolerates look-alike letters, because the server does', () => {
    expect(matchesFirstGroup('0IB3D-F7G9H-JKMNP-QRSTV-WXYZ0', 'OlB3D')).toBe(true);
  });

  it('rejects a wrong, short or empty entry', () => {
    expect(matchesFirstGroup(KEY, 'AB3D6')).toBe(false);
    expect(matchesFirstGroup(KEY, 'AB3D')).toBe(false);
    expect(matchesFirstGroup(KEY, '')).toBe(false);
  });

  it('never matches when no key is held', () => {
    expect(matchesFirstGroup('', '')).toBe(false);
    expect(matchesFirstGroup('', 'AB3D5')).toBe(false);
  });
});

describe('caret position while auto-formatting', () => {
  it('keeps the caret after the typed character across an inserted dash', () => {
    // user typed the 6th character at the end of "AB3D5"
    expect(formatWithCaret('AB3D5F', 6)).toEqual({ value: 'AB3D5-F', caret: 7 });
  });

  it('keeps the caret in place when editing in the middle', () => {
    expect(formatWithCaret('AB3D5-F7G9H', 2)).toEqual({ value: 'AB3D5-F7G9H', caret: 2 });
  });

  it('places the caret at the end of a pasted key', () => {
    const pasted = 'ab3d5f7g9hjkmnpqrstvwxyz0';
    expect(formatWithCaret(pasted, pasted.length)).toEqual({ value: KEY, caret: KEY.length });
  });

  it('puts the caret before a dash when a group is exactly full', () => {
    expect(formatWithCaret('AB3D5', 5)).toEqual({ value: 'AB3D5', caret: 5 });
  });
});
