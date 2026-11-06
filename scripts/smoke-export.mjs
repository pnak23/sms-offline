// Proves the Excel student-list export works on a given Java runtime: the bundled jlink JRE is trimmed to the modules jdeps found,
// so something Apache POI loads late could be missing there while everything works on the full JDK.
// Usage: node scripts/smoke-export.mjs [path/to/java.exe]      (default: the JDK; needs the extracted backend, see test-reset-admin.mjs)
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { javaExe } from './lib/jdk.mjs';

const root = path.resolve(import.meta.dirname, '..');
const jar = path.join(root, 'backend', 'target', 'extracted', 'sms-backend.jar');
if (!existsSync(jar)) {
  console.error('The extracted backend is missing: run `npm run backend:build` and `node scripts/extract-backend.mjs` first.');
  process.exit(1);
}
const java = process.argv[2] ?? javaExe();
const dataDir = mkdtempSync(path.join(tmpdir(), 'sms export ទិន្នន័យ '));
const secret = crypto.randomBytes(32).toString('hex');
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

/** The text of one entry of a zip, read through the central directory (Java writes sizes AFTER the data, so local headers have none). */
function zipEntry(buf, name) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) return null;
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0, n = buf.readUInt16LE(eocd + 10); i < n; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    if (buf.toString('utf8', p + 46, p + 46 + nameLen) === name) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return (method === 8 ? inflateRawSync(data) : data).toString('utf8');
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

async function start() {
  const child = spawn(java, ['-Xmx384m', '-XX:+UseSerialGC', '-XX:TieredStopAtLevel=1', '-Dfile.encoding=UTF-8', '-jar', jar], {
    env: { ...process.env, SMS_DATA_DIR: dataDir, SMS_LAUNCH_SECRET: secret }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  child.stdout.setEncoding('utf8');
  const err = [];
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (d) => err.push(d));
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('backend did not become ready in 90 s')), 90_000);
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d;
      const m = /SMS_READY (\{.*\})/.exec(buf);
      if (m) { clearTimeout(timer); resolve(JSON.parse(m[1]).port); }
    });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`backend exited early (${code}): ${err.join('').slice(-300)}`)); });
  });
  return { child, port };
}

try {
  console.log(`java: ${java}\ndata: ${dataDir}\n`);
  const { child, port } = await start();
  const call = (method, p, body, token) => fetch(`http://127.0.0.1:${port}/api/v1${p}`, {
    method, headers: { 'X-SMS-Launch-Secret': secret, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

  const setup = await (await call('POST', '/auth/setup', { displayName: 'ក', username: 'export.admin', password: 'Export-Smoke-Pass-1' })).json();
  const token = setup.token;
  const made = await call('POST', '/students', { nameKm: 'សុខ វណ្ណា', gender: 'FEMALE', dateOfBirth: '2019-05-01', guardians: [] }, token);
  check('1 a student is created', made.status === 201);
  const res = await call('POST', '/students/export', { labels: { sheet: 'បញ្ជីសិស្ស', nameKm: 'ឈ្មោះខ្មែរ', FEMALE: 'ស្រី' } }, token);
  const bytes = Buffer.from(await res.arrayBuffer());
  check('2 the export answers 200 with an .xlsx (a zip)', res.status === 200 && bytes.subarray(0, 2).toString() === 'PK', `${res.status}, ${bytes.length} bytes`);
  const strings = zipEntry(bytes, 'xl/sharedStrings.xml') ?? '';
  const workbook = zipEntry(bytes, 'xl/workbook.xml') ?? '';
  check('3 the Khmer name, the label and the value name are inside the file', strings.includes('សុខ វណ្ណា') && strings.includes('ឈ្មោះខ្មែរ') && strings.includes('ស្រី'));
  check('4 the sheet carries the Khmer title', workbook.includes('បញ្ជីសិស្ស'));

  const exited = new Promise((r) => child.once('exit', r));
  await fetch(`http://127.0.0.1:${port}/internal/shutdown`, { method: 'POST', headers: { 'X-SMS-Launch-Secret': secret } });
  await Promise.race([exited, new Promise((_, rej) => setTimeout(() => rej(new Error('backend did not stop')), 20_000))]);
} catch (e) {
  failures++;
  console.log('FAIL  unexpected error  — ' + (e.stack ?? e));
} finally {
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* temp folder */ }
}
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
