// Unit tests for src/main/config.ts: RAM-tiered JVM defaults, bounds, the allow-list, and fall-back on a broken app.json.
// Run: node --test desktop/test/config.test.mjs   (bundles the TypeScript with esbuild on the fly; no Electron needed)
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const work = mkdtempSync(path.join(tmpdir(), 'sms-cfg-test-'));
const out = path.join(work, 'config.cjs');
await build({ entryPoints: [path.join(root, 'src/main/config.ts')], outfile: out, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
const cfg = (await import(pathToFileURL(out).href)).default;
const fnOut = path.join(work, 'filename.cjs');
await build({ entryPoints: [path.join(root, 'src/main/filename.ts')], outfile: fnOut, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
const { safeFileName } = (await import(pathToFileURL(fnOut).href)).default;
const { defaultMaxHeapMb, loadConfig, jvmArgs } = cfg;
const GB = 1024 ** 3;
const heap = (args) => Number(/-Xmx(\d+)m/.exec(args.join(' '))[1]);
const parse = (obj) => { const d = mkdtempSync(path.join(work, 'c-')); writeFileSync(path.join(d, 'app.json'), typeof obj === 'string' ? obj : JSON.stringify(obj)); return loadConfig(d); };

test('default heap follows installed RAM (4 GB -> 256, 8 GB -> 384, 16 GB -> 512)', () => {
  assert.equal(defaultMaxHeapMb(4 * GB), 256);
  assert.equal(defaultMaxHeapMb(8 * GB), 384);
  assert.equal(defaultMaxHeapMb(16 * GB), 512);
});

test('overrides are clamped: at least 192 MB, at most min(2 GB, 50 % of RAM)', () => {
  assert.equal(heap(jvmArgs(parse({ backend: { jvm: { maxHeapMb: 64 } } }), 8 * GB)), 192);
  assert.equal(heap(jvmArgs(parse({ backend: { jvm: { maxHeapMb: 900 } } }), 8 * GB)), 900);
  assert.equal(heap(jvmArgs(parse({ backend: { jvm: { maxHeapMb: 99999 } } }), 8 * GB)), 2048);
  assert.equal(heap(jvmArgs(parse({ backend: { jvm: { maxHeapMb: 99999 } } }), 2 * GB)), 1024);   // 50 % of a 2 GB PC
});

test('mandatory flags are always present: serial GC, C1 only, exit on OOM, UTF-8 streams', () => {
  const a = jvmArgs(parse({}), 8 * GB).join(' ');
  for (const f of ['-XX:+UseSerialGC', '-XX:TieredStopAtLevel=1', '-XX:+ExitOnOutOfMemoryError', '-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Xms64m']) assert.match(a, new RegExp(f.replace(/[+.]/g, '\\$&')));
});

test('extraArgs: only allow-listed options pass; anything that could run code is dropped', () => {
  const a = jvmArgs(parse({ backend: { jvm: { extraArgs: [
    '-XX:MaxMetaspaceSize=200m', '-Dsms.startup-trace=true',                                                 // allowed
    '-javaagent:C:\\evil.jar', '-agentlib:jdwp=transport=dt_socket,server=y,address=5005', '-cp', 'evil.jar', '-jar', 'x.jar',
    '--add-opens=java.base/java.lang=ALL-UNNAMED', '-XX:OnOutOfMemoryError=calc.exe', '-XX:Flags=.hotspotrc', '-Dsms.launch-secret=1',
    '-Xbootclasspath/a:evil.jar', '-XX:+UnlockDiagnosticVMOptions', '-Dfile.encoding=ISO-8859-1'] } } }), 8 * GB);
  const s = a.join(' ');
  assert.ok(s.includes('-XX:MaxMetaspaceSize=200m') && s.includes('-Dsms.startup-trace=true'));
  for (const bad of ['javaagent', 'agentlib', 'evil', 'x.jar', '--add-opens', 'calc.exe', 'Flags=', 'launch-secret', 'bootclasspath', 'UnlockDiagnostic', 'ISO-8859-1']) assert.ok(!s.includes(bad), `must not contain ${bad}`);
});

test('a broken, hand-edited or hostile app.json falls back to safe defaults', () => {
  for (const bad of ['{ not json', JSON.stringify({ backend: { port: 'abc' } }), JSON.stringify({ backend: { port: 70000 } }), JSON.stringify({ backend: { jvm: { maxHeapMb: 'lots' } } }), '[]', '']) {
    const c = parse(bad);
    assert.equal(c.backend.port, 0, `port default for ${bad}`);
    assert.equal(heap(jvmArgs(c, 8 * GB)), 384);
  }
});

test('a missing app.json is created with the defaults', () => {
  const d = mkdtempSync(path.join(work, 'n-'));
  const c = loadConfig(d);
  assert.equal(c.backend.port, 0);
  assert.equal(c.desktop.disableGpu, false);
  assert.deepEqual(JSON.parse(readFileSync(path.join(d, 'app.json'), 'utf8')).backend, { port: 0, jvm: { extraArgs: [] } });
});

test('renderer-supplied file names can never escape the folder chosen in the dialog', () => {
  const BS = String.fromCharCode(92);                                   // a backslash, spelled out to avoid escaping mistakes
  for (const evil of ['../../evil name?.pdf', `C:${BS}Windows${BS}system32${BS}x.pdf`, `..${BS}..${BS}boot.ini`, 'a/b/c.pdf', 'con:stream.pdf', '<script>.pdf', 'x|y.pdf']) {
    const n = safeFileName(evil, '.pdf');
    assert.ok(!/[\\/:*?"<>|]/.test(n), `unsafe characters left in ${JSON.stringify(n)} for ${evil}`);
    assert.ok(!n.startsWith('.'), 'no leading dots');
    assert.ok(n.endsWith('.pdf'));
  }
  assert.equal(safeFileName('', '.pdf'), 'file.pdf');
  assert.equal(safeFileName('...', '.pdf'), 'file.pdf');
  assert.equal(safeFileName('report.XLSX', '.xlsx'), 'report.XLSX');
  assert.equal(safeFileName('របាយការណ៍សិស្ស.pdf', '.pdf'), 'របាយការណ៍សិស្ស.pdf');   // Khmer names are preserved
  assert.equal(safeFileName('report', '.pdf'), 'report.pdf');
});

test.after(() => rmSync(work, { recursive: true, force: true }));
