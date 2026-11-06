// The verification chain of a release round (every suite, one after the other, each in its own log), as DATA, plus the small pure helpers around it.
// It is the chain that was run by hand (a shell script kept outside the repository) for every round of 2026-11-05 and 2026-11-06, in the same order with the same commands:
// version check, backend tests (clean), jar + extract + UI + desktop build, type check, frontend tests, desktop unit tests, every real-shell suite, the layout suite on a scratch copy
// of the fictional sample school, the unpacked-build suites, the backup-flow test, the page count of the one-page handouts, and the stale installer's size, time and SHA-256 before and
// after. Added on 2026-11-06 (and marked so below): the NSIS cleanup self-test. Used by scripts/verify-all.mjs; guarded by desktop/test/verifyScripts.test.mjs.
// This file runs nothing. NOTHING in the chain installs, uninstalls or builds an installer: the only build it can start is the UNPACKED app (build-all.mjs --dir --skip-tests), and only
// when asked for with --unpacked-build.
import path from 'node:path';

/** The real-shell suites that run before the layout suite, in the order they were always run. */
export const E2E_SUITES = ['shell', 'app', 'changes', 'honor', 'ranking', 'subjects', 'lists', 'homework', 'backup', 'timetable', 'dashboard'];

/** Files the chain may delete: only these (the Eclipse-compiler stubs of CLAUDE.md "Tool quirks": a clean backend build starts from nothing in these two folders). */
export const CLEANABLE = ['backend/target/classes', 'backend/target/test-classes'];

const node = (...args) => ({ run: 'node', args });
const npm = (...args) => ({ run: 'npm', args });

/**
 * The steps, in order. A step has: id (what --only / --skip name), title, and either a command ({ run: 'node' | 'npm', args }) or a kind the runner knows
 * ('installer-before', 'installer-after', 'layout'). group 'rebuild' = rebuilds the outputs the real-shell suites run on (skipped by --no-rebuild: use it after the final build,
 * so the suites run on exactly what the build made); optIn = only with --unpacked-build; summary = which lines of the log are printed; clean = folders emptied first.
 */
export function chainSteps() {
  return [
    { id: 'installer-before', title: 'the stale installer BEFORE (size, time, SHA-256: read-only)', kind: 'installer-before' },
    { id: 'version', title: 'version check', ...node('scripts/version.mjs', 'check'), summary: 'last' },
    { id: 'backend-tests', title: 'backend tests (clean build)', ...node('scripts/run-mvn.mjs', 'test'), clean: CLEANABLE, summary: /Tests run:.*Skipped: \d+$|BUILD/, summaryLast: 2 },
    { id: 'jar', title: 'backend jar', group: 'rebuild', ...node('scripts/run-mvn.mjs', 'package', '-DskipTests') },
    { id: 'extract', title: 'extract the backend (fast-start layout)', group: 'rebuild', ...node('scripts/extract-backend.mjs') },
    { id: 'generate', title: 'frontend generate (the UI the shell loads)', group: 'rebuild', ...npm('run', 'generate', '-w', 'frontend') },
    { id: 'desktop-build', title: 'desktop build (the Electron main process)', group: 'rebuild', ...npm('run', 'build', '-w', 'desktop') },
    { id: 'typecheck', title: 'frontend type check', ...npm('run', 'typecheck', '-w', 'frontend') },
    { id: 'vitest', title: 'frontend unit tests', ...npm('run', 'test', '-w', 'frontend'), summary: /Test Files|Tests / },
    { id: 'desktop-unit', title: 'desktop unit tests', ...npm('run', 'test:desktop'), summary: /^ℹ (tests|pass|fail)/ },
    { id: 'nsis-cleanup', title: 'NSIS cleanup self-test (added 2026-11-06; a tiny test program, never the product installer)', ...npm('run', 'test:nsis-cleanup'), summary: /ALL CHECKS|CHECK\(S\)|^FAIL/ },
    ...E2E_SUITES.map((s) => ({ id: `e2e-${s}`, title: `e2e-${s}`, ...node(`desktop/test/e2e-${s}.mjs`), suite: true })),
    { id: 'layout', title: 'layout (a fresh copy of the fictional sample school)', kind: 'layout' },
    { id: 'unpacked-build', title: 'unpacked build (no installer): jar, extract, JRE, UI, unpacked app', optIn: true, ...node('scripts/build-all.mjs', '--dir', '--skip-tests'), summary: 'last2' },
    { id: 'e2e-packaged', title: 'e2e-packaged (the unpacked program)', ...node('desktop/test/e2e-packaged.mjs'), suite: true },
    { id: 'e2e-killed', title: 'e2e-killed (the unpacked program, ended at once)', ...node('desktop/test/e2e-killed.mjs'), suite: true },
    { id: 'backup-flow', title: 'test-backup-flow', ...node('scripts/test-backup-flow.mjs'), summary: 'last2' },
    { id: 'pages', title: 'the one-page handouts (the program\'s own print engine)', ...node('scripts/count-pages.mjs'), summary: /PAGES=|ALL PAGES|NOT AS EXPECTED/ },
    { id: 'installer-after', title: 'the stale installer AFTER (must be identical to BEFORE)', kind: 'installer-after' },
  ];
}

/** Reads the command line. Returns { help, list, only, skip, noRebuild, unpackedBuild, out, timeoutMin, errors }. */
export function parseArgs(argv, knownIds) {
  const opts = { help: false, list: false, only: null, skip: [], noRebuild: false, unpackedBuild: false, out: null, timeoutMin: 45, errors: [] };
  const ids = (text) => String(text ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--list') opts.list = true;
    else if (a === '--no-rebuild') opts.noRebuild = true;
    else if (a === '--unpacked-build') opts.unpackedBuild = true;
    else if (a === '--only') opts.only = ids(argv[++i]);
    else if (a === '--skip') opts.skip = ids(argv[++i]);
    else if (a === '--out') opts.out = argv[++i] ?? null;
    else if (a === '--timeout-min') opts.timeoutMin = Number(argv[++i]);
    else opts.errors.push(`unknown option: ${a}`);
  }
  for (const id of [...(opts.only ?? []), ...opts.skip]) if (!knownIds.includes(id)) opts.errors.push(`unknown step: ${id} (see --list)`);
  if (!Number.isFinite(opts.timeoutMin) || opts.timeoutMin <= 0) opts.errors.push('--timeout-min needs a number of minutes above 0');
  if (opts.out === null && argv.includes('--out')) opts.errors.push('--out needs a folder');
  return opts;
}

/** The steps that will run for these options, in chain order. */
export function selectSteps(steps, opts) {
  return steps.filter((s) => {
    if (s.optIn && !opts.unpackedBuild && !(opts.only ?? []).includes(s.id)) return false;
    if (s.group === 'rebuild' && opts.noRebuild && !(opts.only ?? []).includes(s.id)) return false;
    if (opts.only && !opts.only.includes(s.id)) return false;
    return !opts.skip.includes(s.id);
  });
}

/** Is `target` inside `parent` (and not the parent itself)? Used before the chain empties anything. */
export function isInside(parent, target) {
  const rel = path.relative(path.resolve(parent), path.resolve(target));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** The words of a step's command, for --list and for the guard test. */
export const commandText = (step) => (step.run ? `${step.run === 'node' ? 'node' : 'npm'} ${step.args.join(' ')}` : `(${step.kind})`);
