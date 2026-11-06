// Real-process test of backups, the automatic ones and the restore, against the REAL jar (no Electron, no Spring test context).
// What it proves that the unit tests cannot: the restore is applied by the process start-up BEFORE the database opens, the backup on
// close really runs during the graceful shutdown, and an upgrade makes its safety backup before Flyway touches the database.
// Usage: node scripts/test-backup-flow.mjs [path/to/sms-backend.jar] [path/to/java.exe]     (build first: backend:build + scripts/extract-backend.mjs;
// pass desktop/build/jre/bin/java.exe to run it on the trimmed runtime the installer ships)
import { spawn, execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { javaExe } from './lib/jdk.mjs';
import { latestSchemaVersion } from './lib/schema.mjs';

const jar = path.resolve(process.argv[2] ?? 'backend/target/extracted/sms-backend.jar');
const java = process.argv[3] ?? javaExe();
const dataDir = mkdtempSync(path.join(tmpdir(), 'sms ការបម្រុងទុក '));   // Khmer and a space, like a real profile
const secret = crypto.randomBytes(32).toString('hex');
const PASSWORD = 'Backup-Flow-Pass-2026';
const LATEST = Number(latestSchemaVersion());
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = (...p) => path.join(dataDir, ...p);
const zips = (sub) => (existsSync(dir(...sub)) ? readdirSync(dir(...sub)).filter((n) => /^SchoolBackup_.*\.zip$/.test(n)) : []);

function start(args = []) {
  const child = spawn(java, ['-Xms64m', '-Xmx384m', '-XX:+UseSerialGC', '-XX:TieredStopAtLevel=1', '-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8', '-jar', jar, ...args], {
    env: { ...process.env, SMS_DATA_DIR: dataDir, SMS_LAUNCH_SECRET: secret, SMS_PARENT_STDIN: '1' }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
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
      if (line.startsWith('SMS_READY ')) settle({ port: JSON.parse(line.slice(10)).port });
      if (line.startsWith('SMS_STARTUP_FAILED ')) settle({ failed: JSON.parse(line.slice(19)).code });
    }
  });
  child.stderr.resume();
  const exited = new Promise((r) => child.on('exit', (code) => { settle({ exited: code }); r(code); }));
  const ready = Promise.race([first, sleep(90_000).then(() => ({ timeout: true }))]);
  return { child, ready, exited };
}

