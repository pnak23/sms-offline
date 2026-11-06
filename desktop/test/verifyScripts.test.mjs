// Guards the two scripts added on 2026-11-06 for the release verification: scripts/verify-all.mjs (the verification chain, data in scripts/lib/verifyChain.mjs) and
// scripts/count-pages.mjs (the page count of the one-page handouts). The owner's conditions: the existing verification procedures are PRESERVED (same steps, same order, same
// commands), nothing destructive is introduced, no school data is touched, and nothing installs, uninstalls or builds an installer.
// Run: node --test desktop/test/verifyScripts.test.mjs   (it starts only `node scripts/verify-all.mjs --list`, which runs nothing)
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CLEANABLE, E2E_SUITES, chainSteps, commandText, isInside, parseArgs, selectSteps } from '../../scripts/lib/verifyChain.mjs';

const repo = path.resolve(import.meta.dirname, '..', '..');
const steps = chainSteps();
const ids = steps.map((s) => s.id);
const source = (rel) => readFileSync(path.join(repo, rel), 'utf8');
/** The code of a file without its comment lines (a comment may SAY that the school data folder is never touched; the code must not name it). */
const code = (rel) => source(rel).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

// The order the chain was always run in (the hand-run script of every round of 2026-11-05 and 2026-11-06), with the one step added on 2026-11-06.
const ORIGINAL_ORDER = ['installer-before', 'version', 'backend-tests', 'jar', 'extract', 'generate', 'desktop-build', 'typecheck', 'vitest', 'desktop-unit', 'nsis-cleanup',
  'e2e-shell', 'e2e-app', 'e2e-changes', 'e2e-honor', 'e2e-ranking', 'e2e-subjects', 'e2e-lists', 'e2e-homework', 'e2e-backup', 'e2e-timetable', 'e2e-dashboard',
  'layout', 'unpacked-build', 'e2e-packaged', 'e2e-killed', 'backup-flow', 'pages', 'installer-after'];

test('the chain keeps the steps and the order it always had, and the step ids are unique', () => {
  assert.deepEqual(ids, ORIGINAL_ORDER);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(E2E_SUITES, ['shell', 'app', 'changes', 'honor', 'ranking', 'subjects', 'lists', 'homework', 'backup', 'timetable', 'dashboard']);
});

test('every step runs the same command as the hand-run chain did', () => {
  const cmd = Object.fromEntries(steps.filter((s) => s.run).map((s) => [s.id, commandText(s)]));
  assert.equal(cmd.version, 'node scripts/version.mjs check');
  assert.equal(cmd['backend-tests'], 'node scripts/run-mvn.mjs test');
  assert.equal(cmd.jar, 'node scripts/run-mvn.mjs package -DskipTests');
  assert.equal(cmd.extract, 'node scripts/extract-backend.mjs');
  assert.equal(cmd.generate, 'npm run generate -w frontend');
  assert.equal(cmd['desktop-build'], 'npm run build -w desktop');
  assert.equal(cmd.typecheck, 'npm run typecheck -w frontend');
  assert.equal(cmd.vitest, 'npm run test -w frontend');
  assert.equal(cmd['desktop-unit'], 'npm run test:desktop');
  for (const s of E2E_SUITES) assert.equal(cmd[`e2e-${s}`], `node desktop/test/e2e-${s}.mjs`);
  assert.equal(cmd['unpacked-build'], 'node scripts/build-all.mjs --dir --skip-tests');
  assert.equal(cmd['e2e-packaged'], 'node desktop/test/e2e-packaged.mjs');
  assert.equal(cmd['e2e-killed'], 'node desktop/test/e2e-killed.mjs');
  assert.equal(cmd['backup-flow'], 'node scripts/test-backup-flow.mjs');
  assert.equal(cmd.pages, 'node scripts/count-pages.mjs');
});

test('every script the chain runs exists, and the layout suite and the installer records have their kinds', () => {
  for (const s of steps.filter((x) => x.run === 'node')) assert.ok(existsSync(path.join(repo, s.args[0])), `${s.id}: ${s.args[0]} does not exist`);
  for (const s of steps.filter((x) => x.run === 'npm' && x.args[0] === 'run')) {
    const script = s.args[1];
    const where = s.args.includes('-w') ? path.join(repo, s.args[s.args.indexOf('-w') + 1], 'package.json') : path.join(repo, 'package.json');
    assert.ok(JSON.parse(readFileSync(where, 'utf8')).scripts?.[script], `${s.id}: npm script "${script}" is not in ${path.relative(repo, where)}`);
  }
  assert.deepEqual(steps.filter((s) => s.kind).map((s) => [s.id, s.kind]), [['installer-before', 'installer-before'], ['layout', 'layout'], ['installer-after', 'installer-after']]);
});

test('NOTHING in the chain installs, uninstalls or builds an installer; the only build is the opt-in UNPACKED one', () => {
  for (const s of steps.filter((x) => x.run)) {
    const text = commandText(s);
    assert.doesNotMatch(text, /test-installer|install|uninstall|package\.mjs|nsis(?!-cleanup)|electron-builder|setup\.exe/i, `${s.id}: ${text}`);
    if (/build-all/.test(text)) {
      assert.equal(s.id, 'unpacked-build');
      assert.equal(s.optIn, true);
      assert.ok(s.args.includes('--dir'), 'the only build-all step must be the unpacked build (--dir)');
    }
  }
  assert.equal(steps.filter((s) => s.optIn).length, 1);
});

