// A READ-ONLY check that the final installer can be built the moment the owner approves it, and a fingerprint of the sources so that what changed in between can be shown.
// It builds nothing, installs nothing and writes nothing except, with --snapshot, docs/RELEASE-SNAPSHOT.json.
//   node scripts/release-preflight.mjs              the checks below (exit 1 if one fails; a "!" is a warning, not a failure)
//   node scripts/release-preflight.mjs --snapshot   records the SHA-256 of every source file that goes into the build (docs/RELEASE-SNAPSHOT.json)
//   node scripts/release-preflight.mjs --compare    lists what was added, changed or removed since the snapshot, and says whether ONLY the Khmer wording files changed
// The runbook is docs/RELEASE-BUILD-RUNBOOK.md.
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { createReadStream, existsSync, readdirSync, readFileSync, statfsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { diffManifests, onlyKhmerWording } from './lib/khmerReview.mjs';
import { javaExe } from './lib/jdk.mjs';
import { check as checkRelease } from './lib/version.mjs';

const root = path.resolve(import.meta.dirname, '..');
const SNAPSHOT = path.join(root, 'docs', 'RELEASE-SNAPSHOT.json');

/** What goes into the build. Everything else (node_modules, build output, tests' output, the sample school, the docs) is not a source of the installer. */
const SOURCE_PATHS = ['backend/src', 'backend/pom.xml', 'frontend/app', 'frontend/i18n', 'frontend/nuxt.config.ts', 'frontend/package.json', 'desktop/src', 'desktop/scripts', 'desktop/build', 'desktop/package.json', 'scripts', 'release', 'package.json', 'package-lock.json'];
const SKIP_DIRS = new Set(['node_modules', 'target', '.output', '.nuxt', 'dist', 'stage', 'out', 'sample-data-safety-copy']);

/** The only installer on disk before the final build (2026-11-05, before the weekly timetable): stale, never replaced by this script. Replace these three values after the final build. */
const STALE_INSTALLER = { size: 237_432_560, sha256: '6060961b6472b15226375083e8182e93873b41fd2e459efe95f0c2b480bc7a5b', file: 'desktop/release/KPSMS-Setup-1.0.0.exe' };
const LOGO_SHA256 = '25fd506a2e28a2f5ec0f546b62a279cad129f447851235edc176ade0faaa60eb';

const sha256File = (file) => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  createReadStream(file).on('data', (d) => hash.update(d)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
});

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) yield* walk(full); } else yield full;
  }
}

async function manifest() {
  const files = {};
  for (const rel of SOURCE_PATHS) {
    const full = path.join(root, rel);
    if (!existsSync(full)) continue;
    const list = statSync(full).isDirectory() ? [...walk(full)] : [full];
    for (const file of list) files[path.relative(root, file).replaceAll('\\', '/')] = await sha256File(file);
  }
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
}

if (process.argv.includes('--snapshot')) {
  const files = await manifest();
  writeFileSync(SNAPSHOT, `${JSON.stringify({ note: 'SHA-256 of every source file that goes into the build, written by scripts/release-preflight.mjs --snapshot. Compare with --compare.', takenAt: new Date().toISOString(), count: Object.keys(files).length, files }, null, 2)}\n`);
  console.log(`${Object.keys(files).length} source files fingerprinted in ${path.relative(root, SNAPSHOT)}`);
  process.exit(0);
}

if (process.argv.includes('--compare')) {
  if (!existsSync(SNAPSHOT)) { console.error('There is no snapshot: run --snapshot first.'); process.exit(1); }
  const before = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  const diff = diffManifests(before.files, await manifest());
  const total = diff.added.length + diff.changed.length + diff.removed.length;
  console.log(`Snapshot of ${before.takenAt} (${before.count} files). Since then: ${diff.changed.length} changed, ${diff.added.length} added, ${diff.removed.length} removed.`);
  for (const [label, list] of [['changed', diff.changed], ['added', diff.added], ['removed', diff.removed]]) list.forEach((p) => console.log(`  ${label}: ${p}`));
  if (total === 0) console.log('The sources are exactly what they were when the snapshot was taken.');
  else if (onlyKhmerWording(diff)) console.log('ONLY the Khmer wording files differ (frontend/i18n/locales/km.json, frontend/i18n/REVIEW.md): no other source changed.');
  else console.log('OTHER sources differ as well: the owner must be told before the build.');
  process.exit(0);
}

// ---- the checks ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
let failures = 0;
let warnings = 0;
const line = (mark, text) => console.log(`${mark}  ${text}`);
const pass = (text) => line('PASS', text);
const fail = (text) => { failures++; line('FAIL', text); };
const warn = (text) => { warnings++; line('WARN', text); };
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// Node
const [major, minor] = process.versions.node.split('.').map(Number);
(major >= 25 || (major === 24 && minor >= 15) || (major === 22 && minor >= 22)) ? pass(`Node ${process.versions.node}`) : fail(`Node ${process.versions.node} is older than the package.json engines allow`);

// the release metadata (version, identity, the readiness list): the same check the build runs first
const problems = checkRelease(root);
problems.length === 0 ? pass('release metadata (version, identity, readiness list) is consistent') : problems.forEach((p) => fail(`release metadata: ${p}`));
const release = JSON.parse(readFileSync(path.join(root, 'release', 'release.json'), 'utf8'));
pass(`it would build ${release.shortName} ${release.version} (${release.channel}) -> desktop/release/${release.shortName}-Setup-${release.version}.exe`);

