// Phase 4 performance budgets on a school-sized data set (docs/PHASE0-ARCHITECTURE.md §4C.2, results -> docs/PERF-LOG.md):
//   Student list/search (1,000 rows) < 200 ms API · Save attendance for 50 students < 500 ms · Peak during a 40-card report-card PDF <= 1.2 GB total.
// Usage: node scripts/measure-reports.mjs [students=1000] [heapMb=512]
// Needs the extracted backend (npm run backend:build + node scripts/extract-backend.mjs), the generated UI (npm run generate -w frontend) and the
// desktop bundle (npm run build -w desktop).
// Part 1 seeds a school over HTTP into a fresh data folder and times the API calls (median of 5, warm). Part 2 starts the app (unpackaged Electron:
// the same Electron, backend jar and JVM options, the full JDK instead of the trimmed JRE) on that folder, signs in through the UI, opens the 40 report
// cards of a class and saves them as ONE PDF while sampling the working set of every process of the app. A debugger (Playwright) is attached to Electron
// for that, which inflates its memory by a few hundred MB (docs/PERF-LOG.md), so the peak is a pessimistic figure. Nothing is printed on a printer.
import { _electron as electron } from 'playwright-core';
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { javaExe } from './lib/jdk.mjs';

const root = path.resolve(import.meta.dirname, '..');
const jar = path.join(root, 'backend', 'target', 'extracted', 'sms-backend.jar');
const desktop = path.join(root, 'desktop');
const electronDist = path.join(root, 'node_modules', 'electron', 'dist');
for (const [what, p] of [['the extracted backend', jar], ['the generated UI', path.join(root, 'frontend', '.output', 'public', 'index.html')], ['the desktop bundle', path.join(desktop, 'dist')]]) {
  if (!existsSync(p)) {
    console.error(`${what} is missing (${p}): build it first (see the header of this script).`);
    process.exit(1);
  }
}
const STUDENTS = Number(process.argv[2] ?? 1000);
const HEAP = Number(process.argv[3] ?? 512);
const km = JSON.parse(readFileSync(path.join(root, 'frontend', 'i18n', 'locales', 'km.json'), 'utf8'));
const t = (key) => key.split('.').reduce((n, p) => n?.[p], km);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = promisify(execFile);
const data = mkdtempSync(path.join(tmpdir(), 'sms measure ទិន្នន័យ '));
const outDir = path.join(desktop, 'test', 'out');
const secret = crypto.randomBytes(32).toString('hex');
const PASSWORD = 'Measure-School-Pass-1';
const result = { machine: `${os.cpus()[0]?.model.trim()} · ${os.cpus().length} threads · ${Math.round(os.totalmem() / 2 ** 30)} GB RAM · ${os.release()}`, students: STUDENTS, heapMb: HEAP };

function tmpdir() { return os.tmpdir(); }
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const round = (x) => Math.round(x);

/** Working set (MB) of the Electron processes of this checkout plus the backend's java.exe. */
async function workingSetMb(javaPid) {
  const ps = `$d='${electronDist.toLowerCase().replace(/'/g, "''")}'; $e = @(Get-Process | Where-Object { $_.Path -and $_.Path.ToLower().StartsWith($d) }); ` +
    `$j = @(Get-Process -Id ${javaPid} -ErrorAction SilentlyContinue); ($e + $j | Measure-Object WorkingSet64 -Sum).Sum`;
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-Command', ps]);
  return Math.round(Number(stdout.trim()) / 1048576);
}