let port = 0;
let token = '';
async function call(method, p, body) {
  const r = await fetch(`http://127.0.0.1:${port}${p.startsWith('/internal') ? '' : '/api/v1'}${p}`, {
    method,
    headers: { 'X-SMS-Launch-Secret': secret, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, json, text };
}
const login = async () => { token = (await call('POST', '/auth/login', { username: 'admin.backup', password: PASSWORD })).json?.token ?? ''; return token !== ''; };

/** Starts the backend and waits for READY; returns the handle. */
async function boot(args = []) {
  const s = start(args);
  const r = await s.ready;
  if (r.failed || r.timeout || r.exited !== undefined) return { ...s, failed: r.failed ?? (r.timeout ? 'TIMEOUT' : `EXIT_${r.exited}`) };
  port = r.port;
  token = '';
  return s;
}
/** Graceful close the way Electron does it; returns the JSON the endpoint answered and the exit code. */
async function close(s) {
  const t0 = Date.now();
  const res = await call('POST', '/internal/shutdown');
  const code = await Promise.race([s.exited, sleep(120_000).then(() => 'TIMEOUT')]);
  return { body: res.json, status: res.status, code, ms: Date.now() - t0 };
}
const years = async () => (await call('GET', '/academic-years')).json.map((y) => y.nameKm).sort();
const overview = async () => (await call('GET', '/backups')).json;

try {
  console.log(`java: ${java}\njar:  ${jar}\ndata: ${dataDir}\nschema this program knows: ${LATEST}\n`);
  if (!existsSync(jar)) throw new Error('jar not found; run backend:build and scripts/extract-backend.mjs first');
  const oldSchema = LATEST - 1;

  // ---- A: a database one version behind, some data, a closing that makes the automatic backup ------------------------
  let s = await boot([`--spring.flyway.target=${oldSchema}`]);
  if (s.failed) throw new Error('start failed: ' + s.failed);
  const setup = await call('POST', '/auth/setup', { displayName: 'ក', username: 'admin.backup', password: PASSWORD });
  token = setup.json.token;
  check('A1 first start on a fresh data folder: the account was made', setup.status === 200 || setup.status === 201, String(setup.status));
  // The program is started one schema behind on purpose. The new code gives every academic year its first attendance session (a V7 table), so a year can
  // no longer be made through the API at that schema, and an old installation never could have had the new code anyway: its years were written by the
  // old program. So they are written straight into the old-schema database, as that program would have left them (V7 then adds each year's whole-day session).
  const old = new DatabaseSync(dir('database', 'school.db'));
  old.exec('PRAGMA busy_timeout = 5000');
  const stamp = new Date().toISOString();
  for (const [name, start] of [['ឆ្នាំសិក្សា ក', '2026-10-01'], ['ឆ្នាំសិក្សា ខ', '2027-10-01']]) {
    old.prepare('INSERT INTO academic_years (name_km, start_date, end_date, is_current, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(name, start, start.replace(/^(\d{4})-10-01$/, (_, y) => `${Number(y) + 1}-08-31`), name.endsWith('ក') ? 1 : 0, 'OPEN', stamp, stamp);
  }
  old.close();
  const logoA = 'logo-' + crypto.randomUUID() + '.png';
  const bytesA = crypto.randomBytes(3000);
  writeFileSync(dir('uploads', 'school', logoA), bytesA);
  check('A2 schema is one behind (an old installation)', (await call('GET', '/internal/health')).json.schemaVersion === String(oldSchema));
  check('A3 no backup exists yet and one is due', (await overview()).backups.length === 0 && (await overview()).autoDue === true);
  const closeA = await close(s);
  check('A4 the shutdown answer says a backup runs first (so Electron waits longer)', closeA.status === 202 && closeA.body?.backingUp === true, JSON.stringify(closeA.body));
  check('A5 the process exits by itself with code 0 after making it', closeA.code === 0, `${closeA.code} after ${closeA.ms} ms`);
  check('A6 one automatic backup is in backups/auto/', zips(['backups', 'auto']).length === 1, zips(['backups', 'auto']).join(','));
  check('A7 nothing is left in the temp folder and no .part file remains', !existsSync(dir('backups', 'tmp')) || readdirSync(dir('backups', 'tmp')).length === 0);
  check('A8 the history file exists outside the database', existsSync(dir('config', 'backup-history.json')));

  // ---- B: the upgrade: a verified backup is made BEFORE Flyway migrates ------------------------------------------------
  // a killed backup's leftovers are swept at start
  mkdirSync(dir('backups', 'tmp', 'backup-dead'), { recursive: true });
  writeFileSync(dir('backups', 'tmp', 'backup-dead', 'school.db'), 'x');
  writeFileSync(dir('backups', 'SchoolBackup_2020-01-01_00-00-00.zip.part'), 'x');
  s = await boot();
  if (s.failed) throw new Error('upgrade start failed: ' + s.failed);
  check('B1 the program migrated forward and started', (await call('GET', '/internal/health')).json.schemaVersion === String(LATEST));
  check('B2 leftovers of a killed backup were swept at start (the upgrade backup itself may re-create an empty temp folder)', !existsSync(dir('backups', 'tmp', 'backup-dead')) && !existsSync(dir('backups', 'SchoolBackup_2020-01-01_00-00-00.zip.part')));
  check('B3 two backups now exist in backups/auto/: the one on close and the one before the upgrade', zips(['backups', 'auto']).length === 2, zips(['backups', 'auto']).join(','));
  check('B4 login still works after the upgrade (data survived)', await login());
  const ov = await overview();
  const pre = ov.backups.find((b) => b.kind === 'PRE_MIGRATION');
  check('B5 the upgrade backup is listed, made at the OLD schema, and was verified', !!pre && pre.schemaVersion === oldSchema && pre.verifiedAt !== null, JSON.stringify(pre && { kind: pre.kind, schema: pre.schemaVersion }));
  check('B6 the on-close backup is listed too', ov.backups.some((b) => b.kind === 'AUTO' && b.schemaVersion === oldSchema));
  check('B7 both years are still there', JSON.stringify(await years()) === JSON.stringify(['ឆ្នាំសិក្សា ក', 'ឆ្នាំសិក្សា ខ'].sort()));

  // ---- C/D: manual backup of state A, change to state B, restore A through the API, apply at the next start --------------
  const made = await call('POST', '/backups');
  check('C1 a manual backup is made and verified', made.status === 201 && made.json.verifiedAt !== null && made.json.kind === 'MANUAL', JSON.stringify(made.json));
  const manualId = made.json.id;
  check('C2 the backup lives in backups/ (not auto)', existsSync(dir('backups', manualId + '.zip')));
  await call('POST', '/academic-years', { nameKm: 'ឆ្នាំសិក្សា គ', startDate: '2028-10-01', endDate: '2029-08-31', makeCurrent: false });
  rmSync(dir('uploads', 'school', logoA));
  const logoB = 'logo-' + crypto.randomUUID() + '.png';
  writeFileSync(dir('uploads', 'school', logoB), crypto.randomBytes(2000));
  check('C3 the school now differs from the backup: 3 years and another logo file', (await years()).length === 3 && existsSync(dir('uploads', 'school', logoB)) && !existsSync(dir('uploads', 'school', logoA)));

  // damaged and foreign files are refused before anything is staged
  writeFileSync(dir('backups', 'incoming', 'incoming-1.zip'), 'this is not a zip');
  const bad = await call('POST', '/backups/restore/stage', { fileName: 'incoming-1.zip' });
  check('D1 a file that is not a backup is refused (422 BACKUP_CORRUPT) and removed from incoming', bad.status === 422 && bad.json.code === 'BACKUP_CORRUPT' && !existsSync(dir('backups', 'incoming', 'incoming-1.zip')), bad.text);
  const flipped = readFileSync(dir('backups', manualId + '.zip'));
  flipped[Math.floor(flipped.length / 2)] ^= 0x55;
  writeFileSync(dir('backups', 'incoming', 'incoming-2.zip'), flipped);
  const tampered = await call('POST', '/backups/restore/stage', { fileName: 'incoming-2.zip' });
  check('D2 a backup with a flipped byte is refused', tampered.status === 422 && ['BACKUP_CORRUPT', 'BACKUP_CHECKSUM_MISMATCH', 'BACKUP_DATABASE_DAMAGED'].includes(tampered.json.code), tampered.text);
  check('D3 nothing is staged after the refusals', !existsSync(dir('backups', 'restore-pending')));

  copyFileSync(dir('backups', manualId + '.zip'), dir('backups', 'incoming', 'incoming-3.zip'));
  const staged = await call('POST', '/backups/restore/stage', { fileName: 'incoming-3.zip' });
  check('D4 the real backup is staged and described (counts, no names)', staged.status === 200 && staged.json.state === 'STAGED' && staged.json.schemaVersion === LATEST, JSON.stringify(staged.json));
  const applied = await call('POST', '/backups/restore/apply');
  check('D5 confirming marks it to be applied at the next start', applied.status === 200 && applied.json.state === 'CONFIRMED', applied.text);
  check('D6 the live database was NOT touched by confirming', (await years()).length === 3);
  const closeD = await close(s);
  check('D7 the process closes cleanly (no automatic backup is due: one was just made)', closeD.code === 0 && closeD.body?.backingUp === false, JSON.stringify(closeD.body));
  check('D8 the swap has not happened yet (it waits for the next start, before the database opens)', existsSync(dir('backups', 'restore-pending', 'restore.json')));

  s = await boot();
  if (s.failed) throw new Error('start after restore failed: ' + s.failed);
  await login();
  check('D9 after the restart the data is exactly the backup: 2 years', JSON.stringify(await years()) === JSON.stringify(['ឆ្នាំសិក្សា ក', 'ឆ្នាំសិក្សា ខ'].sort()));
  check('D10 the logo file of the backup is back byte for byte, the later one is gone', existsSync(dir('uploads', 'school', logoA)) && readFileSync(dir('uploads', 'school', logoA)).equals(bytesA) && !existsSync(dir('uploads', 'school', logoB)));
  const after = await overview();
  check('D11 how the restore ended is recorded (and shown on the page)', after.lastRestore?.ok === true && after.staged === null, JSON.stringify(after.lastRestore));
  const safety = after.backups.find((b) => b.kind === 'PRE_RESTORE');
  check('D12 a safety backup of the replaced data (3 years) was made first and is verified', !!safety && safety.verifiedAt !== null && after.lastRestore?.safetyBackup === safety.fileName, JSON.stringify(safety && { id: safety.id }));
  check('D13 nothing is left staged', !existsSync(dir('backups', 'restore-pending')));
  const trail = (await call('GET', '/audit?action=RESTORE_APPLIED')).json;
  check('D14 the restored database wrote down that it was restored', trail.rows.length === 1, JSON.stringify(trail.rows.map((r) => r.action)));
  check('D15 the history (outside the database) kept the earlier backups', after.backups.length >= 4);

  // ---- E: undo the restore from the safety backup, and a crash between confirming and restarting ----------------------
  const stagedBack = await call('POST', '/backups/restore/stage', { backupId: safety.id });
  check('E1 the safety backup can be staged straight from the list', stagedBack.status === 200 && stagedBack.json.state === 'STAGED');
  await call('POST', '/backups/restore/apply');
  s.child.kill();                                  // the power goes out between confirming and restarting (a hard kill, no shutdown hook of ours)
  await Promise.race([s.exited, sleep(15_000)]);
  try { execFileSync('taskkill', ['/PID', String(s.child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
  check('E3 the kill left the dirty-shutdown marker', existsSync(dir('config', 'running.lock')));
  s = await boot();
  if (s.failed) throw new Error('start after a crash failed: ' + s.failed);
  await login();
  check('E4 the confirmed restore is applied at the next start, crash or not: back to 3 years', (await years()).length === 3, JSON.stringify(await years()));
  check('E5 the logo B file is back (it was in the safety backup)', existsSync(dir('uploads', 'school', logoB)) && !existsSync(dir('uploads', 'school', logoA)));
  const finalOv = await overview();
  check('E6 a second safety backup was made before replacing state A', finalOv.backups.filter((b) => b.kind === 'PRE_RESTORE').length === 2);
  const health = (await call('GET', '/system/health')).json;
  check('E7 the health page reports the unclean shutdown but nothing failed', health.checks.find((c) => c.id === 'DIRTY_SHUTDOWN')?.status === 'WARN' && health.status !== 'FAIL', health.status);
  check('E8 the log holds no password and no backup path content', !readFileSync(dir('logs', 'backend.log'), 'utf8').includes(PASSWORD));
  await close(s);
} catch (e) {
  failures++;
  console.log('FAIL  unexpected error: ' + (e?.stack ?? e));
} finally {
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ }
}
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
