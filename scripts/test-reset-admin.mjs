// End-to-end test of tools/ResetAdmin.java against the REAL backend (extracted layout) and a real SQLite file.
// Usage: node scripts/test-reset-admin.mjs     (needs: npm run backend:build, node scripts/extract-backend.mjs)
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { javaExe } from './lib/jdk.mjs';

const root = path.resolve(import.meta.dirname, '..');
const jar = path.join(root, 'backend', 'target', 'extracted', 'sms-backend.jar');
if (!existsSync(jar)) {
  console.error('The extracted backend is missing: run `npm run backend:build` and `node scripts/extract-backend.mjs` first.');
  process.exit(1);
}
const dataDir = mkdtempSync(path.join(tmpdir(), 'sms reset ទិន្នន័យ '));
const secret = crypto.randomBytes(32).toString('hex');
const OLD_PASSWORD = 'Original-Pass-1';
const NEW_PASSWORD = 'Rescued-Pass-2026';
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

/** Starts the backend like Electron does and resolves once it prints SMS_READY. */
async function startBackend() {
  const child = spawn(javaExe(), ['-Xmx384m', '-XX:+UseSerialGC', '-XX:TieredStopAtLevel=1', '-Dfile.encoding=UTF-8', '-jar', jar], {
    env: { ...process.env, SMS_DATA_DIR: dataDir, SMS_LAUNCH_SECRET: secret },
    stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
  });
  child.stdout.setEncoding('utf8');
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('backend did not become ready in 90 s')), 90_000);
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d;
      const m = /SMS_READY (\{.*\})/.exec(buf);
      if (m) { clearTimeout(timer); resolve(JSON.parse(m[1]).port); }
    });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`backend exited early (${code})`)); });
  });
  return { child, port };
}