let backend;
let app;
try {
  // ---- part 1: seed over HTTP and time the API --------------------------------------------------------------------------------------
  const child = spawn(javaExe(), [`-Xms64m`, `-Xmx${HEAP}m`, '-XX:MaxMetaspaceSize=160m', '-Xss512k', '-XX:+UseSerialGC', '-XX:TieredStopAtLevel=1', '-Dfile.encoding=UTF-8', '-jar', jar], {
    env: { ...process.env, SMS_DATA_DIR: data, SMS_LAUNCH_SECRET: secret }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  backend = child;
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
  let token = '';
  const call = async (method, p, body) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/v1${p}`, {
      method, headers: { 'X-SMS-Launch-Secret': secret, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const bytes = Buffer.from(await r.arrayBuffer());
    if (r.status >= 300 && !(method === 'GET' && r.status === 304)) throw new Error(`${method} ${p} -> ${r.status} ${bytes.toString('utf8').slice(0, 200)}`);
    return { status: r.status, bytes, json: () => JSON.parse(bytes.toString('utf8')) };
  };
  const time = async (label, fn, runs = 5) => {
    const ms = [];
    let last;
    for (let i = 0; i < runs; i++) {
      const t0 = performance.now();
      last = await fn();
      ms.push(performance.now() - t0);
    }
    result[label] = { medianMs: round(median(ms)), maxMs: round(Math.max(...ms)), bytes: last?.bytes?.length };
    console.log(`${label.padEnd(34)} median ${String(round(median(ms))).padStart(5)} ms   max ${String(round(Math.max(...ms))).padStart(5)} ms   ${last?.bytes ? `${last.bytes.length} bytes` : ''}`);
    return last;
  };

  console.log(`seeding ${STUDENTS} students into ${data}\n`);
  token = (await call('POST', '/auth/setup', { displayName: 'អ្នកគ្រប់គ្រង', username: 'measure.admin', password: PASSWORD })).json().token;
  await call('POST', '/auth/recovery-key/confirm');
  const school = (await call('GET', '/settings/school')).json();
  await call('PUT', '/settings/school', { nameKm: 'សាលាបឋមសិក្សាសាកល្បង', address: 'ភូមិសាកល្បង ខេត្តកណ្តាល', directorName: 'លោក នាយក', version: school.version });
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
    for (let i = 0; i < count; i++, n++) {
      await call('POST', '/students', { nameKm: `សិស្ស ${n + 1}`, gender: n % 2 ? 'FEMALE' : 'MALE', dateOfBirth: day(-2500 - (n % 300)), enrollmentDate: null, classId, allowDuplicate: false, guardians: [] });
    }
  };
  const cardClass = await makeClass(1, 'ក');          // 40 students with scores: the 40 report cards
  await enrol(cardClass, 40);
  const attendanceClass = await makeClass(1, 'ខ');    // 50 students: the attendance budget
  await enrol(attendanceClass, 50);
  const names = ['ក', 'ខ', 'គ', 'ឃ', 'ង'];
  let level = 2;
  let slot = 0;
  while (n < STUDENTS) {
    const cls = await makeClass(level, names[slot]);
    await enrol(cls, Math.min(40, STUDENTS - n));
    if (++slot === names.length) { slot = 0; level++; }
  }
  console.log(`${n} students in ${await (async () => (await call('GET', `/classes?yearId=${year.id}`)).json().length)()} classes`);

  const exam = (await call('POST', '/examinations', { academicYearId: year.id, nameKm: 'ប្រឡងសាកល្បង', kind: 'MONTHLY', termNo: 1 })).json();
  const subjects = (await call('GET', `/examinations/${exam.id}/subjects`)).json().filter((s) => s.gradeId === gradeId(1));
  for (const [i, s] of subjects.entries()) {
    const sheet = (await call('GET', `/examinations/${exam.id}/scores?classId=${cardClass}&subjectId=${s.subjectId}`)).json();
    const scores = sheet.rows.map((r, k) => ({ enrollmentId: r.enrollmentId, score: 40 + ((k * 7 + i * 13) % 60), absent: false }));
    await call('PUT', `/examinations/${exam.id}/scores`, { classId: cardClass, subjectId: s.subjectId, scores });
  }
  const cards = (await call('GET', `/report-cards/data?examinationId=${exam.id}&classId=${cardClass}`)).json();
  const comment = 'សិស្សនេះខិតខំរៀនសូត្រ និងមានការរីកចម្រើនល្អក្នុងមុខវិជ្ជាភាគច្រើន។ សូមបន្តព្យាយាម ហើយបង្កើនការអានសៀវភៅនៅផ្ទះឱ្យបានទៀងទាត់។';
  for (const c of cards) await call('PUT', '/report-cards/comment', { examinationId: exam.id, enrollmentId: c.enrollmentId, comment });
  console.log(`${subjects.length} subjects scored for ${cards.length} students, comments written\n`);

  await time('GET /students (all rows)', () => call('GET', '/students'));
  await time('GET /students?q= (search)', () => call('GET', `/students?q=${encodeURIComponent('សិស្ស 1')}`));
  const roster = (await call('GET', `/attendance/sheet?classId=${attendanceClass}&date=${day(0)}`)).json();
  const records = roster.rows.map((r, k) => ({ enrollmentId: r.enrollmentId, status: k % 9 === 0 ? 'ABSENT' : 'PRESENT', remark: null }));
  await time('PUT /attendance/sheet (50 students)', () => call('PUT', '/attendance/sheet', { classId: attendanceClass, date: day(0), note: null, records }));
  await time('GET /dashboard', () => call('GET', '/dashboard'));
  await time('GET results (40 students)', () => call('GET', `/examinations/${exam.id}/results?classId=${cardClass}`));
  await time('GET report cards (40 cards)', () => call('GET', `/report-cards/data?examinationId=${exam.id}&classId=${cardClass}`));
  const all = (await call('GET', '/students')).json();
  const table = {
    sheetName: 'Students', title: 'Student list', subtitle: `${all.length} rows`,
    columns: ['No', 'Code', 'Name', 'Gender', 'Date of birth', 'Class'].map((label, i) => ({ label, type: i === 0 ? 'INTEGER' : i === 4 ? 'DATE' : 'TEXT' })),
    rows: all.map((s, i) => [i + 1, s.studentCode, s.nameKm, s.gender, s.dateOfBirth, `${s.gradeName ?? ''} ${s.className ?? ''}`]),
  };
  await time('POST /reports/export (1,000 rows)', () => call('POST', '/reports/export', table));
  await time('POST /students/export (1,000 rows)', () => call('POST', '/students/export', { labels: {} }));

  await fetch(`http://127.0.0.1:${port}/internal/shutdown`, { method: 'POST', headers: { 'X-SMS-Launch-Secret': secret } });
  await Promise.race([new Promise((r) => backend.once('exit', r)), sleep(30_000)]);
  backend = null;

  // ---- part 2: the 40-card PDF in the real app, with memory sampled -----------------------------------------------------------------
  const env = { ...process.env, SMS_DATA_DIR: data };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: path.join(electronDist, 'electron.exe'), args: [desktop], env, timeout: 120_000 });
  let page;
  for (let i = 0; i < 400 && !page; i++) { page = app.windows().find((w) => w.url().startsWith('app://school')); if (!page) await sleep(300); }
  if (!page) throw new Error('the app window did not appear');
  const field = (name) => page.locator(`input[id^="field-${name}-"]`).first();
  await field('username').waitFor({ timeout: 90_000 });
  await field('username').fill('measure.admin');
  await field('password').fill(PASSWORD);
  await page.getByRole('button', { name: t('auth.login.submit'), exact: true }).click();
  await page.waitForURL('**/dashboard', { timeout: 60_000 });
  await page.locator('[data-testid=dashboard-figures]').waitFor({ timeout: 30_000 });
  await page.locator('a[href="/report-cards"]').first().click();
  await page.locator('[data-testid=cards-table] tbody tr[data-student]').first().waitFor({ timeout: 30_000 });
  await page.locator('[data-testid=print-all]').click();
  await page.locator('.report-card').nth(39).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  const javaPid = Number(readFileSync(path.join(data, 'config', 'backend.pid'), 'utf8'));
  const cardsOnPage = await page.locator('.report-card').count();
  const idle = [];
  for (let i = 0; i < 3; i++) { idle.push(await workingSetMb(javaPid)); await sleep(500); }

  // Three saves in a row. The memory is sampled all the time and for a few seconds after each save: a PDF takes under a second, a sample a few
  // hundred milliseconds, so sampling only "during" would miss the peak (the working set stays high for a while after the work is done).
  const pdfPath = path.join(outDir, 'measure-40-cards.pdf');
  await app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }); }, pdfPath);
  const samples = [];
  let sampling = true;
  const sampler = (async () => { while (sampling) { samples.push(await workingSetMb(javaPid)); await sleep(50); } })();
  const runs = [];
  for (let k = 1; k <= 3; k++) {
    rmSync(pdfPath, { force: true });
    const t0 = performance.now();
    await page.getByRole('button', { name: t('print.savePdf'), exact: true }).click();
    while (!existsSync(pdfPath) && performance.now() - t0 < 120_000) await sleep(50);
    let size = 0;
    for (let i = 0; i < 100; i++) { const now = existsSync(pdfPath) ? statSync(pdfPath).size : 0; if (now > 0 && now === size) break; size = now; await sleep(150); }
    const seconds = (performance.now() - t0) / 1000;
    await sleep(3000);
    const pdf = readFileSync(pdfPath);
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
    runs.push({ run: k, seconds: Math.round(seconds * 10) / 10, pages, bytes: pdf.length });
    console.log(`save ${k}: ${pages} PDF pages, ${pdf.length} bytes, ${runs.at(-1).seconds} s; working set so far at most ${Math.max(...samples)} MB`);
  }
  sampling = false;
  await sampler;
  result.pdf = { cardsOnPage, runs, idleMb: Math.max(...idle), peakMb: Math.max(...samples, ...idle), samples: samples.length };
  console.log(`\n${cardsOnPage} cards on the page; working set (Electron + backend, debugger attached): idle ${result.pdf.idleMb} MB, peak around three PDF saves ${result.pdf.peakMb} MB (${samples.length} samples)`);
  await app.close();
  app = null;
  console.log('\n' + JSON.stringify(result));
} catch (e) {
  console.error('FAILED: ' + (e.stack ?? e));
  process.exitCode = 1;
} finally {
  try { if (app) await app.close(); } catch { /* ignore */ }
  try { if (backend) backend.kill(); } catch { /* ignore */ }
  await sleep(1000);
  try { rmSync(data, { recursive: true, force: true }); } catch { /* temp folder */ }
}
