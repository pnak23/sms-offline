// Runs make-icon.cjs inside Electron (the picture is drawn by the same engine as the program). Usage: node desktop/scripts/make-icon.mjs
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const desktop = path.resolve(import.meta.dirname, '..');
const electron = path.resolve(desktop, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;   // a VS Code terminal may set it: Electron would then start as plain Node with no window
const result = spawnSync(electron, [path.join(desktop, 'scripts', 'make-icon.cjs')], { stdio: 'inherit', env });
process.exit(result.status ?? 1);
