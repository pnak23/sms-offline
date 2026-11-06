// Runs INSIDE Electron (the program's own print engine, the one that prints its reports): prints an HTML file to an A4 PDF, counts the pages of that PDF and takes a picture of the
// page. It is started by scripts/count-pages.mjs; run it by hand only the same way:
//   node_modules\electron\dist\electron.exe scripts\lib\count-pages-electron.cjs <file.html> <pdf-out> <png-out>      (ELECTRON_RUN_AS_NODE must not be set)
// It reads the HTML file and writes the two output files it is given, nothing else. It prints "PAGES=<n>" and exits 0, or prints the error and exits 1.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');

const [html, pdfOut, pngOut] = process.argv.slice(-3);
app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ show: false, width: 900, height: 1200, webPreferences: { offscreen: true } });
    await win.loadFile(html);
    await new Promise((r) => setTimeout(r, 800));   // the Khmer font and the layout settle
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true });
    fs.writeFileSync(pdfOut, pdf);
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
    const img = await win.webContents.capturePage();
    fs.writeFileSync(pngOut, img.toPNG());
    console.log('PAGES=' + pages);
    app.exit(0);
  } catch (e) {
    console.error(e && e.stack ? e.stack : e);
    app.exit(1);
  }
});
