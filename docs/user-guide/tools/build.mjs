// Starts tools/build-pdf.mjs with the program's own Electron (the PDF is printed by the same engine the program uses for its reports).
// Usage (from the repository root):   node docs/user-guide/tools/build.mjs
// It clears ELECTRON_RUN_AS_NODE (a VS Code terminal may set it, and Electron then starts as plain Node without a window). Nothing is built, installed or changed except the PDF.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
const electron = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
if (!existsSync(electron)) { console.error(`Electron is missing (${electron}). Run: node node_modules/electron/install.js`); process.exit(1); }
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const result = spawnSync(electron, [path.join(import.meta.dirname, 'build-pdf.mjs')], { stdio: 'inherit', env, cwd: root });
process.exit(result.status ?? 1);