const call = async (port, method, p, body, token) => {
  const r = await fetch(`http://127.0.0.1:${port}/api/v1${p}`, {
    method,
    headers: { 'X-SMS-Launch-Secret': secret, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  return { status: r.status, json: text ? JSON.parse(text) : {} };
};

async function stopBackend({ child, port }) {
  const exited = new Promise((r) => child.once('exit', r));
  await fetch(`http://127.0.0.1:${port}/internal/shutdown`, { method: 'POST', headers: { 'X-SMS-Launch-Secret': secret } });
  await Promise.race([exited, new Promise((_, rej) => setTimeout(() => rej(new Error('backend did not stop')), 20_000))]);
}

const tool = (args, input) => spawnSync('node', [path.join(root, 'scripts', 'reset-admin.mjs'), '--data-dir', dataDir, ...args], { input, encoding: 'utf8' });

try {
  console.log(`data: ${dataDir}\n`);

  // 1 ---- a real administrator with a confirmed recovery key, then a locked-out account
  let b = await startBackend();
  const setup = await call(b.port, 'POST', '/auth/setup', { displayName: 'អ្នកគ្រប់គ្រង', username: 'rescue.admin', password: OLD_PASSWORD });
  check('1a setup creates the administrator and issues a recovery key', setup.status === 201 && /^[0-9A-Z-]{29}$/.test(setup.json.recoveryKey ?? ''));
  const oldKey = setup.json.recoveryKey;
  await call(b.port, 'POST', '/auth/recovery-key/confirm', undefined, setup.json.token);
  const before = await call(b.port, 'POST', '/auth/login', { username: 'rescue.admin', password: OLD_PASSWORD });
  check('1b before the reset: the key is confirmed (nothing pending) and the old password works', before.status === 200 && before.json.recoveryKeyPending === false);
  let last;
  for (let i = 1; i <= 5; i++) last = await call(b.port, 'POST', '/auth/login', { username: 'rescue.admin', password: 'wrong-guess-' + i });
  check('1c five wrong passwords lock the account (429) — the state the tool must clear', last.status === 429 && last.json.code === 'ACCOUNT_LOCKED');
  await stopBackend(b);

  // 2 ---- the tool's refusals leave everything untouched
  const lockFile = path.join(dataDir, 'config', 'running.lock');
  mkdirSync(path.dirname(lockFile), { recursive: true });
  writeFileSync(lockFile, 'fake');
  const running = tool(['--password-stdin'], NEW_PASSWORD + '\n');
  check('2a refuses while config/running.lock exists (the app may be running)', running.status !== 0 && /running\.lock/.test(running.stderr), running.stderr.trim());
  rmSync(lockFile);
  const weak = tool(['--password-stdin'], '12345678\n');
  check('2b refuses a weak password with the policy codes', weak.status !== 0 && /PASSWORD_WEAK/.test(weak.stderr), weak.stderr.trim());
  const short = tool(['--password-stdin'], 'abc\n');
  check('2c refuses a too-short password', short.status !== 0 && /PASSWORD_TOO_SHORT/.test(short.stderr), short.stderr.trim());
  const untouched = new DatabaseSync(path.join(dataDir, 'database', 'school.db'), { readOnly: true });
  const auditBefore = untouched.prepare("SELECT count(*) AS n FROM audit_logs WHERE action = 'ADMIN_RESET_OFFLINE'").get().n;
  const hashBefore = untouched.prepare('SELECT password_hash AS h FROM app_users').get().h;
  untouched.close();
  check('2d the refusals wrote nothing (no reset audit entry, password hash unchanged)', auditBefore === 0 && hashBefore.startsWith('$2'));

  // 3 ---- the reset itself
  const reset = tool(['--password-stdin'], NEW_PASSWORD + '\n');
  check('3a the tool succeeds with a valid password', reset.status === 0, (reset.stdout + reset.stderr).trim());
  check('3b the tool ran, and never echoes the password or a recovery key', reset.status === 0 && /Password reset/.test(reset.stdout)
    && !(reset.stdout + reset.stderr).includes(NEW_PASSWORD) && !/[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}/.test(reset.stdout + reset.stderr));

  // 4 ---- what the application now sees
  b = await startBackend();
  const oldPw = await call(b.port, 'POST', '/auth/login', { username: 'rescue.admin', password: OLD_PASSWORD });
  check('4a the old password no longer works', oldPw.status === 401 && oldPw.json.code === 'INVALID_CREDENTIALS');
  const newPw = await call(b.port, 'POST', '/auth/login', { username: 'rescue.admin', password: NEW_PASSWORD });
  check('4b the new password works at once (the lock-out was cleared)', newPw.status === 200 && !!newPw.json.token);
  check('4c the app now forces a NEW recovery key (pending = true)', newPw.json.recoveryKeyPending === true);
  const oldKeyTry = await call(b.port, 'POST', '/auth/recover', { recoveryKey: oldKey, newPassword: 'Another-Pass-77' });
  check('4d the OLD recovery key is dead', oldKeyTry.status === 401 && oldKeyTry.json.code === 'INVALID_RECOVERY_KEY');
  const regenerated = await call(b.port, 'POST', '/auth/recovery-key/regenerate', { currentPassword: NEW_PASSWORD }, newPw.json.token);
  check('4e the forced flow can issue and confirm a new key', regenerated.status === 200 && /^[0-9A-Z-]{29}$/.test(regenerated.json.recoveryKey ?? '')
    && (await call(b.port, 'POST', '/auth/recovery-key/confirm', undefined, newPw.json.token)).status === 204);
  await stopBackend(b);

  // 5 ---- the database itself
  const db = new DatabaseSync(path.join(dataDir, 'database', 'school.db'), { readOnly: true });
  const audit = db.prepare("SELECT actor, summary FROM audit_logs WHERE action = 'ADMIN_RESET_OFFLINE'").all();
  const hash = db.prepare('SELECT password_hash AS h FROM app_users').get().h;
  db.close();
  check('5a exactly one audit entry by the tool, with no secret inside', audit.length === 1 && audit[0].actor === 'offline-reset-tool'
    && !audit[0].summary.includes(NEW_PASSWORD), JSON.stringify(audit));
  check('5b the stored password is a NEW BCrypt hash, not the password', hash.startsWith('$2') && hash.length === 60 && hash !== hashBefore && !hash.includes(NEW_PASSWORD));
} catch (e) {
  failures++;
  console.log('FAIL  unexpected error  — ' + (e.stack ?? e));
} finally {
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* temp folder; the OS cleans it up */ }
}
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
