// Runs the Maven wrapper in backend/ with JAVA_HOME resolved, so nobody has to change system settings.
// Usage: node scripts/run-mvn.mjs <maven args...>
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const candidates = [process.env.JAVA_HOME, path.join(homedir(), '.jdks', 'corretto-21.0.6')].filter(Boolean);
const javaHome = candidates.find((c) => existsSync(path.join(c, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')));
if (!javaHome) {
  console.error('No JDK 21 found. Set JAVA_HOME (e.g. C:\\Users\\<you>\\.jdks\\corretto-21.0.6).');
  process.exit(1);
}
const wrapper = path.join(root, 'backend', process.platform === 'win32' ? 'mvnw.cmd' : 'mvnw');
// The project path contains spaces: with shell:true on Windows the command itself must be quoted.
const command = process.platform === 'win32' ? `"${wrapper}"` : wrapper;
const r = spawnSync(command, ['-B', '-ntp', ...process.argv.slice(2)], {
  cwd: path.join(root, 'backend'), stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, JAVA_HOME: javaHome },
});
process.exit(r.status ?? 1);