test('nothing destructive is in a command, and the only folders the chain empties are the two Eclipse-stub folders inside backend/target', () => {
  for (const s of steps.filter((x) => x.run)) assert.doesNotMatch(commandText(s), /\b(rm|del|rmdir|rd|Remove-Item|taskkill|format|move|mv|reset|clean)\b/i, s.id);   // `mvn clean` is not used: the folders are listed below
  assert.deepEqual(CLEANABLE, ['backend/target/classes', 'backend/target/test-classes']);
  for (const rel of CLEANABLE) assert.ok(isInside(path.join(repo, 'backend', 'target'), path.join(repo, rel)));
  assert.deepEqual(steps.filter((s) => s.clean).map((s) => s.id), ['backend-tests']);
  assert.equal(isInside('C:/a/b', 'C:/a/b'), false);
  assert.equal(isInside('C:/a/b', 'C:/a/b/c'), true);
  assert.equal(isInside('C:/a/b', 'C:/a/other'), false);
  assert.equal(isInside('C:/a/b', 'C:/a/b/../x'), false);
});

test('the runner removes only what it made or what the chain may empty: two guarded deletions, no process killing, no school data folder', () => {
  const runner = source('scripts/verify-all.mjs');
  assert.equal((runner.match(/rmSync\(/g) ?? []).length, 2, 'exactly two deletions');
  assert.match(runner, /isInside\(path\.join\(root, 'backend', 'target'\), target\)/, 'the Eclipse-stub folders are checked to be inside backend/target first');
  assert.match(runner, /path\.basename\(dir\)\.startsWith\('kpsms-layout-'\) && isInside\(tmpdir\(\), dir\)/, 'the layout scratch folder is checked first');
  assert.doesNotMatch(code('scripts/verify-all.mjs'), /taskkill|RuralSchoolManagement|LOCALAPPDATA|Remove-Item|execSync\(|exec\(/);
  assert.match(runner, /already holds files: nothing is deleted or overwritten/);
});

test('the page counter writes only into a fresh temporary folder (or a --keep folder, never over an existing file) and removes only that folder', () => {
  const counter = source('scripts/count-pages.mjs');
  assert.equal((counter.match(/rmSync\(/g) ?? []).length, 1);
  assert.match(counter, /rmSync\(work, \{ recursive: true, force: true \}\)/);
  assert.match(counter, /mkdtempSync\(path\.join\(tmpdir\(\)/);
  assert.match(counter, /already exists and is not overwritten/);
  assert.doesNotMatch(code('scripts/count-pages.mjs'), /RuralSchoolManagement|LOCALAPPDATA|taskkill/);
  assert.match(source('scripts/lib/count-pages-electron.cjs'), /require\('electron'\)/);
});

test('the options: --only, --skip, --no-rebuild, --unpacked-build, unknown names refused', () => {
  const run = (...a) => selectSteps(steps, parseArgs(a, ids)).map((s) => s.id);
  assert.equal(run().includes('unpacked-build'), false, 'the unpacked build is opt-in');
  assert.equal(run('--unpacked-build').includes('unpacked-build'), true);
  assert.deepEqual(run('--no-rebuild').filter((i) => ['jar', 'extract', 'generate', 'desktop-build'].includes(i)), []);
  assert.equal(run('--no-rebuild').includes('e2e-packaged'), true);
  assert.deepEqual(run('--only', 'version,pages'), ['version', 'pages']);
  assert.equal(run('--skip', 'backend-tests,vitest').some((i) => ['backend-tests', 'vitest'].includes(i)), false);
  assert.equal(parseArgs(['--only', 'nope'], ids).errors.length, 1);
  assert.equal(parseArgs(['--frobnicate'], ids).errors.length, 1);
  assert.equal(parseArgs(['--timeout-min', '0'], ids).errors.length, 1);
  assert.equal(parseArgs(['--out'], ids).errors.length, 1);
});

test('`node scripts/verify-all.mjs --list` prints every step and its command and runs nothing; a wrong step name is refused with exit 2', () => {
  const list = spawnSync(process.execPath, [path.join(repo, 'scripts', 'verify-all.mjs'), '--list'], { cwd: repo, encoding: 'utf8', timeout: 60_000 });
  assert.equal(list.status, 0, list.stderr);
  for (const id of ids) assert.ok(list.stdout.includes(id), `--list must show ${id}`);
  assert.match(list.stdout, /node scripts\/run-mvn\.mjs test .*first empties backend\/target\/classes and backend\/target\/test-classes/);
  assert.match(list.stdout, /skip\s+unpacked-build .*opt-in: --unpacked-build/);
  const bad = spawnSync(process.execPath, [path.join(repo, 'scripts', 'verify-all.mjs'), '--only', 'nonsense'], { cwd: repo, encoding: 'utf8', timeout: 60_000 });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /unknown step: nonsense/);
});
