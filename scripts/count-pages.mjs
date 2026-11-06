// Counts the printed A4 pages of the school's one-page Khmer handouts with the program's own print engine (Electron's printToPDF, the one that prints its reports), because
// each of them must stay ONE page (docs/RELEASE-BUILD-RUNBOOK.md step 11; the hand-over guide is D20, the SmartScreen page is D11).
//   node scripts/count-pages.mjs                                  both pages: docs/HANDOVER-KM.html and docs/SMARTSCREEN-KM.html, each expected to print as 1 page
//   node scripts/count-pages.mjs <file.html> [<file.html> ...]    other files
//   options: --expect <n>   the page count each file must have (default 1)
//            --keep <folder>  keep the PDF and the picture of each page in this folder (created if missing; an existing file is never overwritten). Without it they are
//                             written to a fresh temporary folder that is removed at the end.
// Prerequisites: Windows, the Electron runtime in node_modules (node node_modules/electron/install.js if node_modules/electron/dist/electron.exe is missing); nothing else, no network.
// Exit code: 0 when every file has the expected number of pages, 1 otherwise (a file that cannot be printed counts as a failure).
// It reads the HTML files and writes only the PDFs and pictures described above. It changes nothing in the repository and touches no school data.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const valueOptions = new Set(['--expect', '--keep']);
const files = args.filter((a, i) => !a.startsWith('--') && !valueOptions.has(args[i - 1]));
const expect = Number(option('--expect') ?? 1);
const keep = option('--keep') ? path.resolve(option('--keep')) : null;
if (!Number.isInteger(expect) || expect < 1) { console.error('--expect needs a whole number of pages, 1 or more'); process.exit(2); }

const targets = (files.length > 0 ? files : ['docs/HANDOVER-KM.html', 'docs/SMARTSCREEN-KM.html']).map((f) => path.resolve(root, f));
const electron = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const helper = path.join(root, 'scripts', 'lib', 'count-pages-electron.cjs');
if (!existsSync(electron)) { console.error('node_modules/electron/dist/electron.exe is missing (run: node node_modules/electron/install.js)'); process.exit(2); }

const work = keep ?? mkdtempSync(path.join(tmpdir(), 'kpsms count pages '));
mkdirSync(work, { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;   // with it set, Electron starts as plain Node and shows no window
let failures = 0;
for (const html of targets) {
  const name = path.basename(html, path.extname(html));
  const pdf = path.join(work, `${name}.pdf`);
  const png = path.join(work, `${name}.png`);
  const shown = path.relative(root, html);
  if (!existsSync(html)) { failures++; console.log(`FAIL  ${shown}: the file does not exist`); continue; }
  if (existsSync(pdf) || existsSync(png)) { failures++; console.log(`FAIL  ${shown}: ${existsSync(pdf) ? pdf : png} already exists and is not overwritten (choose another --keep folder)`); continue; }
  const r = spawnSync(electron, [helper, html, pdf, png], { cwd: root, env, encoding: 'utf8', timeout: 90_000, windowsHide: true });
  const pages = Number(/PAGES=(\d+)/.exec(r.stdout ?? '')?.[1] ?? NaN);
  const ok = r.status === 0 && pages === expect;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  PAGES=${Number.isNaN(pages) ? '?' : pages}  ${shown}${ok ? '' : `  (expected ${expect}${r.status === 0 ? '' : `; the print engine exited ${r.status}: ${String(r.stderr ?? '').trim().split('\n')[0]}`})`}`);
}
if (keep) console.log(`kept: ${keep}`); else rmSync(work, { recursive: true, force: true });   // the temporary folder made above, nothing else
console.log(failures === 0 ? 'ALL PAGES AS EXPECTED' : `${failures} FILE(S) NOT AS EXPECTED`);
process.exit(failures === 0 ? 0 : 1);
