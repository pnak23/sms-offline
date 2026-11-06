// Developer-only offline reset of the administrator password: runs tools/ResetAdmin.java against the extracted backend.
// Close the application first. Usage: node scripts/reset-admin.mjs [--data-dir DIR] [--password-stdin] [--force]
// Needs the extracted backend (npm run backend:build, then node scripts/extract-backend.mjs).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { javaExe } from './lib/jdk.mjs';

const root = path.resolve(import.meta.dirname, '..');
const extracted = path.join(root, 'backend', 'target', 'extracted');
if (!existsSync(path.join(extracted, 'sms-backend.jar'))) {
  console.error('The extracted backend is missing: run `npm run backend:build` and `node scripts/extract-backend.mjs` first.');
  process.exit(1);
}
const classpath = [path.join(extracted, 'sms-backend.jar'), path.join(extracted, 'lib', '*')].join(path.delimiter);

// --data-dir goes to Java through the environment, not argv: argv would lose Khmer characters in the path on Windows.
const args = process.argv.slice(2);
const env = { ...process.env };
const at = args.indexOf('--data-dir');
if (at >= 0) {
  if (!args[at + 1]) { console.error('--data-dir needs a folder'); process.exit(1); }
  env.SMS_DATA_DIR = path.resolve(args[at + 1]);
  args.splice(at, 2);
}
const r = spawnSync(javaExe(), ['-Dstdin.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8', '-cp', classpath,
  path.join(root, 'tools', 'ResetAdmin.java'), ...args], { stdio: 'inherit', env });
process.exit(r.status ?? 1);
