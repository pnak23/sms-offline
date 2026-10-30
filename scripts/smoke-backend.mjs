// Process-lifecycle smoke test for the packaged backend (spike S3, backend half).
// Usage: node scripts/smoke-backend.mjs [path/to/sms-backend.jar] [path/to/java.exe]
// It starts the jar exactly the way Electron will: secret and data dir in the ENVIRONMENT, stdin as a pipe.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const jar = path.resolve(process.argv[2] ?? 'backend/target/sms-backend.jar');
const java = process.argv[3] ?? path.join(process.env.JAVA_HOME ?? 'C:/Users/pnak/.jdks/corretto-21.0.6', 'bin', 'java.exe');
// A folder with a space AND Khmer characters, like a Windows user profile might have.
const dataDir = mkdtempSync(path.join(tmpdir(), 'sms smoke ទិន្នន័យ '));
const secret = crypto.randomBytes(32).toString('hex');
let failures = 0;

const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

function start(env = {}, { stdinPipe = true } = {}) {
  const t0 = Date.now();
  const child = spawn(java, ['-Xms64m', '-Xmx384m', '-XX:+UseSerialGC', '-XX:+ExitOnOutOfMemoryError',
    '-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8', '-jar', jar], {
    env: { ...process.env, SMS_DATA_DIR: dataDir, SMS_LAUNCH_SECRET: secret, SMS_PARENT_STDIN: '1', ...env },
    stdio: [stdinPipe ? 'pipe' : 'ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  const out = [];
  let buf = '';
  let settle;
  const first = new Promise((r) => (settle = r));
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      out.push(line);
      if (line.startsWith('SMS_READY ')) settle({ ready: JSON.parse(line.slice(10)), wallMs: Date.now() - t0 });
      if (line.startsWith('SMS_STARTUP_FAILED ')) settle({ failed: JSON.parse(line.slice(19)) });
    }
  });
  child.stderr.resume();
  const exited = new Promise((r) => child.on('exit', (code, sig) => { settle({ exited: code ?? sig }); r(code ?? sig); }));
  const result = Promise.race([first, new Promise((r) => setTimeout(() => r({ timeout: true }), 90_000))]);
  return { child, result, exited, out };
}

const api = (port, p, opts = {}, withSecret = true) =>
  fetch(`http://127.0.0.1:${port}${p}`, { ...opts, headers: { ...(withSecret ? { 'X-SMS-Launch-Secret': secret } : {}), ...(opts.headers ?? {}) } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lock = () => existsSync(path.join(dataDir, 'config', 'running.lock'));

try {
  console.log(`jar:  ${jar}\njava: ${java}\ndata: ${dataDir}\n`);

  // 1 ---- normal start, READY line, health, secret, graceful shutdown
  let s = start();
  let r = await s.result;
  check('1a READY line printed with the real port', !!r.ready && r.ready.port > 0, JSON.stringify(r.ready ?? r));
  const port = r.ready?.port;
  if (!port) throw new Error('backend did not start; stdout: ' + s.out.join(' | '));
  console.log(`      cold start: ${r.ready.startupMs} ms inside the JVM, ${r.wallMs} ms wall-clock (spawn -> READY)`);
  const h = await (await api(port, '/internal/health')).json();
  check('1b /internal/health is UP with schema version and phase timings', h.status === 'UP' && h.schemaVersion === '2' && 'flywayMs' in h.startup, JSON.stringify(h.startup));
  check('1c a request without the launch secret is refused (403)', (await api(port, '/internal/health', {}, false)).status === 403);
  check('1d running.lock exists while running', lock());
  const sd = await api(port, '/internal/shutdown', { method: 'POST' });
  check('1e POST /internal/shutdown answers 202', sd.status === 202);
  const code1 = await Promise.race([s.exited, sleep(15_000).then(() => 'TIMEOUT')]);
  check('1f process exits by itself with code 0 after graceful shutdown', code1 === 0, String(code1));
  check('1g running.lock is removed on a clean shutdown', !lock());
  check('1h database file lives in the Khmer/space-named data directory', existsSync(path.join(dataDir, 'database', 'school.db')));

  // 2 ---- Electron "dies": stdin EOF must stop the backend (no orphan JVM)
  s = start();
  r = await s.result;
  check('2a restart works on the existing database', !!r.ready, `${r.ready?.startupMs ?? '?'} ms`);
  s.child.stdin.end();
  const code2 = await Promise.race([s.exited, sleep(15_000).then(() => 'TIMEOUT')]);
  check('2b closing stdin (parent died) makes the backend exit on its own', code2 === 0, String(code2));
  check('2c ...and it removed running.lock (clean exit path)', !lock());

  // 3 ---- hard kill leaves the lock; the next start must flag a dirty shutdown
  s = start();
  r = await s.result;
  s.child.kill('SIGKILL');
  await s.exited;
  check('3a after a force-kill running.lock is left behind', lock());
  s = start();
  r = await s.result;
  check('3b next start still works (WAL recovery)', !!r.ready);
  const hp = r.ready.port;
  const health = await (await api(hp, '/api/v1/system/health')).json();
  const dirty = health.checks.find((c) => c.id === 'DIRTY_SHUTDOWN');
  check('3c health reports PREVIOUS_SHUTDOWN_NOT_CLEAN', dirty?.code === 'PREVIOUS_SHUTDOWN_NOT_CLEAN', JSON.stringify(dirty));
  check('3d all other blocking checks are OK', ['DATA_DIR_WRITABLE', 'DISK_SPACE', 'DATABASE', 'SCHEMA_VERSION'].every((id) => health.checks.find((c) => c.id === id)?.status === 'OK'));
  const ns = (await new Promise((res) => { const c = spawn('netstat', ['-ano', '-p', 'tcp']); let o = ''; c.stdout.on('data', (d) => (o += d)); c.on('close', () => res(o)); }));
  const listen = ns.split('\n').find((l) => l.includes('LISTENING') && l.includes(`:${hp} `)) ?? '';
  check('3e listening on 127.0.0.1 only (netstat)', listen.includes(`127.0.0.1:${hp}`) && !listen.includes(`0.0.0.0:${hp}`), listen.trim());
  await api(hp, '/internal/shutdown', { method: 'POST' });
  await s.exited;

  // 4 ---- failure codes reach Electron through a single stdout line
  s = start({ SMS_DATA_DIR: '' });
  r = await s.result;
  check('4a missing data directory -> SMS_STARTUP_FAILED DATA_DIR_UNAVAILABLE', r.failed?.code === 'DATA_DIR_UNAVAILABLE', JSON.stringify(r));
  const code4 = await Promise.race([s.exited, sleep(10_000).then(() => 'TIMEOUT')]);
  check('4b ...and the process exits with code 1', code4 === 1, String(code4));
  s = start({ SMS_LAUNCH_SECRET: '' });
  r = await s.result;
  check('4c missing launch secret -> refuses to start (LAUNCH_SECRET_MISSING)', r.failed?.code === 'LAUNCH_SECRET_MISSING', JSON.stringify(r));
  await s.exited;
} catch (e) {
  failures++;
  console.log('FAIL  harness error: ' + e.message);
} finally {
  rmSync(dataDir, { recursive: true, force: true });
}
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
