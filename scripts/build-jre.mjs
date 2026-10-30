// Builds the minimal Java runtime that ships inside the installer (docs §8): jdeps finds the modules the backend needs,
// jlink produces a trimmed JRE in desktop/build/jre. Run after `npm run backend:build` + extracting the jar.
// Usage: node scripts/build-jre.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const javaHome = [process.env.JAVA_HOME, path.join(homedir(), '.jdks', 'corretto-21.0.6')].filter(Boolean)
  .find((c) => existsSync(path.join(c, 'bin', 'jlink.exe')));
if (!javaHome) { console.error('JDK 21 with jlink not found (set JAVA_HOME).'); process.exit(1); }
const extracted = path.join(root, 'backend', 'target', 'extracted');
if (!existsSync(path.join(extracted, 'sms-backend.jar'))) {
  console.error('Extracted backend missing. Run: npm run backend:build, then extract (node scripts/extract-backend.mjs).');
  process.exit(1);
}
const out = path.join(root, 'desktop', 'build', 'jre');
rmSync(out, { recursive: true, force: true });

const jars = readdirSync(path.join(extracted, 'lib')).filter((f) => f.endsWith('.jar')).map((f) => path.join(extracted, 'lib', f));
const detected = execFileSync(path.join(javaHome, 'bin', 'jdeps.exe'), [
  '--print-module-deps', '--ignore-missing-deps', '--multi-release', '21',
  '--class-path', jars.join(path.delimiter), path.join(extracted, 'sms-backend.jar'),
], { encoding: 'utf8' }).trim();
// jdeps cannot see modules loaded reflectively: TLS/crypto providers, JDBC drivers' needs, image I/O (java.desktop),
// management (Hikari/Hibernate), naming (JDBC pools), the zip filesystem, unsupported (Unsafe users).
const extra = ['java.desktop', 'java.management', 'java.naming', 'java.sql', 'java.xml', 'java.logging', 'java.security.jgss',
  'jdk.unsupported', 'jdk.crypto.ec', 'jdk.zipfs', 'java.instrument', 'jdk.management', 'jdk.net'];
const modules = [...new Set([...detected.split(','), ...extra])].filter(Boolean).sort();
console.log('modules:', modules.join(','));

execFileSync(path.join(javaHome, 'bin', 'jlink.exe'), [
  '--add-modules', modules.join(','), '--strip-debug', '--no-header-files', '--no-man-pages', '--compress=zip-6', '--output', out,
], { stdio: 'inherit' });

const size = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? size(path.join(dir, e.name)) : statSync(path.join(dir, e.name)).size), 0);
console.log(`JRE ready: ${out}  (${(size(out) / 1048576).toFixed(1)} MB on disk)`);
