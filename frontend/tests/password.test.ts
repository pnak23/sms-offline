import { describe, expect, it } from 'vitest';
import {
  codePointLength,
  normalizeUsername,
  passwordIssues,
  passwordStrength,
  utf8ByteLength,
} from '~/utils/password';
import { usernameIssues } from '~/utils/username';

describe('password policy mirror (approved default 2)', () => {
  it('requires a value', () => {
    expect(passwordIssues('')).toEqual(['REQUIRED']);
  });

  it('counts characters as code points: 7 is too short, 8 is enough', () => {
    expect(passwordIssues('abcdefg')).toEqual(['PASSWORD_TOO_SHORT']);
    expect(passwordIssues('abcdefgh')).toEqual([]);
  });

  it('counts an emoji as one character, not two UTF-16 units', () => {
    const sevenWithEmoji = 'abcdef😀'; // 7 code points, 8 UTF-16 units
    expect(codePointLength(sevenWithEmoji)).toBe(7);
    expect(passwordIssues(sevenWithEmoji)).toEqual(['PASSWORD_TOO_SHORT']);
  });

  it('allows exactly 72 UTF-8 bytes and rejects 73', () => {
    expect(passwordIssues('a'.repeat(72))).toEqual([]);
    expect(passwordIssues('a'.repeat(73))).toEqual(['PASSWORD_TOO_LONG']);
  });

  it('applies the 72-BYTE limit to Khmer text (3 bytes per character): 24 characters pass, 25 do not', () => {
    const khmer24 = 'ក'.repeat(24);
    const khmer25 = 'ក'.repeat(25);
    expect(utf8ByteLength(khmer24)).toBe(72);
    expect(utf8ByteLength(khmer25)).toBe(75);
    expect(passwordIssues(khmer24)).toEqual([]);
    expect(passwordIssues(khmer25)).toEqual(['PASSWORD_TOO_LONG']);
  });

  it('counts a Khmer word by code points, not by what the eye sees (combining signs count)', () => {
    // "ភ្នំពេញ" is 7 code points (ភ ្ ន ំ ព េ ញ): too short for a password
    expect(codePointLength('ភ្នំពេញ')).toBe(7);
    expect(passwordIssues('ភ្នំពេញ')).toEqual(['PASSWORD_TOO_SHORT']);
    expect(passwordIssues('ភ្នំពេញ១')).toEqual([]);
  });

  it('rejects a password equal to the username, ignoring case and the NFC/trim normalisation', () => {
    expect(passwordIssues('Teacher01', '  teacher01 ')).toEqual(['PASSWORD_EQUALS_USERNAME']);
    expect(passwordIssues('different-pass', 'teacher01')).toEqual([]);
  });

  it('can report several problems at once', () => {
    expect(passwordIssues('a'.repeat(80), 'x')).toEqual(['PASSWORD_TOO_LONG']);
    expect(passwordIssues('short', 'short')).toEqual(['PASSWORD_TOO_SHORT', 'PASSWORD_EQUALS_USERNAME']);
  });
});

describe('password strength hint', () => {
  it('is none for empty, weak for anything the policy rejects', () => {
    expect(passwordStrength('')).toBe('none');
    expect(passwordStrength('abc')).toBe('weak');
    expect(passwordStrength('a'.repeat(80))).toBe('weak');
  });

  it('rises with length and variety', () => {
    expect(passwordStrength('abcdefgh')).toBe('weak');
    expect(passwordStrength('abcdefg1')).toBe('fair');
    expect(passwordStrength('Abcdefg1hijk')).toBe('good');
    expect(passwordStrength('correct horse battery')).not.toBe('weak');
  });
});

describe('username policy mirror', () => {
  it('normalises like the server: NFC, trim, lower-case', () => {
    expect(normalizeUsername('  Admin.User ')).toBe('admin.user');
    expect(normalizeUsername('é')).toBe('é');
  });

  it('requires a value', () => {
    expect(usernameIssues('   ')).toEqual(['REQUIRED']);
  });

  it('enforces 3-32 characters', () => {
    expect(usernameIssues('ab')).toEqual(['USERNAME_INVALID']);
    expect(usernameIssues('abc')).toEqual([]);
    expect(usernameIssues('a'.repeat(32))).toEqual([]);
    expect(usernameIssues('a'.repeat(33))).toEqual(['USERNAME_INVALID']);
  });

  it('allows letters, digits, dot, underscore and hyphen, including Khmer with its combining marks', () => {
    expect(usernameIssues('admin_01.x-y')).toEqual([]);
    expect(usernameIssues('គ្រូធំ')).toEqual([]);
    expect(usernameIssues('គ្រូ១២៣')).toEqual([]);
  });

  it('rejects spaces and symbols', () => {
    expect(usernameIssues('has space')).toEqual(['USERNAME_INVALID']);
    expect(usernameIssues('bad@name')).toEqual(['USERNAME_INVALID']);
    expect(usernameIssues('bad/name')).toEqual(['USERNAME_INVALID']);
  });
});
