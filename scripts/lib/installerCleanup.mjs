// The safety guard of desktop/build/installer.nsh (the cleanup of electron-builder's updater copy, owner's decision of 2026-11-06).
// The owner's conditions: delete ONLY ${APP_INSTALLER_STORE_FILE}; remove its folder ONLY IF IT IS EMPTY; never use recursive deletion; never touch the school data folder,
// the database, the backups, the uploads or anything unrelated. The guard is a WHITELIST: apart from comments and blank lines the file may contain only the lines below,
// in the places below, so that nothing else (a second Delete, a wildcard, RMDir /r, a path under $APPDATA, a program started) can get in unnoticed.
// Used by desktop/test/installerCleanup.test.mjs, desktop/scripts/package.mjs (the build stops) and scripts/release-preflight.mjs.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Every code line the include file may contain (after trimming), in the order they must appear. */
const COMPILE_ERROR = /^!error "installer\.nsh: [^"$]*\(\$\{APP_INSTALLER_STORE_FILE\}\)"$/;   // a message that ends with the define it complains about
export const ALLOWED_SEQUENCE = [
  '!ifdef APP_INSTALLER_STORE_FILE',
  // the shape of the define is checked at COMPILE time: <folder>\installer.exe with a folder that ends in -updater; anything else stops the build
  '!searchparse /noerrors "${APP_INSTALLER_STORE_FILE}" "" KPSMS_UPDATER_DIR "\\" KPSMS_UPDATER_FILE',
  '!ifndef KPSMS_UPDATER_FILE',
  COMPILE_ERROR,
  '!endif',
  '!if "${KPSMS_UPDATER_FILE}" != "installer.exe"',
  COMPILE_ERROR,
  '!endif',
  '!searchparse /noerrors "${KPSMS_UPDATER_DIR}" "" KPSMS_UPDATER_BASE "-updater"',
  '!ifndef KPSMS_UPDATER_BASE',
  COMPILE_ERROR,
  '!endif',
  '!if "${KPSMS_UPDATER_DIR}" != "${KPSMS_UPDATER_BASE}-updater"',
  COMPILE_ERROR,
  '!endif',
  '!macro kpsmsRemoveUpdaterCopy',
  'Delete "$LOCALAPPDATA\\${APP_INSTALLER_STORE_FILE}"',
  'RMDir "$LOCALAPPDATA\\${KPSMS_UPDATER_DIR}"',
  'ClearErrors',
  '!macroend',
  '!macro customInstall',
  '!insertmacro kpsmsRemoveUpdaterCopy',
  '!macroend',
  '!macro customUnInstall',
  '!insertmacro kpsmsRemoveUpdaterCopy',
  '!macroend',
  '!endif',
];

/** Words that must never appear in the executable part of the file, whatever the line (each gives a clear message). */
const FORBIDDEN = [
  [/\/r\b/i, 'a recursive switch (/r): recursive deletion is never allowed'],
  [/[*?]/, 'a wildcard: only the one named file may be deleted'],
  [/RuralSchoolManagement/i, 'the school data folder'],
  [/\$APPDATA|\$INSTDIR|\$PROFILE|\$DOCUMENTS|\$DESKTOP|\$TEMP|\$PLUGINSDIR|\$PROGRAMFILES|\$SMPROGRAMS/i, 'a folder other than %LOCALAPPDATA%\\<updater folder>'],
  [/SetShellVarContext|ExecWait|ExecShell|Exec\b|nsExec|System::|RMDir\s+\/|Rename\b|CopyFiles|Delete\s+\/REBOOTOK|WriteRegStr|DeleteReg/i, 'a command that is not part of the approved cleanup'],
];

/** Checks the text of the include file. Returns { ok, problems, code } (code = the code lines found). */
export function guardInstallerInclude(text) {
  const problems = [];
  const lines = String(text).replace(/\r\n/g, '\n').split('\n').map((l) => l.trim());
  const code = lines.filter((l) => l !== '' && !l.startsWith('#') && !l.startsWith(';'));
  for (const line of code) {
    for (const [pattern, why] of FORBIDDEN) if (pattern.test(line)) problems.push(`"${line}" contains ${why}`);
  }
  if (code.length !== ALLOWED_SEQUENCE.length) problems.push(`the file has ${code.length} code lines, the approved cleanup has exactly ${ALLOWED_SEQUENCE.length}`);
  ALLOWED_SEQUENCE.forEach((expected, i) => {
    const line = code[i];
    if (line === undefined) return;
    const same = expected instanceof RegExp ? expected.test(line) : line === expected;
    if (!same) problems.push(`code line ${i + 1} is "${line}", expected ${expected instanceof RegExp ? String(expected) : `"${expected}"`}`);
  });
  const count = (re) => code.filter((l) => re.test(l)).length;
  if (count(/^Delete\b/) !== 1) problems.push(`exactly one Delete is allowed, found ${count(/^Delete\b/)}`);
  if (count(/^RMDir\b/) !== 1) problems.push(`exactly one RMDir (without /r) is allowed, found ${count(/^RMDir\b/)}`);
  return { ok: problems.length === 0, problems, code };
}

/** Reads and checks desktop/build/installer.nsh of a repository. */
export function checkInstallerIncludeFile(root) {
  const file = path.join(root, 'desktop', 'build', 'installer.nsh');
  if (!existsSync(file)) return { ok: false, problems: ['desktop/build/installer.nsh is missing'], code: [] };
  return guardInstallerInclude(readFileSync(file, 'utf8'));
}
