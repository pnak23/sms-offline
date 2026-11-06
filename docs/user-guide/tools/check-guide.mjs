// Checks docs/user-guide/USER-GUIDE-KM.md against the program it describes. Nothing is changed; it prints what it found and exits 1 if something is wrong.
//   node docs/user-guide/tools/check-guide.mjs
// 1. every on-screen label quoted as «…» is a text of frontend/i18n/locales/km.json (exactly, or as the beginning / a clear part of a longer screen sentence);
// 2. every picture of the guide exists in SCREENSHOTS/, and every file there is used;
// 3. the 17 chapters that were asked for are all there, in order, under their exact titles;
// 4. the numbered steps of every operation count 1, 2, 3 ... without a gap, and every operation that has steps starts with «គោលបំណង»;
// 5. nothing in the guide suggests a cloud or an online service as a way to keep data (a few words are searched for and listed for a human to read).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const guideDir = path.resolve(import.meta.dirname, '..');
const root = path.resolve(guideDir, '..', '..');
const md = readFileSync(path.join(guideDir, 'USER-GUIDE-KM.md'), 'utf8').replace(/\r\n/g, '\n');
const km = JSON.parse(readFileSync(path.join(root, 'frontend', 'i18n', 'locales', 'km.json'), 'utf8'));
let problems = 0;
const bad = (text) => { problems++; console.log('PROBLEM  ' + text); };
const note = (text) => console.log('note     ' + text);

const texts = [];
(function walk(o) { for (const v of Object.values(o)) { if (typeof v === 'string') texts.push(v); else if (v && typeof v === 'object') walk(v); } })(km);
for (const f of ['splash.html', 'error.html']) {
  const file = path.join(root, 'desktop', 'src', 'static', f);
  if (existsSync(file)) texts.push(readFileSync(file, 'utf8').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' '));
}
const KHMER_DIGITS = '០១២៣៤៥៦៧៨៩';
const norm = (s) => s.normalize('NFC').replace(/​/g, '').replace(/\s+/g, ' ').replace(/[។៕]\s*$/, '').trim();
const normalized = texts.map(norm);

// ---- 1. the labels
const labels = [...new Set([...md.replace(/<!--[\s\S]*?-->/g, '').matchAll(/«([^»\n]+)»/g)].map((m) => m[1]))];
let exact = 0, part = 0;
const missing = [];
for (const label of labels) {
  const l = norm(label);
  if (l === '') continue;
  if (normalized.includes(l)) { exact++; continue; }
  const pieces = l.split(/\s*…\s*/).map((q) => q.trim()).filter(Boolean);
  const hasAll = (t) => { let at = 0; for (const q of pieces) { const i = t.indexOf(q, at); if (i < 0) return false; at = i + q.length; } return true; };
  if (pieces.length > 0 && normalized.some(hasAll)) { part++; continue; }
  // a label with a number or a name filled in: compare the fixed pieces
  const fixed = l.split(/\{[^}]*\}|…|\d+|[០-៩]+/).map((q) => q.trim()).filter((q) => q.length > 1);
  if (fixed.length > 0 && normalized.some((t) => fixed.every((q) => t.includes(q)))) { part++; continue; }
  missing.push(label);
}
note(`${labels.length} quoted labels: ${exact} are exactly a screen text, ${part} are part of a longer screen text`);
for (const m of missing) bad(`the label «${m}» is not a text of the program (km.json)`);

