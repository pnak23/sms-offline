import { describe, expect, it } from 'vitest';
import { academicYearSchema, subjectSchema } from '~/schemas/academic';
import { adminSchema, createChangePasswordSchema, loginSchema, recoverSchema } from '~/schemas/auth';
import { preferencesSchema } from '~/schemas/preferences';
import { schoolSchema } from '~/schemas/school';
import { asciiDigitsToKhmer, khmerDigitsToAscii, parseWholeNumber } from '~/utils/khmer';
import { logoFileIssue } from '~/utils/image';
import { toIsoDate } from '~/utils/date';

/** field -> first message (a validation code) */
function issues(schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } } }, value: unknown) {
  const result = schema.safeParse(value);
  const out: Record<string, string> = {};
  if (!result.success) for (const issue of result.error?.issues ?? []) out[String(issue.path[0])] ??= issue.message;
  return out;
}

const admin = { displayName: 'អ្នកគ្រប់គ្រង', username: 'admin', password: 'Sch00l-Khmer!', confirmPassword: 'Sch00l-Khmer!' };

describe('administrator form (wizard step 2)', () => {
  it('accepts valid input', () => {
    expect(issues(adminSchema, admin)).toEqual({});
  });

  it('reports required fields with the REQUIRED code', () => {
    expect(issues(adminSchema, { displayName: '', username: '', password: '', confirmPassword: '' })).toEqual({
      displayName: 'REQUIRED',
      username: 'REQUIRED',
      password: 'REQUIRED',
      confirmPassword: 'REQUIRED',
    });
  });

  it('mirrors the server rules (username, password length in characters and bytes, equals username, confirmation)', () => {
    expect(issues(adminSchema, { ...admin, username: 'ab' }).username).toBe('USERNAME_INVALID');
    expect(issues(adminSchema, { ...admin, password: 'short', confirmPassword: 'short' }).password).toBe('PASSWORD_TOO_SHORT');
    expect(issues(adminSchema, { ...admin, password: 'ក'.repeat(25), confirmPassword: 'ក'.repeat(25) }).password).toBe('PASSWORD_TOO_LONG');
    expect(issues(adminSchema, { ...admin, username: 'Teacher01', password: 'teacher01', confirmPassword: 'teacher01' }).password).toBe('PASSWORD_EQUALS_USERNAME');
    expect(issues(adminSchema, { ...admin, confirmPassword: 'other-password' }).confirmPassword).toBe('PASSWORDS_DO_NOT_MATCH');
  });

  it('does not trim passwords (a space is part of the password)', () => {
    expect(issues(adminSchema, { ...admin, password: '  spaced pass  ', confirmPassword: '  spaced pass  ' })).toEqual({});
    expect(issues(adminSchema, { ...admin, password: '  spaced pass  ', confirmPassword: 'spaced pass' }).confirmPassword).toBe('PASSWORDS_DO_NOT_MATCH');
  });
});

describe('login, recovery and change-password forms', () => {
  it('login only requires both fields (the policy may change; the server decides)', () => {
    expect(issues(loginSchema, { username: ' ', password: 'x' }).username).toBe('REQUIRED');
    expect(issues(loginSchema, { username: 'admin', password: '' }).password).toBe('REQUIRED');
    expect(issues(loginSchema, { username: 'admin', password: 'x' })).toEqual({});
  });

  it('recovery needs a complete 25-character key (any case, with or without dashes) and a valid new password', () => {
    const base = { recoveryKey: 'ab3d5-f7g9h-jkmnp-qrstv-wxyz0', newPassword: 'New-Password-1', confirmPassword: 'New-Password-1' };
    expect(issues(recoverSchema, base)).toEqual({});
    expect(issues(recoverSchema, { ...base, recoveryKey: 'ab3d5f7g9hjkmnpqrstvwxyz0' })).toEqual({});
    expect(issues(recoverSchema, { ...base, recoveryKey: 'AB3D5-F7G9H' }).recoveryKey).toBe('RECOVERY_KEY_INCOMPLETE');
    expect(issues(recoverSchema, { ...base, newPassword: 'short', confirmPassword: 'short' }).newPassword).toBe('PASSWORD_TOO_SHORT');
    expect(issues(recoverSchema, { ...base, confirmPassword: 'nope' }).confirmPassword).toBe('PASSWORDS_DO_NOT_MATCH');
  });

  it('change-password compares the new password with the signed-in username', () => {
    const schema = createChangePasswordSchema(() => 'Admin');
    expect(issues(schema, { currentPassword: 'old', newPassword: 'admin', confirmPassword: 'admin' }).newPassword).toBe('PASSWORD_TOO_SHORT');
    expect(issues(schema, { currentPassword: 'old', newPassword: 'New-Password-1', confirmPassword: 'New-Password-1' })).toEqual({});
    expect(issues(createChangePasswordSchema(() => 'new-password-1'), { currentPassword: 'old', newPassword: 'NEW-PASSWORD-1', confirmPassword: 'NEW-PASSWORD-1' }).newPassword).toBe('PASSWORD_EQUALS_USERNAME');
  });
});

