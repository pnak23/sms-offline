// Phase 5 performance presets: what the memory settings really cost and save (docs/PERF-LOG.md, Phase 5 section).
// Usage: node scripts/measure-presets.mjs [students=1000] [--skip-app | --skip-backend]
// Needs the extracted backend (npm run backend:build + node scripts/extract-backend.mjs), the generated UI (npm run generate -w frontend)
// and the desktop bundle (npm run build -w desktop) unless --skip-app is given.
//
// Part 1 (backend only): seeds a school of N students over HTTP ONCE, then starts the backend again for each candidate setting, with the JVM options
// the desktop program would really build (src/main/config.ts, bundled here), and runs the same workload: the 1,000-row student list, a search, saving
// attendance for 50, the dashboard, results and the 40 report cards, a 1,000-row Excel, and then a burst of 8 parallel clients. For each it records
// the latency, the working set of the java process (idle, and the peak during the work), the heap, and whether it survived.
// Part 2 (whole app): starts the unpackaged Electron app (no debugger attached) with each preset and the graphics switch, lets it idle, and sums the
// working set of every process of the app. These are the numbers the Performance page's descriptions quote.
import { build } from 'esbuild';
import { execFile, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { javaExe } from './lib/jdk.mjs';

const root = path.resolve(import.meta.dirname, '..');
const jar = path.join(root, 'backend', 'target', 'extracted', 'sms-backend.jar');
const desktop = path.join(root, 'desktop');
const electronDist = path.join(root, 'node_modules', 'electron', 'dist');
const STUDENTS = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 1000);
const SKIP_APP = process.argv.includes('--skip-app');
const SKIP_BACKEND = process.argv.includes('--skip-backend');   // part 2 only
const GB = 1024 ** 3;
const run = promisify(execFile);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const p95 = (xs) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(xs.length * 0.95) - 1)];
const round = (x) => Math.round(x);
const secret = crypto.randomBytes(32).toString('hex');
const PASSWORD = 'Measure-Presets-Pass-1';

for (const [what, p] of [['the extracted backend', jar], ...(SKIP_APP ? [] : [['the generated UI', path.join(root, 'frontend', '.output', 'public', 'index.html')], ['the desktop bundle', path.join(desktop, 'dist')]])]) {
  if (!existsSync(p)) { console.error(`${what} is missing (${p}): build it first (see the header of this script).`); process.exit(1); }
}

// the JVM options exactly as the desktop program builds them
const work = mkdtempSync(path.join(os.tmpdir(), 'sms presets '));
await build({ entryPoints: [path.join(desktop, 'src/main/config.ts')], outfile: path.join(work, 'config.cjs'), bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
const C = (await import(pathToFileURL(path.join(work, 'config.cjs')).href)).default;
const configFor = (preset, extra = {}) => {
  const d = mkdtempSync(path.join(work, 'cfg-'));
  writeFileSync(path.join(d, 'app.json'), JSON.stringify({ performance: { preset }, ...extra }));
  return C.loadConfig(d);
};
const VARIANTS = [
  { name: 'Standard on an 8 GB PC', args: C.jvmArgs(configFor('standard'), 8 * GB) },
  { name: 'Standard on a 16 GB PC', args: C.jvmArgs(configFor('standard'), 16 * GB) },
  { name: `Low-memory (${C.LOW_MEMORY_HEAP_MB} MB heap)`, args: C.jvmArgs(configFor('low-memory'), 8 * GB) },
  { name: 'Heap 192 MB only (no other flags)', args: C.jvmArgs(configFor('standard', { backend: { jvm: { maxHeapMb: 192 } } }), 8 * GB) },
];
const heapOf = (args) => Number(/-Xmx(\d+)m/.exec(args.join(' '))[1]);

const data = mkdtempSync(path.join(os.tmpdir(), 'sms presets ទិន្នន័យ '));
const results = { machine: `${os.cpus()[0]?.model.trim()} · ${os.cpus().length} threads · ${Math.round(os.totalmem() / GB)} GB RAM · ${os.release()}`, students: STUDENTS, variants: [], app: [] };

function spawnBackend(args) {
  const child = spawn(javaExe(), [...args, '-jar', jar], { env: { ...process.env, SMS_DATA_DIR: data, SMS_LAUNCH_SECRET: secret }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stdout.setEncoding('utf8');
  child.stderr.resume();
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('backend did not become ready in 90 s')), 90_000);
    let buf = '';
    child.stdout.on('data', (d) => { buf += d; const m = /SMS_READY (\{.*\})/.exec(buf); if (m) { clearTimeout(timer); resolve(JSON.parse(m[1]).port); } });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`backend exited (${code})`)); });
  });
  return { child, ready };
}
async function javaWorkingSetMb(pid) {
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).WorkingSet64`]);
  return Math.round(Number(stdout.trim()) / 1048576);
}
async function stopBackend(port, child) {
  await fetch(`http://127.0.0.1:${port}/internal/shutdown`, { method: 'POST', headers: { 'X-SMS-Launch-Secret': secret } }).catch(() => undefined);
  await Promise.race([new Promise((r) => child.once('exit', r)), sleep(30_000)]);
}

