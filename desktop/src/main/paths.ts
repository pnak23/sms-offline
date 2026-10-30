import { app } from 'electron';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/** %LOCALAPPDATA% (Electron has no path name for it; Windows always sets the variable). */
function localAppData(): string {
  return process.env.LOCALAPPDATA ?? path.join(app.getPath('home'), 'AppData', 'Local');
}

/** Repo root when running unpackaged (desktop/dist/main.cjs -> ../..). */
const repoRoot = path.resolve(__dirname, '..', '..');

export interface Paths {
  dataDir: string;
  logsDir: string;
  configDir: string;
  webRoot: string;
  backendJar: string;
  javaExe: string;
}

/**
 * Data lives in %LOCALAPPDATA%\RuralSchoolManagement (docs §7) — never inside the install directory, so upgrades and
 * uninstalls cannot touch it. Unpackaged runs use SMS_DATA_DIR or <repo>/.dev-data.
 */
export function resolvePaths(): Paths {
  const dataDir = process.env.SMS_DATA_DIR
    ? path.resolve(process.env.SMS_DATA_DIR)
    : app.isPackaged ? path.join(localAppData(), 'RuralSchoolManagement') : path.join(repoRoot, '.dev-data');
  for (const sub of ['database', 'logs', 'config', 'backups', 'uploads/students', 'uploads/school']) {
    mkdirSync(path.join(dataDir, sub), { recursive: true });
  }

  if (app.isPackaged) {
    const res = process.resourcesPath;
    return {
      dataDir, logsDir: path.join(dataDir, 'logs'), configDir: path.join(dataDir, 'config'),
      webRoot: path.join(res, 'web'),
      backendJar: path.join(res, 'backend', 'sms-backend.jar'),
      javaExe: path.join(res, 'jre', 'bin', 'java.exe'),
    };
  }
  const javaHome = [process.env.JAVA_HOME, path.join(homedir(), '.jdks', 'corretto-21.0.6')]
    .filter((v): v is string => !!v).find((c) => existsSync(path.join(c, 'bin', 'java.exe')));
  const extracted = path.join(repoRoot, 'backend', 'target', 'extracted', 'sms-backend.jar');
  // SMS_WEB_ROOT / SMS_JAVA_EXE exist ONLY for unpackaged runs (tests, development); an installed app ignores them.
  return {
    dataDir, logsDir: path.join(dataDir, 'logs'), configDir: path.join(dataDir, 'config'),
    webRoot: process.env.SMS_WEB_ROOT ? path.resolve(process.env.SMS_WEB_ROOT) : path.join(repoRoot, 'frontend', '.output', 'public'),
    backendJar: existsSync(extracted) ? extracted : path.join(repoRoot, 'backend', 'target', 'sms-backend.jar'),
    javaExe: process.env.SMS_JAVA_EXE ?? (javaHome ? path.join(javaHome, 'bin', 'java.exe') : 'java.exe'),
  };
}
