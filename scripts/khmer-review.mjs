// The Khmer wording review, made easy to receive and easy to show (2026-11-06; the owner holds the final installer until sections 19 and 20 of frontend/i18n/REVIEW.md have been reviewed).
//   node scripts/khmer-review.mjs export [--section 19,20]
//       writes docs/KHMER-REVIEW-SHEET-19-20.md: every text of the section(s) IN FULL, for the native speaker to read and correct. Changes nothing else.
//       (19 = the weekly timetable, 20 = the premium dashboard; the default is both, because one review covers both.)
//   node scripts/khmer-review.mjs apply <corrections.json> [--section 19,20] [--any-key] [--reviewer "<name>"] [--write]
//       <corrections.json> is { "key": "corrected text", ... }. WITHOUT --write it is a dry run: it prints exactly what would change (before / after) and every problem, and writes nothing.
//       With --write (and no problem at all: it is all or nothing) it changes frontend/i18n/locales/km.json, keeping its layout and line endings byte for byte except the corrected
//       texts, and writes docs/KHMER-REVIEW-OUTCOME-19-20.md (the before / after report to show the owner).
//   A correction may not change the words in braces ({n}, {day}...), may not add | @ < or a line break, may not name a key that does not exist, and (unless --any-key) may not
//   touch a text outside the section.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { applyCorrections, flatten, outcomeMarkdown, sectionKeys, sectionLabel, sheetMarkdown } from './lib/khmerReview.mjs';

const root = path.resolve(import.meta.dirname, '..');
const kmFile = path.join(root, 'frontend', 'i18n', 'locales', 'km.json');
const args = process.argv.slice(2);
const command = args[0];
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const has = (name) => args.includes(name);
const sectionId = (option('--section') ?? '19,20').split(',').map((n) => Number(n.trim()));
/** Today's date on this PC's clock (not UTC: just after midnight in Cambodia UTC is still yesterday). */
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const raw = readFileSync(kmFile, 'utf8');
const crlf = raw.includes('\r\n');
const serialize = (object) => { const text = `${JSON.stringify(object, null, 2)}\n`; return crlf ? text.replace(/\n/g, '\r\n') : text; };
const km = JSON.parse(raw);
// the file is rewritten from the parsed object: refuse to touch it unless that reproduces it exactly (so nothing but a corrected text can ever change)
if (serialize(km) !== raw) { console.error('km.json would not be reproduced byte for byte by this tool: nothing was done.'); process.exit(2); }

if (command === 'export') {
  const out = path.join(root, 'docs', `KHMER-REVIEW-SHEET-${sectionLabel(sectionId)}.md`);
  writeFileSync(out, sheetMarkdown(km, sectionId));
  console.log(`${sectionKeys(km, sectionId).length} texts written to ${path.relative(root, out)}`);
} else if (command === 'apply') {
  const file = args[1] && !args[1].startsWith('--') ? path.resolve(args[1]) : null;
  if (!file || !existsSync(file)) { console.error('Usage: node scripts/khmer-review.mjs apply <corrections.json> [--section 19,20] [--any-key] [--reviewer "<name>"] [--write]'); process.exit(1); }
  const corrections = JSON.parse(readFileSync(file, 'utf8'));
  const result = applyCorrections(km, corrections, { sectionId, anyKey: has('--any-key') });
  if (result.problems.length > 0) {
    console.log(`NOTHING CAN BE APPLIED: ${result.problems.length} problem(s)`);
    result.problems.forEach((p) => console.log(`  - ${p}`));
    process.exit(1);
  }
  console.log(`${result.changes.length} text(s) would change, ${result.unchanged.length} correction(s) were identical to the current text.`);
  for (const c of result.changes) console.log(`\n  ${c.key}\n    before: ${c.before}\n    after:  ${c.after}`);
  if (!has('--write')) { console.log('\nDry run: nothing was written. Add --write to apply.'); process.exit(0); }
  writeFileSync(kmFile, serialize(result.km));
  const total = sectionKeys(result.km, sectionId).length;
  const report = path.join(root, 'docs', `KHMER-REVIEW-OUTCOME-${sectionLabel(sectionId)}.md`);
  writeFileSync(report, outcomeMarkdown({ sectionId, reviewer: option('--reviewer'), date: localDate(), changes: result.changes, unchanged: result.unchanged, total }));
  console.log(`\nWritten: ${path.relative(root, kmFile)} and ${path.relative(root, report)}. Now run: npm run typecheck -w frontend && npm run test -w frontend`);
  // a final read-back: the changed file must hold exactly the corrected texts
  const back = flatten(JSON.parse(readFileSync(kmFile, 'utf8')));
  const wrong = result.changes.filter((c) => back[c.key] !== c.after);
  if (wrong.length > 0) { console.error(`READ-BACK FAILED for ${wrong.map((c) => c.key).join(', ')}`); process.exit(3); }
} else {
  console.error('Usage:\n  node scripts/khmer-review.mjs export [--section 19,20]\n  node scripts/khmer-review.mjs apply <corrections.json> [--section 19,20] [--any-key] [--reviewer "<name>"] [--write]');
  process.exit(1);
}
