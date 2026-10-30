// Extracts the Spring Boot jar into the fast-start layout (thin jar + lib/) that the installer ships (docs/PERF-LOG.md:
// -25 % cold start vs the fat jar). Usage: node scripts/extract-backend.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const javaHome = [process.env.JAVA_HOME, path.join(homedir(), '.jdks', 'corretto-21.0.6')].filter(Boolean)
  .find((c) => existsSync(path.join(c, 'bin', 'java.exe')));
if (!javaHome) { console.error('JDK 21 not found (set JAVA_HOME).'); process.exit(1); }
const jar = path.join(root, 'backend', 'target', 'sms-backend.jar');
if (!existsSync(jar)) { console.error('Build first: npm run backend:build'); process.exit(1); }
const dest = path.join(root, 'backend', 'target', 'extracted');
rmSync(dest, { recursive: true, force: true });
execFileSync(path.join(javaHome, 'bin', 'java.exe'), ['-Djarmode=tools', '-jar', jar, 'extract', '--destination', dest], { stdio: 'inherit' });
console.log('extracted ->', dest);
