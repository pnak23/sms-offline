// Runs the verification chain of a release round: every suite, one after the other, each in its own log, with a summary at the end. It is the chain that was run by hand for every
// round of 2026-11-05 and 2026-11-06 (scripts/lib/verifyChain.mjs lists the steps and their order); a failing step does NOT stop the chain (every result is wanted), the exit code is 1 if any
// step failed. Nothing in it installs, uninstalls or builds an installer: the only build it can start is the UNPACKED app, and only with --unpacked-build.
//
//   node scripts/verify-all.mjs --list                          prints the steps, the exact command of each and what the options would skip; runs nothing
//   node scripts/verify-all.mjs                                 the whole chain WITHOUT the unpacked build (about 20 minutes: 28 steps): it rebuilds the outputs the real-shell suites run on
//   node scripts/verify-all.mjs --unpacked-build                the whole chain as it was run before 2026-11-06 (about 30 minutes), including node scripts/build-all.mjs --dir --skip-tests
//   node scripts/verify-all.mjs --no-rebuild [--skip backend-tests]
//                                                                AFTER THE FINAL BUILD: run the suites on exactly what node scripts/build-all.mjs made (no jar / UI / desktop rebuild)
//   node scripts/verify-all.mjs --only version,desktop-unit,pages   only these steps (ids from --list); --skip a,b leaves steps out
//   --out <folder>      where the logs go (default desktop/test/out/verify-<date>-<time>, which git ignores); a folder that already holds files is refused, nothing is deleted
//   --timeout-min <n>   the longest any one step may run (default 45)
//
// Prerequisites: Windows with Node 24; JDK 21 (scripts/run-mvn.mjs finds it: JAVA_HOME or %USERPROFILE%\.jdks\corretto-21.0.6) and the Maven wrapper; `npm install` done; the Electron
// runtime (node_modules/electron/dist/electron.exe); the built pieces the suites need (the default run builds them); no KPSMS.exe running; about 3 GB free; no network. Every real-shell suite
// uses its OWN temporary data folder (the layout suite a scratch copy of the fictional sample school, made and removed by this script): no school data is read, written or deleted, the real data
// folder (%LOCALAPPDATA%\RuralSchoolManagement) is never touched. The only things this script deletes are the two Eclipse-stub folders backend/target/classes and backend/target/test-classes
// (build output, git-ignored, rebuilt by the step) and the scratch folder it made for the layout suite. The stale installer is only READ (size, time, SHA-256), before and after.
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chainSteps, commandText, isInside, parseArgs, selectSteps } from './lib/verifyChain.mjs';

const root = path.resolve(import.meta.dirname, '..');
const release = JSON.parse(readFileSync(path.join(root, 'release', 'release.json'), 'utf8'));
const steps = chainSteps();
const opts = parseArgs(process.argv.slice(2), steps.map((s) => s.id));

if (opts.help || opts.errors.length > 0) {
  for (const e of opts.errors) console.error(e);
  console.log(readFileSync(import.meta.filename, 'utf8').split('\n').filter((l) => l.startsWith('//')).slice(0, 27).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(opts.errors.length > 0 ? 2 : 0);
}
const chosen = selectSteps(steps, opts);
if (opts.list) {
  console.log(`${chosen.length} of ${steps.length} steps would run${opts.noRebuild ? ' (--no-rebuild)' : ''}${opts.unpackedBuild ? ' (--unpacked-build)' : ''}:`);
  for (const s of steps) console.log(`${chosen.includes(s) ? '  run ' : '  skip'}  ${s.id.padEnd(17)} ${commandText(s)}${s.group === 'rebuild' ? '   [rebuild]' : ''}${s.optIn ? '   [opt-in: --unpacked-build]' : ''}${s.clean ? `   [first empties ${s.clean.join(' and ')}]` : ''}`);
  process.exit(0);
}

const now = new Date();
const two = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;   // this PC's local time
const out = path.resolve(root, opts.out ?? path.join('desktop', 'test', 'out', `verify-${stamp}`));
if (existsSync(out) && readdirSync(out).length > 0) { console.error(`${out} already holds files: nothing is deleted or overwritten; choose another --out`); process.exit(2); }
mkdirSync(out, { recursive: true });

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;   // with it set, Electron starts as plain Node and shows no window
const clock = () => new Date().toTimeString().slice(0, 8);
const installerPath = path.join(root, 'desktop', 'release', `${release.shortName}-Setup-${release.version}.exe`);
const sha256 = (file) => new Promise((resolve, reject) => { const h = createHash('sha256'); createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject); });
async function installerFacts() {
  if (!existsSync(installerPath)) return `${path.relative(root, installerPath)}: does not exist`;
  const s = statSync(installerPath);
  const folder = existsSync(path.dirname(installerPath)) ? readdirSync(path.dirname(installerPath)).sort().join(', ') : '(no folder)';
  return `${await sha256(installerPath)}  ${path.relative(root, installerPath)}\n${s.size} bytes, modified ${s.mtime.toISOString()}\ndesktop/release: ${folder}`;
}
const lines = (text) => String(text).split(/\r?\n/);
const passed = (text) => lines(text).filter((l) => l.startsWith('PASS')).length;

