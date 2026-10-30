// Assembles the installer (docs §8). Usage: node desktop/scripts/package.mjs [nsis|dir]
//  nsis (default): one-click per-user Windows installer in desktop/release
//  dir           : unpacked app in desktop/release/win-unpacked (fast to test)
// Inputs that must exist first: backend/target/extracted (npm run backend:build + scripts/extract-backend.mjs),
// desktop/build/jre (scripts/build-jre.mjs), frontend/.output/public (npm run frontend:build).
import { build, Platform } from 'electron-builder';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const desktop = path.resolve(import.meta.dirname, '..');
const root = path.resolve(desktop, '..');
const target = process.argv[2] === 'dir' ? 'dir' : 'nsis';
const stage = path.join(desktop, 'build', 'stage');

const sources = {
  web: process.env.SMS_WEB_SOURCE ? path.resolve(process.env.SMS_WEB_SOURCE) : path.join(root, 'frontend', '.output', 'public'),
  backend: path.join(root, 'backend', 'target', 'extracted'),
  jre: path.join(desktop, 'build', 'jre'),
};
for (const [name, dir] of Object.entries(sources)) {
  if (!existsSync(dir)) { console.error(`Missing ${name}: ${dir}`); process.exit(1); }
}

execFileSync(process.execPath, [path.join(desktop, 'scripts', 'build.mjs')], { stdio: 'inherit' });
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const [name, dir] of Object.entries(sources)) cpSync(dir, path.join(stage, name), { recursive: true });
console.log('staged:', Object.keys(sources).join(', '));

await build({
  projectDir: desktop,                              // the app (package.json with "main") is desktop/, not the repo root
  targets: Platform.WINDOWS.createTarget(target, 1 /* Arch.x64 */),
  publish: 'never',
  config: {
    appId: 'kh.school.sms',
    productName: 'School Management',
    executableName: 'SchoolManagement',
    copyright: 'School Management',
    directories: { output: path.join(desktop, 'release'), buildResources: path.join(desktop, 'build') },
    // Per-user NSIS installs go to %LOCALAPPDATA%\Programs\<package name>; without this it would be the workspace name "desktop".
    extraMetadata: { name: 'school-management' },
    asar: true,
    // Electron fuses are flipped inside the shipped exe and cannot be re-enabled at run time: the installed app ignores
    // ELECTRON_RUN_AS_NODE / NODE_OPTIONS / --inspect and only loads its code from the integrity-checked asar.
    electronFuses: {
      runAsNode: false,
      enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false,
      enableEmbeddedAsarIntegrityValidation: true,
      onlyLoadAppFromAsar: true,
      grantFileProtocolExtraPrivileges: false,
    },
    files: ['dist/**', 'package.json'],
    // Outside the asar on purpose: java.exe must be a real file on disk.
    extraResources: [{ from: path.join(stage, 'jre'), to: 'jre' }, { from: path.join(stage, 'backend'), to: 'backend' }, { from: path.join(stage, 'web'), to: 'web' }],
    win: { target: [{ target, arch: ['x64'] }], icon: path.join(desktop, 'build', 'icon.ico') },
    nsis: {
      oneClick: true,                              // no wizard: one click, no questions
      perMachine: false,                           // per-user install: no administrator prompt, never writes to Program Files
      allowToChangeInstallationDirectory: false,
      createDesktopShortcut: 'always',
      createStartMenuShortcut: true,
      shortcutName: 'School Management',
      runAfterFinish: true,
      deleteAppDataOnUninstall: false,             // user data lives in %LOCALAPPDATA%\RuralSchoolManagement and is never touched
      artifactName: 'SchoolManagement-Setup-${version}.${ext}',
    },
    compression: 'normal',
  },
});