let port = 0;
let token = '';
const call = async (method, p, body) => {
  const r = await fetch(`http://127.0.0.1:${port}/api/v1${p}`, {
    method, headers: { 'X-SMS-Launch-Secret': secret, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const bytes = Buffer.from(await r.arrayBuffer());
  if (r.status >= 300) throw new Error(`${method} ${p} -> ${r.status} ${bytes.toString('utf8').slice(0, 160)}`);
  return { bytes, json: () => JSON.parse(bytes.toString('utf8')) };
};

let ids;
try {
  if (!SKIP_BACKEND) {
  // ---- seed once (the same school as scripts/measure-reports.mjs) ---------------------------------------------------------------------
  const seeder = spawnBackend(VARIANTS[1].args);
  port = await seeder.ready;
  console.log(`seeding ${STUDENTS} students into ${data}`);
  token = (await call('POST', '/auth/setup', { displayName: 'អ្នកគ្រប់គ្រង', username: 'measure.admin', password: PASSWORD })).json().token;
  await call('POST', '/auth/recovery-key/confirm');
  const school = (await call('GET', '/settings/school')).json();
  await call('PUT', '/settings/school', { nameKm: 'សាលាបឋមសិក្សាសាកល្បង', address: 'ភូមិសាកល្បង', directorName: 'លោក នាយក', version: school.version });
  await call('POST', '/setup/complete');
  const today = new Date();
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const day = (n) => iso(new Date(today.getTime() + n * 86_400_000));
  const year = (await call('POST', '/academic-years', { nameKm: 'ឆ្នាំសិក្សាសាកល្បង', startDate: day(-30), endDate: day(200), makeCurrent: true })).json();
  const grades = (await call('GET', '/grades')).json();
  const gradeId = (level) => grades.find((g) => g.level === level).id;
  const makeClass = async (level, name) => (await call('POST', '/classes', { academicYearId: year.id, gradeId: gradeId(level), nameKm: name, capacity: 60, homeroomTeacherId: null, shift: null })).json().schoolClass.id;
  let n = 0;
  const enrol = async (classId, count) => {
    for (let i = 0; i < count; i++, n++) await call('POST', '/students', { nameKm: `សិស្ស ${n + 1}`, gender: n % 2 ? 'FEMALE' : 'MALE', dateOfBirth: day(-2500 - (n % 300)), enrollmentDate: null, classId, allowDuplicate: false, guardians: [] });
  };
  const cardClass = await makeClass(1, 'ក');
  await enrol(cardClass, 40);
  const attendanceClass = await makeClass(1, 'ខ');
  await enrol(attendanceClass, 50);
  const names = ['ក', 'ខ', 'គ', 'ឃ', 'ង'];
  let level = 2;
  let slot = 0;
  while (n < STUDENTS) {
    await enrol(await makeClass(level, names[slot]), Math.min(40, STUDENTS - n));
    if (++slot === names.length) { slot = 0; level++; }
  }
  const exam = (await call('POST', '/examinations', { academicYearId: year.id, nameKm: 'ប្រឡងសាកល្បង', kind: 'MONTHLY', termNo: 1 })).json();
  const subjects = (await call('GET', `/examinations/${exam.id}/subjects`)).json().filter((s) => s.gradeId === gradeId(1));
  for (const [i, s] of subjects.entries()) {
    const sheet = (await call('GET', `/examinations/${exam.id}/scores?classId=${cardClass}&subjectId=${s.subjectId}`)).json();
    await call('PUT', `/examinations/${exam.id}/scores`, { classId: cardClass, subjectId: s.subjectId, scores: sheet.rows.map((r, k) => ({ enrollmentId: r.enrollmentId, score: 40 + ((k * 7 + i * 13) % 60), absent: false })) });
  }
  ids = { cardClass, attendanceClass, examId: exam.id, day: day(0) };
  console.log(`${n} students seeded\n`);
  await stopBackend(port, seeder.child);

  // ---- part 1: the same workload under each setting -----------------------------------------------------------------------------------
  for (const v of VARIANTS) {
    const heap = heapOf(v.args);
    const b = spawnBackend(v.args);
    const row = { name: v.name, heapMb: heap, failed: null };
    try {
      port = await b.ready;
      token = (await call('POST', '/auth/login', { username: 'measure.admin', password: PASSWORD })).json().token;
      const pid = b.child.pid;
      await sleep(4000);
      row.idleMb = await javaWorkingSetMb(pid);
      const idleInfo = (await call('GET', '/system/info')).json();
      row.heapUsedAtIdleMb = idleInfo.heapUsedMb;
      row.heapCommittedAtIdleMb = idleInfo.heapCommittedMb;
      const peak = { mb: row.idleMb };
      let sampling = true;
      const sampler = (async () => { while (sampling) { peak.mb = Math.max(peak.mb, await javaWorkingSetMb(pid)); await sleep(100); } })();

      const roster = (await call('GET', `/attendance/sheet?classId=${ids.attendanceClass}&date=${ids.day}`)).json();
      const records = roster.rows.map((r, k) => ({ enrollmentId: r.enrollmentId, status: k % 9 === 0 ? 'ABSENT' : 'PRESENT', remark: null }));
      const all = (await call('GET', '/students')).json();
      const table = { sheetName: 'Students', title: 'Student list', subtitle: `${all.length} rows`, columns: ['No', 'Code', 'Name', 'Gender', 'Date of birth', 'Class'].map((label, i) => ({ label, type: i === 0 ? 'INTEGER' : i === 4 ? 'DATE' : 'TEXT' })), rows: all.map((s, i) => [i + 1, s.studentCode, s.nameKm, s.gender, s.dateOfBirth, `${s.gradeName ?? ''} ${s.className ?? ''}`]) };
      const work = {
        'student list (1,000 rows)': () => call('GET', '/students'),
        'search': () => call('GET', `/students?q=${encodeURIComponent('សិស្ស 1')}`),
        'attendance save (50)': () => call('PUT', '/attendance/sheet', { classId: ids.attendanceClass, date: ids.day, note: null, records }),
        'dashboard': () => call('GET', '/dashboard'),
        'results (40)': () => call('GET', `/examinations/${ids.examId}/results?classId=${ids.cardClass}`),
        'report cards (40)': () => call('GET', `/report-cards/data?examinationId=${ids.examId}&classId=${ids.cardClass}`),
        'Excel export (1,000 rows)': () => call('POST', '/reports/export', table),
      };
      row.calls = {};
      for (const [label, fn] of Object.entries(work)) {
        const ms = [];
        for (let i = 0; i < 13; i++) { const t0 = performance.now(); await fn(); if (i >= 3) ms.push(performance.now() - t0); }   // 3 warm-ups, 10 measured
        row.calls[label] = { medianMs: round(median(ms)), p95Ms: round(p95(ms)) };
      }
      // two bursts of the heavy requests. 3 clients x 10 rounds is more than one school PC does (a person has the dashboard open while exporting);
      // 8 clients x 5 rounds is an abuse test: it shows what happens when the database is asked for more than one writer at a time
      const burst = async (clients, rounds) => {
        const t0 = performance.now();
        const errors = [];
        await Promise.all(Array.from({ length: clients }, async () => {
          for (let r = 0; r < rounds; r++) for (const label of ['report cards (40)', 'Excel export (1,000 rows)', 'student list (1,000 rows)']) { try { await work[label](); } catch (e) { errors.push(String(e.message).slice(0, 140)); } }
        }));
        return { clients, seconds: Math.round((performance.now() - t0) / 100) / 10, errors: errors.length, firstError: errors[0] ?? null };
      };
      row.burst = await burst(3, 10);
      row.abuse = await burst(8, 5);
      const errors = row.burst.errors;
      sampling = false;
      await sampler;
      row.peakMb = peak.mb;
      const info = (await call('GET', '/system/info')).json();
      row.heapUsedMb = info.heapUsedMb;
      row.heapCommittedMb = info.heapCommittedMb;
      await sleep(3000);
      row.afterMb = await javaWorkingSetMb(pid);
      console.log(`${v.name.padEnd(30)} heap ${String(heap).padStart(3)} MB · idle ${row.idleMb} MB (heap used ${row.heapUsedAtIdleMb}/committed ${row.heapCommittedAtIdleMb}) · peak ${row.peakMb} MB · after ${row.afterMb} MB · burst(3) ${row.burst.seconds} s, ${errors} errors · abuse(8) ${row.abuse.seconds} s, ${row.abuse.errors} errors ${row.abuse.firstError ?? ''} · list ${row.calls['student list (1,000 rows)'].medianMs} ms · attendance ${row.calls['attendance save (50)'].medianMs} ms · cards ${row.calls['report cards (40)'].medianMs} ms`);
    } catch (e) {
      row.failed = String(e.message ?? e);
      console.log(`${v.name.padEnd(30)} FAILED: ${row.failed}`);
    } finally {
      await stopBackend(port, b.child);
      try { b.child.kill(); } catch { /* gone */ }
    }
    results.variants.push(row);
  }

  }

  // ---- part 2: the whole app, idle, for each preset and the graphics switch ----------------------------------------------------------
  if (!SKIP_APP) {
    const appDir = electronDist.toLowerCase();
    async function appWorkingSet() {
      const ps = `$d='${appDir.replace(/'/g, "''")}'; $p = Get-Process | Where-Object { $_.Path -and $_.Path.ToLower().StartsWith($d) }; ` +
        `'{0}|{1}|{2}' -f ($p | Measure-Object WorkingSet64 -Sum).Sum, ($p | Measure-Object).Count, (($p | Group-Object ProcessName | ForEach-Object { $_.Name + '=' + [math]::Round(($_.Group | Measure-Object WorkingSet64 -Sum).Sum/1MB) }) -join ' ')`;
      const [sum, count, detail] = (await run('powershell.exe', ['-NoProfile', '-Command', ps])).stdout.trim().split('|');
      return { totalMb: Math.round(Number(sum) / 1048576), processes: Number(count), byProcess: detail };
    }
    for (const combo of [{ preset: 'standard', gpuOff: false }, { preset: 'low-memory', gpuOff: false }, { preset: 'standard', gpuOff: true }, { preset: 'low-memory', gpuOff: true }]) {
      const appData = mkdtempSync(path.join(os.tmpdir(), 'sms app '));
      mkdirSync(path.join(appData, 'config'), { recursive: true });
      writeFileSync(path.join(appData, 'config', 'app.json'), JSON.stringify({ performance: { preset: combo.preset }, desktop: { disableGpu: combo.gpuOff } }));
      const env = { ...process.env, SMS_DATA_DIR: appData };
      delete env.ELECTRON_RUN_AS_NODE;
      const child = spawn(path.join(electronDist, 'electron.exe'), [desktop], { env, stdio: 'ignore' });
      const log = path.join(appData, 'logs', 'desktop.log');
      let shown = false;
      for (let k = 0; k < 480 && !shown; k++) { await sleep(250); shown = existsSync(log) && /main window shown/.test(readFileSync(log, 'utf8')); }
      const samples = [];
      if (shown) { await sleep(40_000); for (let i = 0; i < 3; i++) { samples.push(await appWorkingSet()); await sleep(1000); } }
      if (shown && samples.length) { const javaPid = Number(readFileSync(path.join(appData, 'config', 'backend.pid'), 'utf8')); const j = await javaWorkingSetMb(javaPid); for (const x of samples) { x.totalMb += j; x.processes += 1; x.byProcess += ` java=${j}`; } }
      const best = samples.sort((a, b) => a.totalMb - b.totalMb)[Math.floor(samples.length / 2)];
      results.app.push({ ...combo, shown, totalMb: best?.totalMb ?? null, processes: best?.processes ?? null, byProcess: best?.byProcess ?? null });
      console.log(`app ${combo.preset.padEnd(10)} graphics ${combo.gpuOff ? 'off' : 'on '}  idle ${best?.totalMb ?? '?'} MB in ${best?.processes ?? '?'} processes  (${best?.byProcess ?? 'window did not appear'})`);
      try { await run('taskkill', ['/PID', String(child.pid)]); } catch { /* gone */ }
      for (let k = 0; k < 60; k++) { await sleep(500); if (!existsSync(path.join(appData, 'config', 'running.lock'))) break; }
      try { await run('taskkill', ['/PID', String(child.pid), '/T', '/F']); } catch { /* gone */ }
      await sleep(1000);
      try { rmSync(appData, { recursive: true, force: true }); } catch { /* temp */ }
    }
  }
  console.log('\n' + JSON.stringify(results));
} catch (e) {
  console.error('FAILED: ' + (e.stack ?? e));
  process.exitCode = 1;
} finally {
  await sleep(500);
  for (const d of [data, work]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* temp folder */ } }
}
