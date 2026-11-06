// A functional test of the installer's cleanup (desktop/build/installer.nsh) WITHOUT building or running the product installer.
// It compiles a tiny throw-away NSIS program in a temporary folder with the NSIS compiler that electron-builder cached (D21), including the REAL desktop/build/installer.nsh,
// and with the define the way electron-builder passes it (-DAPP_INSTALLER_STORE_FILE=...) but with a UNIQUE test folder name, so the real %LOCALAPPDATA%\kpsms-updater is never
// touched. The program runs the two hooks (customInstall, customUnInstall) on files it makes itself, writes what it saw to a file, and removes everything it made.
// What it proves (the owner's conditions of 2026-11-06):
//   S1  after the install hook the copy is gone and the EMPTY folder is gone
//   S2  with a dummy file next to the copy, the uninstall hook removes only the copy: the dummy file, a sub-folder with a file and the folder itself are PRESERVED
//   S3  a sibling folder with a similar name is never touched
//   S4  with nothing there at all the hooks run without a problem (no error, nothing made)
//   C1  with the real define ("kpsms-updater\installer.exe") the include compiles and reads the folder name "kpsms-updater"
//   C2  a define without a folder makes the build FAIL (so a broken cleanup cannot be shipped silently)
//   C3  without the define the include does nothing and compiles
// Needs the electron-builder NSIS cache (scripts/release-preflight.mjs checks it). Runs one tiny test program on this PC; builds no installer.
// Usage: node desktop/test/nsis-cleanup-selftest.mjs
import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..', '..');
const include = path.join(root, 'desktop', 'build', 'installer.nsh');
let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`); };

/** The NSIS compiler of electron-builder's cache (nsis-3.x/<hash>/Bin/makensis.exe). */
function findNsis() {
  const cache = path.join(process.env.LOCALAPPDATA ?? '', 'electron-builder', 'Cache');
  if (!existsSync(cache)) return null;
  for (const top of readdirSync(cache).filter((n) => /^nsis-3/.test(n) && !n.startsWith('nsis-resources'))) {
    for (const inner of readdirSync(path.join(cache, top), { withFileTypes: true }).filter((d) => d.isDirectory())) {
      const dir = path.join(cache, top, inner.name);
      if (existsSync(path.join(dir, 'Bin', 'makensis.exe'))) return { dir, exe: path.join(dir, 'Bin', 'makensis.exe') };
    }
  }
  return null;
}
const nsis = findNsis();
if (!nsis) { console.error('The NSIS compiler is not in electron-builder\'s cache (%LOCALAPPDATA%\\electron-builder\\Cache\\nsis-3*): nothing was tested.'); process.exit(2); }

const work = mkdtempSync(path.join(tmpdir(), 'kpsms nsis selftest '));
const token = randomBytes(4).toString('hex');
const testDir = `kpsms-nsis-selftest-${token}-updater`;     // under %LOCALAPPDATA%; never the real kpsms-updater
const siblingDir = `${testDir}-sibling`;
const localAppData = process.env.LOCALAPPDATA;
const compile = (script, defines, outName) => {
  const file = path.join(work, `${outName}.nsi`);
  writeFileSync(file, script, 'utf8');
  const args = ['/V2', '-INPUTCHARSET', 'UTF8', ...defines.map((d) => `-D${d}`), file];
  const r = spawnSync(nsis.exe, args, { cwd: work, encoding: 'utf8', env: { ...process.env, NSISDIR: nsis.dir } });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};
const head = (outFile) => `Unicode true\nRequestExecutionLevel user\nSilentInstall silent\nName "KPSMS cleanup self-test"\nOutFile "${outFile}"\n!include "LogicLib.nsh"\n!include "${include}"\n`;

try {
  // ---- the program that runs the hooks ----
  const exe = path.join(work, 'selftest.exe');
  const D = `$LOCALAPPDATA\\${testDir}`;
  const S = `$LOCALAPPDATA\\${siblingDir}`;
  const store = `$LOCALAPPDATA\\\${APP_INSTALLER_STORE_FILE}`;
  const say = (text) => `  FileWrite $log "${text}$\\r$\\n"\n`;
  const yesNo = (label, path_) => `  \${If} \${FileExists} "${path_}"\n${say(`${label}=YES`)}  \${Else}\n${say(`${label}=NO`)}  \${EndIf}\n`;
  const makeCopy = `  CreateDirectory "${D}"\n  FileOpen $0 "${store}" w\n  FileWrite $0 "pretend copy of the installer"\n  FileClose $0\n`;
  const makeFile = (p, text) => `  FileOpen $0 "${p}" w\n  FileWrite $0 "${text}"\n  FileClose $0\n`;
  const program = `${head(exe)}Var log\nSection "selftest"\n  FileOpen $log "$EXEDIR\\result.txt" w\n`
    // a sibling folder with a similar name, which the hooks must never touch
    + `  CreateDirectory "${S}"\n${makeFile(`${S}\\sibling.txt`, 'not ours')}`
    // S1: the install hook removes the copy and then the empty folder
    + makeCopy + '  !insertmacro customInstall\n' + yesNo('S1 copy-still-there', `${D}\\installer.exe`) + yesNo('S1 folder-still-there', D)
    // S2: the uninstall hook with other files there: only the copy goes
    + makeCopy + makeFile(`${D}\\keep-me.txt`, 'a dummy file that is not ours') + `  CreateDirectory "${D}\\sub"\n` + makeFile(`${D}\\sub\\deep.txt`, 'a file in a sub-folder')
    + '  !insertmacro customUnInstall\n' + yesNo('S2 copy-still-there', `${D}\\installer.exe`) + yesNo('S2 dummy-file-still-there', `${D}\\keep-me.txt`) + yesNo('S2 sub-file-still-there', `${D}\\sub\\deep.txt`) + yesNo('S2 folder-still-there', D)
    // the test removes what it made (its own plain commands, not the hooks)
    + `  Delete "${D}\\keep-me.txt"\n  Delete "${D}\\sub\\deep.txt"\n  RMDir "${D}\\sub"\n  RMDir "${D}"\n`
    // S4: nothing there at all: both hooks must run without a problem
    + '  !insertmacro customInstall\n  !insertmacro customUnInstall\n' + yesNo('S4 folder-made-by-hook', D)
    // S3: the sibling is untouched
    + yesNo('S3 sibling-file-still-there', `${S}\\sibling.txt`)
    + `  Delete "${S}\\sibling.txt"\n  RMDir "${S}"\n  FileClose $log\nSectionEnd\n`;
  const built = compile(program, [`APP_INSTALLER_STORE_FILE=${testDir}\\installer.exe`], 'selftest');
  check('NSIS compiles the real include with a define passed the way electron-builder passes it', built.status === 0 && existsSync(exe), built.status === 0 ? '' : built.out.slice(-400));
  if (built.status === 0 && existsSync(exe)) {
    execFileSync(exe, [], { timeout: 60_000 });
    const result = Object.fromEntries(readFileSync(path.join(work, 'result.txt'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => l.split('=')));
    check('S1 the install hook removes the copy of the installer', result['S1 copy-still-there'] === 'NO', JSON.stringify(result['S1 copy-still-there']));
    check('S1 ...and the folder, because it was empty', result['S1 folder-still-there'] === 'NO', JSON.stringify(result['S1 folder-still-there']));
    check('S2 the uninstall hook removes the copy of the installer', result['S2 copy-still-there'] === 'NO');
    check('S2 DUMMY FILE PRESERVED: another file in the folder is not touched', result['S2 dummy-file-still-there'] === 'YES');
    check('S2 a file inside a sub-folder is preserved too (nothing is deleted recursively)', result['S2 sub-file-still-there'] === 'YES');
    check('S2 the folder is NOT removed while it holds anything else', result['S2 folder-still-there'] === 'YES');
    check('S3 a sibling folder with a similar name is never touched', result['S3 sibling-file-still-there'] === 'YES');
    check('S4 with nothing there both hooks run clean and make nothing', result['S4 folder-made-by-hook'] === 'NO');
    const left = readdirSync(localAppData).filter((n) => n.includes(token));
    check('the test removed everything it made: no test folder is left in %LOCALAPPDATA%', left.length === 0, left.join(', '));
  }

  // ---- compile-only checks ----
  const stubHead = (name) => head(path.join(work, `${name}.exe`));
  const c1 = compile(`${stubHead('c1')}!if "\${KPSMS_UPDATER_DIR}" != "kpsms-updater"\n  !error "the updater folder was read as \${KPSMS_UPDATER_DIR}"\n!endif\nSection\nSectionEnd\n`, ['APP_INSTALLER_STORE_FILE=kpsms-updater\\installer.exe'], 'c1');
  check('C1 with the real define ("kpsms-updater\\installer.exe") the include compiles and reads the folder name "kpsms-updater"', c1.status === 0, c1.status === 0 ? '' : c1.out.slice(-300));
  // a define of the wrong shape must STOP the build, with a clear message, so a misdirected delete can never be shipped
  const wrong = [
    ['installer.exe', /has no folder/, 'no folder'],
    ['\\installer.exe', /folder name is empty/, 'an empty folder name'],
    ['kpsms-updater\\other.exe', /file is not installer\.exe/, 'another file name'],
    ['kpsms\\installer.exe', /does not end in -updater/, 'a folder without the -updater ending'],
    ['a\\b-updater\\installer.exe', /file is not installer\.exe/, 'a nested path'],
  ];
  wrong.forEach(([define, message, what], i) => {
    const r = compile(`${stubHead(`c2${i}`)}Section\nSectionEnd\n`, [`APP_INSTALLER_STORE_FILE=${define}`], `c2${i}`);
    check(`C2 a define with ${what} ("${define}") makes the build FAIL with a clear message`, r.status !== 0 && message.test(r.out), `exit ${r.status}`);
  });
  const c3 = compile(`${stubHead('c3')}!ifmacrodef customInstall\n  !error "the hooks must not exist without the define"\n!endif\nSection\nSectionEnd\n`, [], 'c3');
  check('C3 without the define the include does nothing and compiles', c3.status === 0, c3.status === 0 ? '' : c3.out.slice(-300));
} finally {
  rmSync(work, { recursive: true, force: true });
  for (const n of [testDir, siblingDir]) rmSync(path.join(localAppData, n), { recursive: true, force: true });   // only the unique test names made above
}
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
