// Opens the program on the FICTIONAL sample school built by scripts/seed-sample-data.mjs (folder <repo>/.sample-data). Your real data and your
// .dev-data are not touched. Needs the same builds as the end-to-end tests: backend:build + scripts/extract-backend.mjs, generate -w frontend, build -w desktop.
// Close the window to stop. While it is open it holds backend/target/extracted, so close it before rebuilding.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const data = path.join(root, '.sample-data');
const electron = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const desktop = path.join(root, 'desktop');
if (!existsSync(path.join(data, 'SAMPLE-LOGIN.txt'))) {
  console.error(`There is no sample school yet. Build it first: node scripts/seed-sample-data.mjs`);
  process.exit(1);
}
for (const [what, p] of [['Electron', electron], ['the desktop bundle', path.join(desktop, 'dist')], ['the generated UI', path.join(root, 'frontend', '.output', 'public', 'index.html')], ['the extracted backend', path.join(root, 'backend', 'target', 'extracted', 'sms-backend.jar')]]) {
  if (!existsSync(p)) { console.error(`${what} is missing (${p}): build it first (see the header of this script).`); process.exit(1); }
}
console.log(readFileSync(path.join(data, 'SAMPLE-LOGIN.txt'), 'utf8').split(/\r?\n/).slice(0, 5).join('\n'));
const env = { ...process.env, SMS_DATA_DIR: data };
delete env.ELECTRON_RUN_AS_NODE;   // a VS Code terminal sets it, and Electron would then start as plain Node with no window
const child = spawn(electron, [desktop], { env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
