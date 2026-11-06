// A small FICTIONAL school for trying the program out: invented people, invented marks, invented dates. Nothing here is real or official.
// It starts the real backend on a fresh, separate data folder and builds the school through the program's own API (so every rule of the program is
// applied), then closes the backend cleanly. Your real data folder and your .dev-data are never touched.
// Grade 3 also gets a DEMO subject configuration (main subjects, sub-subjects and sample marks, every name labelled "(គំរូ)" / "[DEMO]"), read from
// scripts/sample-data/grade3-demo-subjects.json. It is sample data for trying the screens out, NOT the school's curriculum, and it lives only in this fictional school.
// Usage: node scripts/seed-sample-data.mjs [--fresh] [--dir <a folder that does not exist yet>]   (needs: npm run backend:build + node scripts/extract-backend.mjs)
//   default folder: <repo>/.sample-data (git-ignored); --fresh deletes THAT folder first and nothing else. --dir builds it somewhere else instead (it must not exist).
// Then open it:  node scripts/start-sample.mjs        (sign-in details are written to .sample-data/SAMPLE-LOGIN.txt)
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { javaExe } from './lib/jdk.mjs';

const root = path.resolve(import.meta.dirname, '..');
const jar = path.join(root, 'backend', 'target', 'extracted', 'sms-backend.jar');
const dirFlag = process.argv.indexOf('--dir');
if (dirFlag >= 0 && !process.argv[dirFlag + 1]) { console.error('--dir needs a folder that does not exist yet.'); process.exit(1); }
const data = dirFlag >= 0 ? path.resolve(process.argv[dirFlag + 1]) : path.join(root, '.sample-data');
const fresh = process.argv.includes('--fresh');
if (!existsSync(jar)) { console.error(`The extracted backend is missing (${jar}): run npm run backend:build and node scripts/extract-backend.mjs first.`); process.exit(1); }
if (existsSync(data)) {
  if (!fresh) { console.error(`${data} already exists. Open it with: node scripts/start-sample.mjs\nTo build it again from scratch: node scripts/seed-sample-data.mjs --fresh`); process.exit(1); }
  if (path.basename(data) !== '.sample-data' || path.dirname(data) !== root) throw new Error('refusing to delete anything but the sample folder');
  rmSync(data, { recursive: true, force: true });
}
mkdirSync(data, { recursive: true });

const USERNAME = 'admin.sample';
const PASSWORD = 'Sample-KPSMS-2026';
const secret = crypto.randomBytes(32).toString('hex');

// ---- a small deterministic random source, so the same school comes out every time -----------------------------------------------------
let seed = 2026;
const rand = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (list) => list[Math.floor(rand() * list.length)];
const shuffle = (list) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const chance = (p) => rand() < p;

const FAMILY = ['សុខ', 'ចាន់', 'ជា', 'ហេង', 'លី', 'ស៊ុន', 'គឹម', 'ម៉ម', 'ភឹម', 'ឈួន', 'ទេព', 'វ៉ាន់', 'កែវ', 'ឈឹម', 'ម៉ៅ'];
const MALE = ['ដារា', 'វិចិត្រ', 'សុវណ្ណ', 'បូរី', 'រតនា', 'សោភ័ណ', 'វុទ្ធី', 'ពិសិដ្ឋ', 'ចន្ថា', 'សម្បត្តិ', 'បញ្ញា', 'ធារ៉ា', 'ឧត្តម', 'សំអូន', 'រិទ្ធី'];
const FEMALE = ['ស្រីនាង', 'ស្រីមុំ', 'សុភា', 'ចរិយា', 'ដាលីន', 'ម៉ាលី', 'សុខា', 'ស្រីលក្ខណ៍', 'ធីតា', 'បូព៌ា', 'កញ្ញា', 'ស្រីពៅ', 'សុធា', 'ចាន់ណា', 'វណ្ណា'];
const names = shuffle(FAMILY.flatMap((f) => [...MALE.map((g) => ({ f, g, gender: 'MALE' })), ...FEMALE.map((g) => ({ f, g, gender: 'FEMALE' }))]));
let nameAt = 0;
let phoneAt = 0;
const phone = () => `000 000 ${String(++phoneAt).padStart(3, '0')}`;   // obviously not a real number

