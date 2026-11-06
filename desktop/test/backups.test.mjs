// Unit tests for the main process's backup file handling (src/main/backups.ts), the settings update (config.ts) and desktop.log rotation (log.ts).
// Run: node --test desktop/test/backups.test.mjs   (bundles the TypeScript with esbuild on the fly; no Electron needed)
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
// the work folder has Khmer characters and a space, like a real Windows profile might
const work = mkdtempSync(path.join(tmpdir(), 'sms សាកល្បង '));
async function load(name) {
  const out = path.join(work, `${name}.cjs`);
  await build({ entryPoints: [path.join(root, `src/main/${name}.ts`)], outfile: out, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent', external: ['electron'] });
  return (await import(pathToFileURL(out).href)).default;
}
const B = await load('backups');
const C = await load('config');
const L = await load('log');
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const GB = 1024 ** 3;
const heap = (args) => Number(/-Xmx(\d+)m/.exec(args.join(' '))[1]);

/** A data folder with one manual and one automatic backup (the content is arbitrary bytes: only the file handling is tested here). */
function dataDir() {
  const d = mkdtempSync(path.join(work, 'data-'));
  mkdirSync(path.join(d, 'backups', 'auto'), { recursive: true });
  writeFileSync(path.join(d, 'backups', 'SchoolBackup_2026-10-01_08-00-00.zip'), Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.alloc(5000, 7)]));
  writeFileSync(path.join(d, 'backups', 'auto', 'SchoolBackup_2026-10-02_08-00-00.zip'), Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.alloc(3000, 9)]));
  return d;
}

test('only a real backup id finds a file, in either folder, and no id can reach anything else', () => {
  const d = dataDir();
  assert.equal(B.findBackupFile(d, 'SchoolBackup_2026-10-01_08-00-00'), path.join(d, 'backups', 'SchoolBackup_2026-10-01_08-00-00.zip'));
  assert.equal(B.findBackupFile(d, 'SchoolBackup_2026-10-02_08-00-00'), path.join(d, 'backups', 'auto', 'SchoolBackup_2026-10-02_08-00-00.zip'));
  assert.equal(B.findBackupFile(d, 'SchoolBackup_2000-01-01_00-00-00'), null);
  for (const evil of ['../database/school', '..\\x', 'SchoolBackup_2026-10-01_08-00-00.zip', 'SchoolBackup_2026-10-01_08-00-00/../x', 'config', '', 'SchoolBackup_x']) {
    assert.equal(B.findBackupFile(d, evil), null, JSON.stringify(evil));
  }
});

test('a copy to another folder is proved by its hash, in a Khmer-named folder, and nothing is overwritten', async () => {
  const d = dataDir();
  const source = path.join(d, 'backups', 'SchoolBackup_2026-10-01_08-00-00.zip');
  const usb = path.join(work, 'USB ថតបម្រុងទុក');
  mkdirSync(usb);
  const first = await B.copyVerified(source, usb);
  assert.equal(first.copied, true);
  assert.equal(first.sha256, sha(source));
  assert.equal(path.basename(first.target), 'SchoolBackup_2026-10-01_08-00-00.zip');
  assert.equal(sha(first.target), sha(source), 'the copy is byte for byte the original');

  const again = await B.copyVerified(source, usb);
  assert.equal(again.copied, true);
  assert.equal(again.target, first.target, 'the same content already there counts as the copy: nothing is duplicated');
  assert.deepEqual(readdirSync(usb), ['SchoolBackup_2026-10-01_08-00-00.zip']);

  writeFileSync(first.target, 'a different file that happens to have the same name');
  const clash = await B.copyVerified(source, usb);
  assert.equal(clash.copied, true);
  assert.equal(path.basename(clash.target), 'SchoolBackup_2026-10-01_08-00-00 (2).zip', 'a different file is never overwritten');
  assert.equal(readFileSync(first.target, 'utf8'), 'a different file that happens to have the same name');
  assert.equal(sha(clash.target), sha(source));

  const gone = await B.copyVerified(path.join(d, 'backups', 'missing.zip'), usb);
  assert.deepEqual(gone, { copied: false, reason: 'COPY_FAILED' });
  const nowhere = await B.copyVerified(source, path.join(work, 'no such folder'));
  assert.equal(nowhere.copied, false);
});

test('inside the program\'s own data is not a copy elsewhere, and the drive is compared case-insensitively', () => {
  assert.equal(B.isSameOrInside('C:\\Data\\App', 'C:\\Data\\App'), true);
  assert.equal(B.isSameOrInside('C:\\Data\\App', 'C:\\Data\\App\\backups\\auto'), true);
  assert.equal(B.isSameOrInside('C:\\Data\\App', 'C:\\Data\\App2'), false);
  assert.equal(B.isSameOrInside('C:\\Data\\App', 'C:\\Data'), false);
  assert.equal(B.isSameOrInside('C:\\Data\\App', 'D:\\Data\\App'), false);
  assert.equal(B.sameDrive('C:\\Users\\x\\AppData', 'c:\\Backups'), true);
  assert.equal(B.sameDrive('C:\\Users\\x\\AppData', 'E:\\'), false);
});