// the JDK and jlink (the minimal JRE is made with them), Maven
try {
  const java = javaExe();
  const r = spawnSync(java, ['-version'], { encoding: 'utf8' });
  const m = /version "(\d+)/.exec(`${r.stderr}${r.stdout}`);
  m && Number(m[1]) === 21 ? pass(`JDK 21 at ${path.dirname(path.dirname(java))}`) : fail(`the JDK found is not 21 (${String(r.stderr).split('\n')[0]})`);
} catch (e) {
  fail(`no JDK 21 found: ${e.message}`);
}
try {
  const home = path.dirname(path.dirname(javaExe()));
  existsSync(path.join(home, 'bin', 'jlink.exe')) && existsSync(path.join(home, 'jmods')) ? pass('jlink and jmods are there (the minimal JRE can be built)') : fail('jlink or jmods missing in the JDK');
} catch { /* reported above */ }
existsSync(path.join(root, 'backend', 'mvnw.cmd')) ? pass('Maven wrapper') : fail('backend/mvnw.cmd is missing');

// the tools the packager needs, offline (D21: they were downloaded once and are cached)
existsSync(path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')) ? pass('Electron runtime in node_modules') : fail('node_modules/electron/dist/electron.exe is missing (node node_modules/electron/install.js)');
existsSync(path.join(root, 'node_modules', 'electron-builder', 'package.json')) ? pass('electron-builder is installed') : fail('electron-builder is not installed');
const cache = path.join(process.env.LOCALAPPDATA ?? '', 'electron-builder', 'Cache');
for (const prefix of ['nsis-3', 'nsis-resources-3', '7zip']) {
  existsSync(cache) && readdirSync(cache).some((n) => n.startsWith(prefix)) ? pass(`packager tool cached: ${prefix}*`) : warn(`packager tool not cached: ${prefix}* (the build would download it once; D21 allowed one download)`);
}
const electronZip = [path.join(process.env.LOCALAPPDATA ?? '', 'electron', 'Cache'), path.join(cache, 'downloads')].some((dir) => existsSync(dir) && [...walk(dir)].some((f) => /electron-v.*win32-x64\.zip$/.test(f)));
electronZip ? pass('the Electron runtime zip is cached') : warn('no cached Electron runtime zip was found (the build would download it once)');

// the icon and the owner's logo
['icon.ico', 'icon.png', 'logo-source.png'].forEach((f) => existsSync(path.join(root, 'desktop', 'build', f)) ? pass(`desktop/build/${f}`) : fail(`desktop/build/${f} is missing`));
if (existsSync(path.join(root, 'desktop', 'build', 'logo-source.png'))) (await sha256File(path.join(root, 'desktop', 'build', 'logo-source.png'))) === LOGO_SHA256 ? pass('the logo is the owner\'s file, unchanged (SHA-256 matches)') : fail('the logo file differs from the one the owner supplied');

// room to build (a 237 MB installer, the unpacked app, the JRE, the Nuxt output)
const free = statfsSync(root);
const freeGb = (free.bavail * free.bsize) / 1024 ** 3;
freeGb >= 3 ? pass(`${freeGb.toFixed(1)} GB free on the drive of the project`) : fail(`only ${freeGb.toFixed(1)} GB free: the build needs about 3 GB`);

// nothing running that the build would fight with
try {
  const tasks = run('tasklist', ['/FI', 'IMAGENAME eq KPSMS.exe', '/NH']);
  /KPSMS\.exe/i.test(tasks) ? fail('KPSMS.exe is running: close it first (the build replaces desktop/release/win-unpacked)') : pass('no KPSMS.exe is running');
} catch { warn('could not list running programs'); }

// the stale installer: identity, and that it is untouched
const installer = path.join(root, STALE_INSTALLER.file);
if (existsSync(installer)) {
  const stat = statSync(installer);
  const sha = await sha256File(installer);
  if (stat.size === STALE_INSTALLER.size && sha === STALE_INSTALLER.sha256) pass(`${STALE_INSTALLER.file} is untouched and STALE (${stat.size} bytes, ${stat.mtime.toISOString()}, SHA-256 ${sha.slice(0, 8)}…${sha.slice(-4)}): it was built before the weekly timetable (schema 9) and is not the release candidate`);
  else warn(`${STALE_INSTALLER.file} is not the stale installer of 2026-11-05 any more (${stat.size} bytes, SHA-256 ${sha.slice(0, 8)}…): if this is the FINAL build, record its size and SHA-256 and update STALE_INSTALLER in this script`);
} else warn(`${STALE_INSTALLER.file} does not exist`);

// the Khmer review gate: the state of the sources against the snapshot, if there is one
if (existsSync(SNAPSHOT)) {
  const diff = diffManifests(JSON.parse(readFileSync(SNAPSHOT, 'utf8')).files, await manifest());
  const total = diff.added.length + diff.changed.length + diff.removed.length;
  total === 0 ? pass('the sources are exactly what the snapshot recorded') : onlyKhmerWording(diff) ? pass(`only the Khmer wording files differ from the snapshot (${total} file(s)): run --compare to list them`) : warn(`${total} source file(s) differ from the snapshot and not only the Khmer wording: run --compare`);
} else warn('there is no source snapshot (node scripts/release-preflight.mjs --snapshot)');

console.log(`\n${failures === 0 ? 'READY TO BUILD' : `${failures} PROBLEM(S): NOT READY`}${warnings ? `, ${warnings} warning(s)` : ''}. This script built nothing and changed nothing.`);
process.exit(failures === 0 ? 0 : 1);
