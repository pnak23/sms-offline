// Full release build in the right order. Usage: node scripts/build-all.mjs [--dir] [--skip-tests]
//   1 backend tests (unless --skip-tests) -> 2 backend jar -> 3 extract (fast-start layout) -> 4 minimal JRE (jlink)
//   5 Nuxt static build -> 6 Electron bundle + installer (or an unpacked app with --dir)
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dirOnly = process.argv.includes('--dir');
const skipTests = process.argv.includes('--skip-tests');
const node = process.execPath;
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const run = (title, cmd, args) => {
  console.log(`\n=== ${title} ===`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', env, shell: false });
  if (r.status !== 0) { console.error(`\nFAILED at: ${title}`); process.exit(r.status ?? 1); }
};
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const runNpm = (title, args) => {
  console.log(`\n=== ${title} ===`);
  const r = spawnSync(npm, args, { cwd: root, stdio: 'inherit', env, shell: true });
  if (r.status !== 0) { console.error(`\nFAILED at: ${title}`); process.exit(r.status ?? 1); }
};

run('0/6 release metadata (version, identity, acceptance list)', node, ['scripts/version.mjs', 'check']);
if (!skipTests) run('1/6 backend tests', node, ['scripts/run-mvn.mjs', 'test']);
run('2/6 backend jar', node, ['scripts/run-mvn.mjs', '-q', 'package', '-DskipTests']);
run('3/6 extract backend (fast-start layout)', node, ['scripts/extract-backend.mjs']);
run('4/6 minimal JRE (jlink)', node, ['scripts/build-jre.mjs']);
runNpm('5/6 UI static build', ['run', 'generate', '-w', 'frontend']);
run(`6/6 ${dirOnly ? 'unpacked app' : 'installer'}`, node, ['desktop/scripts/package.mjs', dirOnly ? 'dir' : 'nsis']);
console.log('\nBuild complete: desktop/release');
