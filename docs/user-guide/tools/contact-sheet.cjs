// Lays screenshots out as labelled thumbnails in ONE picture, to look over many of them at once.
// Usage (from the repository root, ELECTRON_RUN_AS_NODE cleared):
//   node_modules\electron\dist\electron.exe docs\user-guide\tools\contact-sheet.cjs <out.png> <columns> <file.png> [<file.png> ...]
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const args = process.argv.slice(process.argv.findIndex((a) => a.endsWith('contact-sheet.cjs')) + 1);
const [out, columns, ...files] = args;
const cols = Number(columns) || 3;
const width = 1500;
const cell = Math.floor((width - 16 * (cols + 1)) / cols);
const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#2b2f36;font:12px sans-serif;color:#fff;padding:16px;width:${width - 32}px}
.g{display:grid;grid-template-columns:repeat(${cols},${cell}px);gap:16px}.c img{width:${cell}px;display:block;background:#fff}.c div{padding:2px 0}</style>
<div class="g">${files.map((f) => `<div class="c"><img src="${pathToFileURL(path.resolve(f)).href}"><div>${path.basename(f)}</div></div>`).join('')}</div>`;
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width, height: 800, webPreferences: { offscreen: true } });
  const tmp = path.join(require('node:os').tmpdir(), 'kpsms-contact.html');
  fs.writeFileSync(tmp, html);
  await win.loadFile(tmp);
  await win.webContents.executeJavaScript('Promise.all([...document.images].map((i) => i.complete ? 1 : new Promise((r) => { i.onload = i.onerror = r; })))');
  const height = await win.webContents.executeJavaScript('document.documentElement.scrollHeight');
  win.setContentSize(width, Math.min(height, 16000));
  await new Promise((r) => setTimeout(r, 700));
  const image = await win.webContents.capturePage();
  fs.writeFileSync(out, image.toPNG());
  console.log(`sheet ${image.getSize().width}x${image.getSize().height} -> ${out}`);
  app.exit(0);
});