test('a file chosen for restoring must look like a zip, and is copied under a name the backend accepts', async () => {
  const d = dataDir();
  const text = path.join(work, 'notes.zip');
  writeFileSync(text, 'this is not a zip');
  assert.deepEqual(await B.stageIncoming(d, text), { picked: false, reason: 'NOT_ZIP' });
  const empty = path.join(work, 'empty.zip');
  writeFileSync(empty, '');
  assert.deepEqual(await B.stageIncoming(d, empty), { picked: false, reason: 'NOT_ZIP' });
  assert.equal(existsSync(path.join(d, 'backups', 'incoming')) ? readdirSync(path.join(d, 'backups', 'incoming')).length : 0, 0, 'a refused file is not copied');

  const real = path.join(d, 'backups', 'SchoolBackup_2026-10-01_08-00-00.zip');
  const staged = await B.stageIncoming(d, real, 1735000000000);
  assert.deepEqual(staged, { picked: true, fileName: 'incoming-1735000000000.zip' });
  assert.match(staged.fileName, /^incoming-[0-9]{1,20}\.zip$/, 'the backend only accepts this shape');
  assert.equal(sha(path.join(d, 'backups', 'incoming', staged.fileName)), sha(real));
});

test('desktop.log rolls like backend.log: the live file becomes .1, the oldest of five is dropped', () => {
  const dir = mkdtempSync(path.join(work, 'log-'));
  const file = path.join(dir, 'desktop.log');
  writeFileSync(file, 'live');
  for (let i = 1; i <= 5; i++) writeFileSync(`${file}.${i}`, `old${i}`);
  L.rotate(file);
  assert.equal(existsSync(file), false, 'the live file moved');
  assert.deepEqual([1, 2, 3, 4, 5].map((i) => readFileSync(`${file}.${i}`, 'utf8')), ['live', 'old1', 'old2', 'old3', 'old4']);
  assert.equal(existsSync(`${file}.6`), false);
  // gaps do not break it
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir);
  writeFileSync(file, 'live');
  writeFileSync(`${file}.3`, 'old3');
  L.rotate(file);
  assert.equal(readFileSync(`${file}.1`, 'utf8'), 'live');
  assert.equal(readFileSync(`${file}.4`, 'utf8'), 'old3');
});

// ---- performance settings -----------------------------------------------------------------------------------------

test('Standard follows the installed RAM; Low-memory never asks for more than its ceiling; a heap typed into app.json wins', () => {
  const cfg = (o) => C.loadConfig((() => { const d = mkdtempSync(path.join(work, 'cfg-')); writeFileSync(path.join(d, 'app.json'), JSON.stringify(o)); return d; })());
  assert.equal(heap(C.jvmArgs(cfg({}), 8 * GB)), 384);
  assert.equal(heap(C.jvmArgs(cfg({ performance: { preset: 'standard' } }), 16 * GB)), 512);
  assert.equal(heap(C.jvmArgs(cfg({ performance: { preset: 'low-memory' } }), 8 * GB)), C.LOW_MEMORY_HEAP_MB);
  assert.equal(heap(C.jvmArgs(cfg({ performance: { preset: 'low-memory' } }), 16 * GB)), C.LOW_MEMORY_HEAP_MB);
  assert.equal(heap(C.jvmArgs(cfg({ performance: { preset: 'low-memory' } }), 4 * GB)), C.LOW_MEMORY_HEAP_MB, 'a small PC gets the ceiling too, never more than Standard would');
  assert.equal(heap(C.jvmArgs(cfg({ performance: { preset: 'low-memory' }, backend: { jvm: { maxHeapMb: 700 } } }), 8 * GB)), 700);
  assert.equal(heap(C.jvmArgs(cfg({ performance: { preset: 'turbo' } }), 8 * GB)), 384, 'an unknown preset is a broken file: safe defaults');
});

test('the page can change the preset and the graphics switch and nothing else, and the rest of app.json survives', () => {
  const dir = mkdtempSync(path.join(work, 'upd-'));
  writeFileSync(path.join(dir, 'app.json'), JSON.stringify({ backend: { port: 5555, jvm: { maxHeapMb: 640, extraArgs: ['-XX:TieredStopAtLevel=1'] } }, desktop: { disableGpu: false }, custom: 'kept' }));
  const view = C.updateConfig(dir, { preset: 'low-memory' });
  assert.deepEqual(view, { preset: 'low-memory', disableGpu: false });
  const afterGpu = C.updateConfig(dir, { disableGpu: true });
  assert.deepEqual(afterGpu, { preset: 'low-memory', disableGpu: true });
  const saved = JSON.parse(readFileSync(path.join(dir, 'app.json'), 'utf8'));
  assert.equal(saved.backend.port, 5555);
  assert.equal(saved.backend.jvm.maxHeapMb, 640);
  assert.deepEqual(saved.backend.jvm.extraArgs, ['-XX:TieredStopAtLevel=1']);
  assert.equal(saved.custom, 'kept');
  assert.equal(existsSync(path.join(dir, 'app.json.tmp')), false, 'written to a temp file and renamed');

  const fresh = mkdtempSync(path.join(work, 'upd2-'));   // no app.json at all
  assert.deepEqual(C.updateConfig(fresh, { preset: 'low-memory' }), { preset: 'low-memory', disableGpu: false });
  const broken = mkdtempSync(path.join(work, 'upd3-'));
  writeFileSync(path.join(broken, 'app.json'), '{ not json');
  assert.deepEqual(C.updateConfig(broken, { disableGpu: true }), { preset: 'standard', disableGpu: true });
});

test('the page cannot reach the JVM options, the port or any other key: the patch schema is strict', () => {
  const ok = (v) => C.ConfigPatchSchema.safeParse(v).success;
  assert.equal(ok({ preset: 'low-memory' }), true);
  assert.equal(ok({ disableGpu: true }), true);
  assert.equal(ok({}), true);
  for (const bad of [{ preset: 'turbo' }, { disableGpu: 'yes' }, { backend: { port: 80 } }, { extraArgs: ['-javaagent:x.jar'] }, { maxHeapMb: 4000 }, { preset: 'standard', port: 1 }, null, 'low-memory', []]) {
    assert.equal(ok(bad), false, JSON.stringify(bad));
  }
});

test.after(() => rmSync(work, { recursive: true, force: true }));