const today = new Date();
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const day = (n) => iso(new Date(today.getTime() + n * 86_400_000));
const isWeekday = (isoDate) => { const d = new Date(`${isoDate}T12:00:00`).getDay(); return d >= 1 && d <= 5; };

// ---- start the real backend on the sample folder --------------------------------------------------------------------------------------
const child = spawn(javaExe(), ['-Xms64m', '-Xmx512m', '-XX:MaxMetaspaceSize=160m', '-Xss512k', '-XX:+UseSerialGC', '-XX:TieredStopAtLevel=1', '-Dfile.encoding=UTF-8', '-jar', jar], {
  env: { ...process.env, SMS_DATA_DIR: data, SMS_LAUNCH_SECRET: secret }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
child.stderr.resume();
child.stdout.setEncoding('utf8');
const port = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('the backend did not become ready in 90 s')), 90_000);
  let buf = '';
  child.stdout.on('data', (d) => { buf += d; const m = /SMS_READY (\{.*\})/.exec(buf); if (m) { clearTimeout(timer); resolve(JSON.parse(m[1]).port); } });
  child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`the backend exited early (${code})`)); });
});

let token = '';
const call = async (method, p, body) => {
  const res = await fetch(`http://127.0.0.1:${port}${p.startsWith('/internal') ? '' : '/api/v1'}${p}`, {
    method, headers: { 'X-SMS-Launch-Secret': secret, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (res.status >= 300) throw new Error(`${method} ${p} -> ${res.status} ${text.slice(0, 240)}`);
  return text ? JSON.parse(text) : null;
};
const counts = { teachers: 0, students: 0, classes: 0, sheets: 0, records: 0, scores: 0, homework: 0, events: 0, charges: 0, payments: 0 };

try {
  // ---- the account and the school ---------------------------------------------------------------------------------------------------
  const setup = await call('POST', '/auth/setup', { displayName: 'អ្នកគ្រប់គ្រងគំរូ', username: USERNAME, password: PASSWORD });
  token = setup.token;
  const recoveryKey = setup.recoveryKey ?? setup.key ?? null;
  await call('POST', '/auth/recovery-key/confirm');
  const profile = await call('GET', '/settings/school');
  await call('PUT', '/settings/school', { nameKm: 'សាលាបឋមសិក្សាគំរូ (ទិន្នន័យសាកល្បង)', address: 'ភូមិគំរូ ឃុំគំរូ ស្រុកគំរូ ខេត្តគំរូ', directorName: 'លោក គំរូ នាយក', version: profile.version });
  await call('POST', '/setup/complete');

  // ---- the Grade 3 DEMO subject configuration (scripts/sample-data/grade3-demo-subjects.json): a sample hierarchy with sample marks, labelled as demo data ----------
  // Nothing about it is in the program: it is read from the file, goes in through the program's own API (so every rule of the program applies) and only into this fictional school.
  const demo = JSON.parse(readFileSync(path.join(import.meta.dirname, 'sample-data', 'grade3-demo-subjects.json'), 'utf8'));
  if (demo.demo !== true) throw new Error('the Grade 3 sample file is not marked as demo data: refusing to load it');
  const demoIds = new Set();
  const demoMax = new Map();   // sub-subject id -> its marks in the sample
  for (const m of demo.mains) {
    const sum = m.subs.reduce((total, sub) => total + sub.max, 0);
    if (sum > m.mainMax) throw new Error(`${m.nameEn}: the sub-subjects add up to ${sum}, more than the main subject's ${m.mainMax}`);
    if (sum !== m.mainMax) throw new Error(`${m.nameEn}: this version of the program makes a main subject exactly the sum of its sub-subjects (${sum}), the sample says ${m.mainMax}`);
    const main = await call('POST', '/subjects', { nameKm: `${m.nameKm} ${demo.label.km}`, nameEn: `${demo.label.en} ${m.nameEn}` });
    demoIds.add(main.id);
    for (const sub of m.subs) {
      const created = await call('POST', '/subjects', { nameKm: `${sub.nameKm} ${demo.label.km}`, nameEn: `${demo.label.en} ${sub.nameEn}`, parentId: main.id });
      demoIds.add(created.id);
      demoMax.set(created.id, sub.max);
    }
  }
  // grade 3 studies the demo subjects only; every other grade keeps its own list and none of the demo ones (grades may differ)
  for (const g of await call('GET', '/grades')) {
    await call('PUT', `/grades/${g.id}/subjects`, { subjectIds: g.level === demo.gradeLevel ? [...demoIds] : g.subjectIds.filter((id) => !demoIds.has(id)) });
  }
  const mainIds = new Set((await call('GET', '/subjects')).filter((x) => x.parentId === null).map((x) => x.id));
  console.log(`demo subjects: grade ${demo.gradeLevel}: ${demo.mains.length} main subjects, ${demoMax.size} sub-subjects (DEMO DATA, every name labelled ${demo.label.km})`);

  // ---- the academic year, its sessions, the classes ---------------------------------------------------------------------------------
  const yearStart = day(-45);
  const year = await call('POST', '/academic-years', { nameKm: 'ឆ្នាំសិក្សាគំរូ', startDate: yearStart, endDate: day(285), makeCurrent: true });
  const grades = await call('GET', '/grades');
  const grade = (level) => grades.find((g) => g.level === level);
  const mainSubjectIds = (level) => grade(level).subjectIds.filter((id) => mainIds.has(id));   // teachers and homework are per main subject
  const periods = await call('GET', `/attendance-periods?academicYearId=${year.id}`);
  const wholeDay = periods[0];
  // example sessions for trying the screens out: the times are NOT the school's timetable and are left unconfirmed on purpose
  const morning = await call('POST', '/attendance-periods', { academicYearId: year.id, nameKm: 'ព្រឹក', startTime: '07:00', endTime: '11:00' });
  const afternoon = await call('POST', '/attendance-periods', { academicYearId: year.id, nameKm: 'រសៀល', startTime: '13:00', endTime: '17:00' });

  const SPECIALTIES = ['ភាសាខ្មែរ', 'គណិតវិទ្យា', 'វិទ្យាសាស្ត្រ', 'សិក្សាសង្គម', 'អប់រំកាយ និងកីឡា', 'សិល្បៈ', 'ភាសាខ្មែរ', 'គណិតវិទ្យា'];
  const teachers = [];
  for (let i = 0; i < 8; i++) {
    const n = names.find((x, k) => k > 400 && x.gender === (i % 3 === 0 ? 'MALE' : 'FEMALE') && !teachers.some((t) => t.name === `${x.f} ${x.g}`));
    const t = await call('POST', '/teachers', { nameKm: `${n.f} ${n.g}`, gender: n.gender, phone: phone(), address: 'ភូមិគំរូ', specialization: SPECIALTIES[i], employmentDate: day(-3000 - i * 400) });
    teachers.push({ ...t, name: `${n.f} ${n.g}` });
    counts.teachers++;
  }

  // class name, grade level, students, takes attendance in two sessions
  const PLAN = [['ក', 1, 12, true], ['ខ', 1, 10, true], ['ក', 2, 12, true], ['ក', 3, 11, true], ['ក', 4, 10, false], ['ក', 5, 9, false], ['ក', 6, 8, false]];
  const classes = [];
  for (const [i, [nameKm, level, size, twoSessions]] of PLAN.entries()) {
    const created = await call('POST', '/classes', { academicYearId: year.id, gradeId: grade(level).id, nameKm, capacity: 40, homeroomTeacherId: teachers[i % teachers.length].id, shift: null });
    const cls = { id: created.schoolClass.id, level, nameKm, size, twoSessions, students: [] };
    // a teacher for each of the grade's subjects, taken in turn
    await call('PUT', `/classes/${cls.id}/teachers`, { assignments: mainSubjectIds(level).map((subjectId, k) => ({ subjectId, teacherId: teachers[(i + k) % teachers.length].id })) });
    for (let s = 0; s < size; s++) {
      const n = names[nameAt++];
      const born = new Date(today.getFullYear() - (5 + level) - (chance(0.25) ? 1 : 0), Math.floor(rand() * 12), 1 + Math.floor(rand() * 28));
      const father = names.find((x, k) => k > 200 && x.gender === 'MALE' && x.f === n.f) ?? { f: n.f, g: pick(MALE) };
      const mother = { f: pick(FAMILY), g: pick(FEMALE) };
      await call('POST', '/students', {
        nameKm: `${n.f} ${n.g}`, gender: n.gender, dateOfBirth: iso(born), enrollmentDate: yearStart, classId: cls.id, allowDuplicate: false,
        address: 'ភូមិគំរូ ឃុំគំរូ', village: 'ភូមិគំរូ', commune: 'ឃុំគំរូ', district: 'ស្រុកគំរូ', province: 'ខេត្តគំរូ',
        guardians: [{ nameKm: `${father.f} ${father.g}`, relationship: 'FATHER', phone: phone(), primary: false }, { nameKm: `${mother.f} ${mother.g}`, relationship: 'MOTHER', phone: phone(), primary: true }],
      });
      counts.students++;
    }
    cls.students = await call('GET', `/classes/${cls.id}/students`);
    classes.push(cls);
    counts.classes++;
  }
  console.log(`school: ${counts.classes} classes, ${counts.students} students, ${counts.teachers} teachers`);

  // ---- attendance: the school days before today, today left empty so it can be tried ------------------------------------------------
  const schoolDays = [];
  for (let n = -28; n <= -1; n++) if (isWeekday(day(n)) && day(n) >= yearStart) schoolDays.push(day(n));
  const attend = async (cls, date, period, statuses) => {
    const records = cls.students.map((s) => ({ enrollmentId: s.enrollmentId, status: statuses.get(s.enrollmentId), remark: null }));
    await call('PUT', '/attendance/sheet', { classId: cls.id, date, periodId: period.id, note: null, records });
    counts.sheets++;
    counts.records += records.length;
  };
  const roll = () => { const r = rand(); return r < 0.04 ? 'ABSENT' : r < 0.07 ? 'LEAVE' : r < 0.12 ? 'LATE' : 'PRESENT'; };
  for (const cls of classes) {
    for (const date of schoolDays) {
      const first = new Map(cls.students.map((s) => [s.enrollmentId, roll()]));
      if (!cls.twoSessions) { await attend(cls, date, wholeDay, first); continue; }
      // the afternoon follows the morning: a student who came usually stays, one who was away usually still is, and now and then someone leaves early (a partial day)
      const second = new Map([...first].map(([id, status]) => [id, status === 'ABSENT' || status === 'LEAVE' ? (chance(0.8) ? status : 'PRESENT') : chance(0.05) ? 'ABSENT' : 'PRESENT']));
      await attend(cls, date, morning, first);
      await attend(cls, date, afternoon, second);
    }
  }
  console.log(`attendance: ${counts.sheets} sheets, ${counts.records} records over ${schoolDays.length} school days (today is left empty)`);

  // ---- two examinations: October complete, November still being entered ----------------------------------------------------------------
  const october = await call('POST', '/examinations', { academicYearId: year.id, nameKm: 'ប្រឡងប្រចាំខែតុលា', kind: 'MONTHLY', termNo: 10, startDate: day(-20), endDate: day(-18) });
  const november = await call('POST', '/examinations', { academicYearId: year.id, nameKm: 'ប្រឡងប្រចាំខែវិច្ឆិកា', kind: 'MONTHLY', termNo: 11, startDate: day(-3), endDate: day(-2) });
  // the program starts every sub-subject of a new examination at a placeholder maximum; the sample sets its own marks for grade 3
  const applyDemoMarks = async (exam) => {
    const rows = (await call('GET', `/examinations/${exam.id}/subjects`)).filter((r) => r.gradeId === grade(demo.gradeLevel).id);
    for (const row of rows) {
      for (const sub of row.subSubjects) {
        const planned = demoMax.get(sub.subjectId);
        if (planned !== undefined && sub.maxScore !== planned) await call('PUT', `/examinations/${exam.id}/sub-subjects/${sub.id}`, { maxScore: planned });
      }
    }
  };
  await applyDemoMarks(october);
  await applyDemoMarks(november);
  const ability = new Map(classes.flatMap((c) => c.students.map((s) => [s.enrollmentId, 0.25 + rand() * 0.7])));
  const score = (enrollmentId) => Math.max(5, Math.min(100, Math.round(ability.get(enrollmentId) * 70 + 22 + (rand() - 0.5) * 24)));
  // the same kind of mark scaled to a smaller maximum, in halves (a sub-subject of 10 marks gets 0, 0.5 ... 10)
  const scoreFor = (enrollmentId, max) => (max === 100 ? score(enrollmentId) : Math.min(max, Math.round((score(enrollmentId) / 100) * max * 2) / 2));
  const scoreClass = async (exam, cls, { leaveOutLast = 0, absentChance = 0.03 } = {}) => {
    const mains = (await call('GET', `/examinations/${exam.id}/subjects`)).filter((s) => s.gradeId === grade(cls.level).id);
    // a main subject made of sub-subjects is typed at its sub-subjects (their marks add up to it)
    const units = mains.flatMap((m) => (m.subSubjects.length > 0 ? m.subSubjects.map((sub) => ({ subjectId: sub.subjectId, max: sub.maxScore })) : [{ subjectId: m.subjectId, max: m.maxScore }]));
    for (const subject of units) {
      const sheet = await call('GET', `/examinations/${exam.id}/scores?classId=${cls.id}&subjectId=${subject.subjectId}`);
      const scores = sheet.rows.map((r, k) => {
        if (k >= sheet.rows.length - leaveOutLast) return { enrollmentId: r.enrollmentId, score: null, absent: false, remark: null };   // not entered yet
        const away = chance(absentChance);
        return { enrollmentId: r.enrollmentId, score: away ? null : scoreFor(r.enrollmentId, subject.max), absent: away, remark: null };
      });
      await call('PUT', `/examinations/${exam.id}/scores`, { classId: cls.id, subjectId: subject.subjectId, scores });
      counts.scores += scores.length;
    }
  };
  for (const cls of classes) await scoreClass(october, cls);
  await scoreClass(november, classes[0], { leaveOutLast: 2 });     // grade 1 ក: two students not entered yet, so their result is incomplete
  await scoreClass(november, classes[2]);
  console.log(`examinations: 2, ${counts.scores} scores entered`);

  // the teacher's comment on a few October report cards
  const COMMENTS = ['ខិតខំរៀនសូត្របានល្អ សូមបន្តព្យាយាម។', 'មានការរីកចម្រើនក្នុងមុខវិជ្ជាគណិតវិទ្យា។', 'គួរអានសៀវភៅបន្ថែមក្នុងពេលទំនេរ។', 'ចូលរួមសកម្មភាពក្នុងថ្នាក់បានល្អ។', 'ត្រូវការការយកចិត្តទុកដាក់លើការសរសេរ។'];
  for (const [k, s] of classes[0].students.slice(0, 5).entries()) await call('PUT', '/report-cards/comment', { examinationId: october.id, enrollmentId: s.enrollmentId, comment: COMMENTS[k] });

  // ---- homework and school events ---------------------------------------------------------------------------------------------------
  const TITLES = ['លំហាត់ទំព័រ ១២', 'សរសេរអត្ថបទខ្លី', 'រៀនកាត់ឃ្លា', 'ដោះស្រាយលំហាត់គណិតវិទ្យា', 'គូររូបភាពសត្វ', 'អានមេរៀនថ្មី', 'ចម្លងអក្សរស្អាត', 'ប្រមូលស្លឹកឈើ'];
  const homework = [];
  for (const [k, title] of TITLES.entries()) {
    const cls = classes[k % classes.length];
    const subjectId = mainSubjectIds(cls.level)[k % mainSubjectIds(cls.level).length];
    homework.push(await call('POST', '/homework', { classId: cls.id, subjectId, title, description: 'ជាលំហាត់គំរូសម្រាប់សាកល្បងកម្មវិធី។', assignedDate: day(-6 + k), dueDate: day(-2 + k), remark: null }));
    counts.homework++;
  }
  for (const h of homework.slice(0, 3)) await call('PUT', `/homework/${h.id}/status`, { status: 'DONE', version: h.version });
  const EVENTS = [['ប្រជុំមាតាបិតា (គំរូ)', 5, null], ['សកម្មភាពសំអាតសាលា (គំរូ)', 2, null], ['ដំណើរកម្សាន្តរបស់សិស្ស (គំរូ)', -3, null], ['ប្រឡងឆមាស (គំរូ)', 30, 32], ['ពិធីបញ្ចប់ការសិក្សា (គំរូ)', 90, null]];
  for (const [titleKm, from, to] of EVENTS) { await call('POST', '/school-events', { titleKm, startDate: day(from), endDate: to === null ? null : day(to), note: 'ព្រឹត្តិការណ៍គំរូសម្រាប់សាកល្បង។' }); counts.events++; }
  console.log(`homework: ${counts.homework}, school events: ${counts.events}`);

  // ---- fees in riel and in dollars (switched on so they can be tried; they are optional and off by default in a real school) ------------
  await call('PUT', '/settings/app', { 'fees.enabled': 'true', 'fees.currencies': 'KHR,USD' });
  const monthly = await call('POST', '/fees/categories', { nameKm: 'ថ្លៃសិក្សាប្រចាំខែ', currency: 'KHR', defaultAmount: 15000 });
  const books = await call('POST', '/fees/categories', { nameKm: 'ថ្លៃសៀវភៅ', currency: 'USD', defaultAmount: 12.5 });
  for (const cls of classes) { await call('POST', '/fees/charges/class', { classId: cls.id, categoryId: monthly.id, amount: null, dueDate: day(10), note: null }); counts.charges += cls.students.length; }
  for (const cls of classes.slice(0, 2)) { await call('POST', '/fees/charges/class', { classId: cls.id, categoryId: books.id, amount: null, dueDate: day(20), note: null }); counts.charges += cls.students.length; }
  const payFirst = [...classes[0].students, ...classes[1].students, ...classes[2].students];
  let voided = false;
  for (const [k, s] of payFirst.entries()) {
    const ledger = await call('GET', `/fees/enrollments/${s.enrollmentId}`);
    for (const charge of ledger.charges) {
      if (charge.currency === 'KHR' && k % 5 !== 4) {
        const paid = await call('POST', `/fees/charges/${charge.id}/payments`, { amount: k % 7 === 3 ? 8000 : 15000, paidOn: day(-(k % 9)), method: k % 3 === 0 ? 'BANK' : 'CASH', reference: null });
        counts.payments++;
        if (!voided && k === 6) { await call('POST', `/fees/payments/${paid.id}/void`, { reason: 'កំហុសក្នុងការកត់ត្រា (គំរូ)' }); voided = true; }
      } else if (charge.currency === 'USD' && k % 3 === 0) {
        await call('POST', `/fees/charges/${charge.id}/payments`, { amount: k % 2 ? 5 : 12.5, paidOn: day(-2), method: 'CASH', reference: null });
        counts.payments++;
      }
    }
  }
  console.log(`fees: ${counts.charges} charges, ${counts.payments} payments (one voided)`);

  // ---- the demo configuration is checked before the backend is closed: labelled, grade 3 only, the marks of the file, every main subject counted once ----------------
  const verdicts = [];
  const verify = (name, ok, detail = '') => { verdicts.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  demo: ${name}${detail ? ' — ' + detail : ''}`); };
  {
    const catalogue = await call('GET', '/subjects');
    const demoRows = catalogue.filter((x) => demoIds.has(x.id));
    verify('every demo subject and sub-subject is labelled as demo data in Khmer and in English', demoRows.length === demoIds.size && demoRows.every((x) => x.nameKm.endsWith(demo.label.km) && (x.nameEn ?? '').startsWith(demo.label.en)));
    const allGrades = await call('GET', '/grades');
    const g3 = allGrades.find((g) => g.level === demo.gradeLevel);
    verify('grade 3 studies the demo subjects and nothing else, and no other grade has any of them', g3.subjectIds.length === demoIds.size && [...demoIds].every((id) => g3.subjectIds.includes(id))
      && allGrades.filter((g) => g.level !== demo.gradeLevel).every((g) => g.subjectIds.every((id) => !demoIds.has(id))));
    const byName = new Map(demo.mains.map((m) => [`${m.nameKm} ${demo.label.km}`, m]));
    const rows = (await call('GET', `/examinations/${october.id}/subjects`)).filter((r) => r.gradeId === g3.id);
    verify(`the October examination has the ${demo.mains.length} demo main subjects for grade 3, each the sum of its sub-subjects with the marks of the file`, rows.length === demo.mains.length
      && rows.every((r) => { const m = byName.get(r.subjectName); return !!m && r.scoreSource === 'SUB_SUBJECTS' && r.maxScore === m.mainMax && r.subSubjects.map((x) => x.maxScore).join() === m.subs.map((x) => x.max).join(); }));
    const level3 = classes.find((c) => c.level === demo.gradeLevel);
    const results = await call('GET', `/examinations/${october.id}/results?classId=${level3.id}`);
    const totalMax = demo.mains.reduce((t, m) => t + m.mainMax, 0);
    verify(`grade 3 results count the ${demo.mains.length} main subjects once (out of ${totalMax}); every pupil is complete and within the maximum`, results.subjects.length === demo.mains.length
      && results.students.length === level3.size && results.students.every((x) => x.complete && x.totalMax === totalMax && x.total >= 0 && x.total <= totalMax), `${results.students.length} pupils, totals ${results.students.slice(0, 3).map((x) => x.total).join(', ')} ...`);
  }
  if (verdicts.some((ok) => !ok)) throw new Error('the Grade 3 demo configuration did not check out');

  // ---- done: a clean close, then the sign-in details --------------------------------------------------------------------------------
  await call('POST', '/internal/shutdown');
  await new Promise((resolve) => { child.once('exit', resolve); setTimeout(resolve, 120_000); });
  writeFileSync(path.join(data, 'SAMPLE-LOGIN.txt'), [
    'SAMPLE DATA ONLY. Everything in this folder is invented. Delete this folder whenever you like; it never touches your real data.',
    '',
    `Username: ${USERNAME}`,
    `Password: ${PASSWORD}`,
    `Recovery key (a sample key for a sample school): ${recoveryKey ?? '(not returned; the key is already confirmed and not needed to sign in)'}`,
    '',
    'Open it with:  node scripts/start-sample.mjs',
    'Rebuild it from scratch with:  node scripts/seed-sample-data.mjs --fresh',
    '',
    'Notes: the sessions "ព្រឹក" (07:00-11:00) and "រសៀល" (13:00-17:00) are examples only and are left unconfirmed.',
    'Grades 1-3 take attendance in two sessions (so there are partial days); grades 4-6 use the whole day.',
    'Today has no attendance on purpose, so you can take it yourself. Fees are switched on in riel and dollars for trying them out.',
    'Grade 3 uses a DEMO subject configuration (main subjects with sub-subjects and sample marks, every name labelled "(គំរូ)"). It is NOT the school curriculum: it comes from scripts/sample-data/grade3-demo-subjects.json and exists only in this fictional school.',
  ].join('\r\n'));
  console.log(`\nDone. Sample school in ${data}\nSign in as ${USERNAME} / ${PASSWORD}   (details: ${path.join(data, 'SAMPLE-LOGIN.txt')})\nOpen it with: node scripts/start-sample.mjs`);
} catch (error) {
  console.error('\nFAILED:', error.message);
  child.kill();
  process.exitCode = 1;
}
