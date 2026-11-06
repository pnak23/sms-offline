// The static guard of the installer's cleanup of electron-builder's updater copy (desktop/build/installer.nsh, the owner's decision of 2026-11-06).
// The owner's conditions: delete ONLY ${APP_INSTALLER_STORE_FILE}; remove its folder ONLY IF EMPTY; never recursive deletion; never touch the school data folder, the
// database, the backups, the uploads or anything unrelated. These tests read files only (no installer is built or run); the packaged behaviour is tested by
// desktop/test/nsis-cleanup-selftest.mjs (a tiny NSIS program built from the real include) and by scripts/test-installer.ps1 / test-installer-upgrade.ps1 (the real installers).
// Run: node --test desktop/test/installerCleanup.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ALLOWED_SEQUENCE, checkInstallerIncludeFile, guardInstallerInclude } from '../../scripts/lib/installerCleanup.mjs';

const repo = path.resolve(import.meta.dirname, '..', '..');
const real = readFileSync(path.join(repo, 'desktop', 'build', 'installer.nsh'), 'utf8');

/** The real file with `from` replaced by `to` (it must be there: a test about a variant that does not differ from the real file would prove nothing). */
const swap = (from, to) => {
  assert.ok(real.includes(from), `the real file does not contain: ${from}`);
  return real.replace(from, () => to);   // a function, so that a "$" in the text is never read as a replacement pattern
};
const RMDIR = '    RMDir "$LOCALAPPDATA\\${KPSMS_UPDATER_DIR}"\n';
/** The real file with one extra line added inside the shared macro (right before the RMDir). */
const withExtraLine = (line) => swap(RMDIR, `    ${line}\n${RMDIR}`);

test('the real include file passes the guard, and says what it does', () => {
  const result = guardInstallerInclude(real);
  assert.deepEqual(result.problems, []);
  assert.equal(result.ok, true);
  assert.equal(result.code.length, ALLOWED_SEQUENCE.length);
  assert.equal(checkInstallerIncludeFile(repo).ok, true);
});

test('it deletes exactly one file, removes exactly one folder and only if it is empty, and uses the two hooks electron-builder calls', () => {
  const code = guardInstallerInclude(real).code;
  assert.deepEqual(code.filter((l) => /^Delete\b/.test(l)), ['Delete "$LOCALAPPDATA\\${APP_INSTALLER_STORE_FILE}"']);
  assert.deepEqual(code.filter((l) => /^RMDir\b/.test(l)), ['RMDir "$LOCALAPPDATA\\${KPSMS_UPDATER_DIR}"']);   // no /r: NSIS removes a folder only if it is empty
  assert.ok(code.includes('!macro customInstall'));
  assert.ok(code.includes('!macro customUnInstall'));
  assert.equal(code.filter((l) => l === '!insertmacro kpsmsRemoveUpdaterCopy').length, 2);
});

test('the file never names the school data folder or a path outside %LOCALAPPDATA%\\<updater folder> in code (only the comments may speak of them)', () => {
  const code = guardInstallerInclude(real).code.join('\n');
  for (const word of ['RuralSchoolManagement', '$APPDATA', '$INSTDIR', '$PROFILE', '$DOCUMENTS', '$DESKTOP', '$TEMP', '/r', '*', '?', 'Exec', 'WriteReg', 'DeleteReg', 'Rename', 'CopyFiles']) {
    assert.ok(!code.includes(word), `code must not contain ${word}`);
  }
});