describe('school, academic year and preferences forms', () => {
  it('school: Khmer name required, limits mirror the backend (200/200/500/50/150)', () => {
    const ok = { nameKm: 'សាលាបឋមសិក្សា ភូមិថ្មី', nameEn: '', address: '', phone: '', directorName: '' };
    expect(issues(schoolSchema, ok)).toEqual({});
    expect(issues(schoolSchema, { ...ok, nameKm: '   ' }).nameKm).toBe('REQUIRED');
    expect(issues(schoolSchema, { ...ok, nameKm: 'ក'.repeat(201) }).nameKm).toBe('Size');
    expect(issues(schoolSchema, { ...ok, address: 'x'.repeat(501) }).address).toBe('Size');
    expect(issues(schoolSchema, { ...ok, phone: '1'.repeat(51) }).phone).toBe('Size');
    expect(issues(schoolSchema, { ...ok, directorName: 'x'.repeat(151) }).directorName).toBe('Size');
  });

  it('academic year: dates are required, must be real dates, and end after start', () => {
    const ok = { nameKm: '២០២៦-២០២៧', startDate: '2026-11-02', endDate: '2027-08-31' };
    expect(issues(academicYearSchema, ok)).toEqual({});
    expect(issues(academicYearSchema, { ...ok, startDate: '' }).startDate).toBe('REQUIRED');
    expect(issues(academicYearSchema, { ...ok, endDate: '2027-02-30' }).endDate).toBe('INVALID_DATE');
    expect(issues(academicYearSchema, { ...ok, endDate: '2026-11-02' }).endDate).toBe('END_BEFORE_START');
    expect(issues(academicYearSchema, { ...ok, nameKm: 'x'.repeat(51) }).nameKm).toBe('Size');
  });

  it('preferences: whole numbers in range, Khmer digits accepted', () => {
    expect(issues(preferencesSchema, { reminderDays: '7', idleLockMinutes: '10' })).toEqual({});
    expect(issues(preferencesSchema, { reminderDays: '១៥', idleLockMinutes: '១២០' })).toEqual({});
    expect(issues(preferencesSchema, { reminderDays: '0', idleLockMinutes: '121' })).toEqual({ idleLockMinutes: 'OUT_OF_RANGE' });   // 0 = no reminder to copy a backup to a USB stick
    expect(issues(preferencesSchema, { reminderDays: '-1', idleLockMinutes: '3' }).reminderDays).toBeTruthy();
    expect(issues(preferencesSchema, { reminderDays: '91', idleLockMinutes: '3' }).reminderDays).toBe('OUT_OF_RANGE');
    expect(issues(preferencesSchema, { reminderDays: '1.5', idleLockMinutes: 'abc' })).toEqual({ reminderDays: 'INVALID_NUMBER', idleLockMinutes: 'INVALID_NUMBER' });
    expect(issues(preferencesSchema, { reminderDays: '', idleLockMinutes: '1' }).reminderDays).toBe('REQUIRED');
  });

  it('subject: the Khmer name is required, the English name optional, both at most 100 characters', () => {
    expect(issues(subjectSchema, { nameKm: 'កុំព្យូទ័រ', nameEn: '' })).toEqual({});
    expect(issues(subjectSchema, { nameKm: '  កុំព្យូទ័រ ', nameEn: 'Computer' })).toEqual({});
    expect(issues(subjectSchema, { nameKm: '   ', nameEn: '' })).toEqual({ nameKm: 'REQUIRED' });
    expect(issues(subjectSchema, { nameKm: 'ក'.repeat(101), nameEn: 'x'.repeat(101) })).toEqual({ nameKm: 'Size', nameEn: 'Size' });
  });
});

describe('Khmer digits, dates and logo checks', () => {
  it('converts Khmer digits both ways and leaves other text alone', () => {
    expect(khmerDigitsToAscii('០១២ ៣៤៥-៦៧៨៩ abc')).toBe('012 345-6789 abc');
    expect(asciiDigitsToKhmer('2026-2027')).toBe('២០២៦-២០២៧');
    expect(parseWholeNumber(' ១៥ ')).toBe(15);
    expect(parseWholeNumber('1e3')).toBeNaN();
    expect(parseWholeNumber('-4')).toBeNaN();
  });

  it('validates ISO dates strictly', () => {
    expect(toIsoDate('2028-02-29')).toBe('2028-02-29');
    expect(toIsoDate('2027-02-29')).toBeNull();
    expect(toIsoDate('2027-13-01')).toBeNull();
    expect(toIsoDate('27-01-01')).toBeNull();
  });

  it('checks the logo file before upload: PNG/JPG only, at most 5 MB', () => {
    expect(logoFileIssue({ type: 'image/png', size: 1000, name: 'a.png' })).toBeNull();
    expect(logoFileIssue({ type: 'image/jpeg', size: 5 * 1024 * 1024, name: 'a.jpg' })).toBeNull();
    expect(logoFileIssue({ type: 'image/jpeg', size: 5 * 1024 * 1024 + 1, name: 'a.jpg' })).toBe('FILE_TOO_LARGE');
    expect(logoFileIssue({ type: 'image/gif', size: 100, name: 'a.gif' })).toBe('INVALID_FILE_TYPE');
    expect(logoFileIssue({ type: 'application/pdf', size: 100, name: 'a.pdf' })).toBe('INVALID_FILE_TYPE');
    expect(logoFileIssue({ type: '', size: 100, name: 'photo.JPG' })).toBeNull(); // some systems give no MIME type
    expect(logoFileIssue({ type: 'image/png', size: 0, name: 'empty.png' })).toBe('INVALID_IMAGE');
  });
});
