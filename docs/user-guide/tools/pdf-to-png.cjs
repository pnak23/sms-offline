// Renders pages of a PDF to PNG pictures with Electron's own PDF viewer, to LOOK at the printed guide (Khmer shaping, page numbers, figures, page breaks).
// Usage (from the repository root, with ELECTRON_RUN_AS_NODE cleared):
//   node_modules\electron\dist\electron.exe docs\user-guide\tools\pdf-to-png.cjs <pdf> <out-folder> <page> [<page> ...]      (page numbers start at 1; "all" renders every page)
// Pictures are written as <out-folder>/page-<n>.png. Nothing is changed except those pictures.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const args = process.argv.slice(process.argv.findIndex((a) => a.endsWith('pdf-to-png.cjs')) + 1);
const [pdf, outDir, ...wanted] = args;
if (!pdf || !outDir || wanted.length === 0) { console.error('Usage: electron pdf-to-png.cjs <pdf> <out-folder> <page> [<page> ...] | all'); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.on('window-all-closed', () => {});   // Electron would quit when the first picture's window closes

app.whenReady().then(async () => {
  try {
    fs.mkdirSync(outDir, { recursive: true });
    let pages = wanted.filter((p) => p !== 'all').map(Number);
    if (wanted.includes('all')) {
      const count = (fs.readFileSync(pdf).toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
      pages = Array.from({ length: count }, (_, i) => i + 1);
    }
    for (const p of pages) {
      const win = new BrowserWindow({ show: true, width: 900, height: 1200, useContentSize: true, webPreferences: { plugins: true } });
      let loaded = false;
      for (let attempt = 1; attempt <= 3 && !loaded; attempt++) {
        try { await win.loadURL(`${pathToFileURL(pdf).href}#page=${p}&toolbar=0&navpanes=0&view=Fit`); loaded = true; } catch { await sleep(1000); }
      }
      await sleep(4500);   // a heavy page (large pictures) needs a moment, or the viewer shows black
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, `page-${p}.png`), img.toPNG());
      console.log(`page ${p}: ${img.getSize().width}x${img.getSize().height}`);
      win.destroy();
      await sleep(900);
    }
    app.exit(0);
  } catch (error) { console.error(error && error.stack ? error.stack : error); app.exit(1); }
});