test('the guard REFUSES every unsafe variant: recursion, wildcards, other paths, other commands, a second delete, a missing hook', () => {
  const unsafe = {
    'recursive deletion': swap('RMDir "$LOCALAPPDATA\\${KPSMS_UPDATER_DIR}"', 'RMDir /r "$LOCALAPPDATA\\${KPSMS_UPDATER_DIR}"'),
    'a wildcard delete': swap('Delete "$LOCALAPPDATA\\${APP_INSTALLER_STORE_FILE}"', 'Delete "$LOCALAPPDATA\\${KPSMS_UPDATER_DIR}\\*.*"'),
    'a second delete': withExtraLine('Delete "$LOCALAPPDATA\\RuralSchoolManagement\\database\\school.db"'),
    'the school data folder': withExtraLine('RMDir "$LOCALAPPDATA\\RuralSchoolManagement"'),
    'the roaming folder': withExtraLine('Delete "$APPDATA\\kpsms\\x.txt"'),
    'the install folder': withExtraLine('Delete "$INSTDIR\\resources\\backend\\sms-backend.jar"'),
    'a started program': withExtraLine('ExecWait "cmd /c rd /s /q C:\\x"'),
    'a registry change': withExtraLine('DeleteRegKey HKCU "Software\\x"'),
    'a plugin call': withExtraLine('nsExec::Exec "cmd /c dir"'),
    'a renamed delete target': swap('Delete "$LOCALAPPDATA\\${APP_INSTALLER_STORE_FILE}"', 'Delete "$LOCALAPPDATA\\${KPSMS_UPDATER_DIR}\\other.exe"'),
    'the compile-time check of the file name removed': swap('  !if "${KPSMS_UPDATER_FILE}" != "installer.exe"\n    !error "installer.nsh: the file is not installer.exe (${APP_INSTALLER_STORE_FILE})"\n  !endif\n', ''),
    'the compile-time check of the folder suffix removed': swap('  !if "${KPSMS_UPDATER_DIR}" != "${KPSMS_UPDATER_BASE}-updater"\n    !error "installer.nsh: the folder name does not end in -updater (${APP_INSTALLER_STORE_FILE})"\n  !endif\n', ''),
    'a compile-time check that no longer stops the build': swap('!error "installer.nsh: the folder name is empty (${APP_INSTALLER_STORE_FILE})"', '!warning "installer.nsh: the folder name is empty (${APP_INSTALLER_STORE_FILE})"'),
    'the hook for the install removed': swap('!macro customInstall\n    !insertmacro kpsmsRemoveUpdaterCopy\n  !macroend\n', ''),
    'the hook for the uninstall removed': swap('!macro customUnInstall\n    !insertmacro kpsmsRemoveUpdaterCopy\n  !macroend\n', ''),
    'an empty file': '',
    'only comments': '# nothing here\n',
  };
  for (const [name, text] of Object.entries(unsafe)) {
    assert.notDeepEqual(text, real, `the variant "${name}" must differ from the real file (the test itself would be wrong)`);
    const result = guardInstallerInclude(text);
    assert.equal(result.ok, false, `the guard must refuse ${name}`);
    assert.ok(result.problems.length > 0, name);
  }
});

test('a comment may mention anything, because a comment is not code', () => {
  assert.equal(guardInstallerInclude(`# this never touches RuralSchoolManagement, $APPDATA or RMDir /r\n${real}`).ok, true);
});

test('Windows line ends (CRLF) do not matter', () => {
  assert.equal(guardInstallerInclude(real.replace(/\n/g, '\r\n')).ok, true);
});

test('package.mjs names the include file and runs the guard before it builds, and the preflight runs the guard too', () => {
  const pkg = readFileSync(path.join(repo, 'desktop', 'scripts', 'package.mjs'), 'utf8');
  assert.match(pkg, /include:\s*path\.join\(desktop, 'build', 'installer\.nsh'\)/, 'nsis.include must name desktop/build/installer.nsh');
  assert.match(pkg, /checkInstallerIncludeFile/, 'package.mjs must run the guard');
  assert.ok(pkg.indexOf('checkInstallerIncludeFile') < pkg.indexOf('await build('), 'the guard must run before the build starts');
  const preflight = readFileSync(path.join(repo, 'scripts', 'release-preflight.mjs'), 'utf8');
  assert.match(preflight, /checkInstallerIncludeFile/, 'the preflight must run the guard');
});

test('the one-click, per-user settings the cleanup relies on are unchanged (a per-user install writes %LOCALAPPDATA%\\Programs, the user data is never removed)', () => {
  const pkg = readFileSync(path.join(repo, 'desktop', 'scripts', 'package.mjs'), 'utf8');
  assert.match(pkg, /perMachine:\s*false/);
  assert.match(pkg, /oneClick:\s*true/);
  assert.match(pkg, /deleteAppDataOnUninstall:\s*false/);
  assert.match(pkg, /publish:\s*'never'/);
});