// ---- 2. the pictures
const shotsDir = path.join(guideDir, 'SCREENSHOTS');
const used = [...md.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
for (const u of used) if (!existsSync(path.join(guideDir, u))) bad(`the picture ${u} does not exist`);
const have = existsSync(shotsDir) ? readdirSync(shotsDir).filter((f) => f.endsWith('.png')) : [];
const unusedFiles = have.filter((f) => !used.includes(`SCREENSHOTS/${f}`));
note(`${used.length} pictures used, ${have.length} files in SCREENSHOTS`);
for (const f of unusedFiles) note(`unused picture file: ${f}`);
const dup = used.filter((u, i) => used.indexOf(u) !== i);
for (const d of new Set(dup)) note(`the picture ${d} is used more than once`);

// ---- 3. the chapters
const REQUIRED = [
  'សេចក្ដីណែនាំអំពីប្រព័ន្ធ KPSMS', 'ការចាប់ផ្ដើមប្រើប្រាស់ប្រព័ន្ធលើកដំបូង', 'ការកំណត់ព័ត៌មានសាលារៀន', 'ការគ្រប់គ្រងឆ្នាំសិក្សា', 'ការគ្រប់គ្រងថ្នាក់រៀន និងមុខវិជ្ជា', 'ការគ្រប់គ្រងគ្រូបង្រៀន',
  'ការគ្រប់គ្រងសិស្ស និងការចុះឈ្មោះចូលរៀន', 'ការកត់ត្រាវត្តមានសិស្ស', 'ការរៀបចំកាលវិភាគសិក្សា', 'ការគ្រប់គ្រងការប្រឡង និងការបញ្ចូលពិន្ទុ', 'ការបង្កើតបណ្ណរបាយការណ៍សិក្សា', 'ការគ្រប់គ្រងកិច្ចការផ្ទះ',
  'ការគ្រប់គ្រងថ្លៃសិក្សា ប្រសិនបើមុខងារនេះត្រូវបានបើក', 'ការមើល និងនាំចេញរបាយការណ៍', 'ការបម្រុងទុក និងស្ដារទិន្នន័យ', 'ការដោះស្រាយបញ្ហាដែលជួបប្រទះញឹកញាប់', 'ការណែនាំអំពីសុវត្ថិភាព និងការថែរក្សាទិន្នន័យ',
];
const chapters = [...md.matchAll(/^# ជំពូកទី([០-៩]+)៖ (.+)$/gm)].map((m) => ({ n: [...m[1]].reduce((a, d) => a * 10 + KHMER_DIGITS.indexOf(d), 0), title: m[2].trim() }));
REQUIRED.forEach((title, i) => {
  const c = chapters[i];
  if (!c) bad(`chapter ${i + 1} is missing ("${title}")`);
  else if (c.n !== i + 1) bad(`chapter ${i + 1} is numbered ${c.n}`);
  else if (c.title.normalize('NFC') !== title.normalize('NFC')) bad(`chapter ${i + 1} is titled "${c.title}", expected "${title}"`);
});
if (chapters.length !== REQUIRED.length) bad(`${chapters.length} chapters found, ${REQUIRED.length} expected`);
else note(`all ${REQUIRED.length} chapters are present, in order, under their exact titles`);

// ---- 4. the steps of an operation
const blocks = md.split(/\n(?=#{1,3} )/);
let operations = 0;
for (const b of blocks) {
  const heading = /^#{1,3} (.+)/.exec(b)?.[1] ?? '?';
  const steps = [...b.matchAll(/^\*\*ជំហានទី([០-៩]+)/gm)].map((m) => [...m[1]].reduce((a, d) => a * 10 + KHMER_DIGITS.indexOf(d), 0));
  if (steps.length === 0) continue;
  operations++;
  steps.forEach((n, i) => { if (n !== i + 1) bad(`"${heading}": the steps are numbered ${steps.join(', ')} (expected 1, 2, 3 ...)`); });
  if (!/\*\*គោលបំណង៖\*\*/.test(b)) bad(`"${heading}": has steps but no «គោលបំណង»`);
  if (!/\*\*លទ្ធផល៖\*\*/.test(b)) note(`"${heading}": has steps but no «លទ្ធផល»`);
}
note(`${operations} operations with numbered steps checked`);

// ---- 5. words a human should look at
for (const word of ['ពពក', 'អ៊ីនធឺណិត', 'cloud', 'Google', 'Dropbox', 'OneDrive']) {
  const hits = md.split('\n').filter((line) => line.includes(word));
  if (hits.length) note(`"${word}" appears in ${hits.length} line(s): they must only say that the program does NOT use it`);
}

console.log(problems ? `\n${problems} problem(s)` : '\nno problem found');
process.exit(problems ? 1 : 0);