/** Runs one command, writes its whole output to <out>/<name>.txt and returns { code, text }. */
function runCommand(spec, name) {
  const r = spec.run === 'npm'
    ? spawnSync('npm.cmd', spec.args, { cwd: root, env, encoding: 'utf8', shell: true, maxBuffer: 512 * 1024 * 1024, timeout: opts.timeoutMin * 60_000 })
    : spawnSync(process.execPath, spec.args, { cwd: root, env, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, timeout: opts.timeoutMin * 60_000 });
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? `\n[runner] ${r.error.message}\n` : ''}`;
  writeFileSync(path.join(out, `${name}.txt`), text);
  return { code: r.status ?? (r.error ? 124 : 1), text };
}
function showSummary(step, text) {
  const all = lines(text).filter((l) => l !== '');
  let picked = [];
  if (step.suite) picked = all.filter((l) => /^FAIL|ALL CHECKS|CHECK\(S\)/.test(l)).map((l) => l.slice(0, 400));
  else if (step.summary === 'last') picked = all.slice(-1);
  else if (step.summary === 'last2') picked = all.slice(-2);
  else if (step.summary instanceof RegExp) { picked = all.filter((l) => step.summary.test(l)); if (step.summaryLast) picked = picked.slice(-step.summaryLast); }
  for (const l of picked) console.log(`    ${l}`);
}

const results = [];
console.log(`started ${new Date().toString()}\nlogs: ${out}\nsteps: ${chosen.map((s) => s.id).join(', ')}`);
let installerBefore = null;
for (const step of chosen) {
  console.log(`\n=== ${step.title}  (${clock()})`);
  let code = 0;
  let text = '';
  try {
    if (step.kind === 'installer-before') {
      installerBefore = await installerFacts();
      text = installerBefore;
      writeFileSync(path.join(out, 'installer-before.txt'), text);
      console.log(text.split('\n').map((l) => `    ${l}`).join('\n'));
    } else if (step.kind === 'installer-after') {
      text = await installerFacts();
      writeFileSync(path.join(out, 'installer-after.txt'), text);
      console.log(text.split('\n').map((l) => `    ${l}`).join('\n'));
      if (installerBefore === null) { console.log('    (no "before" was recorded in this run: nothing to compare)'); }
      else { code = installerBefore === text ? 0 : 1; console.log(`    identical to BEFORE: ${code === 0}`); }
    } else if (step.kind === 'layout') {
      const dir = path.join(tmpdir(), `kpsms-layout-${randomBytes(4).toString('hex')}`);   // a scratch copy of the fictional sample school, made here and removed below
      try {
        const seed = runCommand({ run: 'node', args: ['scripts/seed-sample-data.mjs', '--dir', dir] }, 'layout-seed');
        console.log(`    seed exit ${seed.code}`);
        const r = runCommand({ run: 'node', args: ['desktop/test/e2e-layout.mjs', dir] }, 'e2e-layout');
        code = seed.code !== 0 ? seed.code : r.code;
        text = r.text;
        console.log(`exit ${r.code}  passed lines: ${passed(r.text)}`);
        showSummary({ suite: true }, r.text);
      } finally {
        if (path.basename(dir).startsWith('kpsms-layout-') && isInside(tmpdir(), dir)) rmSync(dir, { recursive: true, force: true });   // only the scratch folder made above
      }
    } else {
      for (const rel of step.clean ?? []) {
        const target = path.join(root, rel);
        if (!isInside(path.join(root, 'backend', 'target'), target)) throw new Error(`refusing to empty ${rel}: it is not inside backend/target`);
        rmSync(target, { recursive: true, force: true });
      }
      const r = runCommand(step, step.id);
      code = r.code;
      text = r.text;
      console.log(`exit ${code}${step.suite ? `  passed lines: ${passed(text)}` : ''}`);
      showSummary(step, text);
    }
  } catch (e) {
    code = 1;
    console.log(`    [runner] ${e.message}`);
  }
  results.push({ id: step.id, code, passed: step.suite || step.kind === 'layout' ? passed(text) : null });
}

console.log('\n=== SUMMARY');
for (const r of results) console.log(`  ${r.code === 0 ? 'ok  ' : 'FAIL'}  ${r.id.padEnd(17)} exit ${r.code}${r.passed === null ? '' : `  passed lines: ${r.passed}`}`);
const failed = results.filter((r) => r.code !== 0);
console.log(`\nfinished ${new Date().toString()}\n${failed.length === 0 ? `ALL ${results.length} STEPS PASSED` : `${failed.length} STEP(S) FAILED: ${failed.map((r) => r.id).join(', ')}`}\nALL-DONE`);
process.exit(failed.length === 0 ? 0 : 1);
