// Starts the backend for UI development with a KNOWN launch secret and a throw-away data directory.
// Usage: node scripts/dev-backend.mjs [--data .dev-data] [--secret dev-secret-0123456789abcdef] [--fresh]
// Prints the URL to open the Nuxt dev server against this backend in a plain browser (dev shim, see frontend docs).
// Stop with Ctrl+C (asks the backend to shut down gracefully first).
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; };
const root = path.resolve(import.meta.dirname, '..');
const dataDir = path.resolve(root, opt('data', '.dev-data'));
const secret = opt('secret', 'dev-secret-0123456789abcdef');
if (args.includes('--fresh')) rmSync(dataDir, { recursive: true, force: true });

const javaHome = [process.env.JAVA_HOME, path.join(homedir(), '.jdks', 'corretto-21.0.6')].filter(Boolean)
  .find((c) => existsSync(path.join(c, 'bin', 'java.exe')));
if (!javaHome) { console.error('No JDK 21 found (set JAVA_HOME).'); process.exit(1); }
const extracted = path.join(root, 'backend', 'target', 'extracted', 'sms-backend.jar');
const fat = path.join(root, 'backend', 'target', 'sms-backend.jar');
const jar = existsSync(extracted) ? extracted : fat;
if (!existsSync(jar)) { console.error('Build the backend first: npm run backend:build'); process.exit(1); }

const child = spawn(path.join(javaHome, 'bin', 'java.exe'),
  ['-Xmx384m', '-XX:+UseSerialGC', '-XX:TieredStopAtLevel=1', '-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-jar', jar],
  { env: { ...process.env, SMS_DATA_DIR: dataDir, SMS_LAUNCH_SECRET: secret }, stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true });
let port = 0;
child.stdout.setEncoding('utf8');
child.stdout.on('data', (d) => {
  process.stdout.write(d);
  const m = /SMS_READY \{"port":(\d+)/.exec(d);
  if (m) {
    port = Number(m[1]);
    console.log(`\nBackend ready.\n  API:        http://127.0.0.1:${port}\n  Secret:     ${secret}\n  Data dir:   ${dataDir}\n` +
      `  Dev UI URL: http://localhost:3000/?devBackend=http://127.0.0.1:${port}&devSecret=${secret}\n`);
  }
});
child.on('exit', (c) => process.exit(c ?? 0));
const stop = async () => {
  if (port) { try { await fetch(`http://127.0.0.1:${port}/internal/shutdown`, { method: 'POST', headers: { 'X-SMS-Launch-Secret': secret } }); } catch { /* ignore */ } }
  setTimeout(() => child.kill(), 10_000).unref();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
