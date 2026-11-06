// Makes the application icon: desktop/build/icon.png (512 px) and desktop/build/icon.ico (16, 24, 32, 48, 64, 128, 256 px, PNG entries).
// D12 (the owner's decision of 2026-11-05): the KPSMS logo is used when its file exists. It is desktop/build/logo-source.png, the owner's own picture (a square PNG with a transparent
// background; the owner's file is kept exactly as it was given and is never edited). Without that file the script draws the simple "KP / SMS" monogram it was first written for.
// To change the icon: replace desktop/build/logo-source.png with the new square PNG (at least 512 px is best), run this script, then rebuild the installer.
// Run it through Electron, so that the pictures are made by the same engine as the program itself:
//   node desktop/scripts/make-icon.mjs
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const out = path.resolve(__dirname, '..', 'build');
const LOGO = path.join(out, 'logo-source.png');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2f74c7"/>
      <stop offset="1" stop-color="#173f78"/>
    </linearGradient>
  </defs>
  <rect x="48" y="48" width="928" height="928" rx="210" fill="url(#bg)"/>
  <text x="512" y="578" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-weight="800" font-size="470" fill="#ffffff">KP</text>
  <rect x="268" y="642" width="488" height="30" rx="15" fill="#f2b632"/>
  <text x="512" y="846" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-weight="700" font-size="190" letter-spacing="46" fill="#ffffff">SMS</text>
</svg>`;

/** An .ico file whose entries are PNG pictures (Windows Vista and later read them, and so does the installer tool). */
function packIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  entries.forEach((e, i) => {
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, i * 16);       // 0 means 256
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, i * 16 + 1);
    dir.writeUInt8(0, i * 16 + 2);
    dir.writeUInt8(0, i * 16 + 3);
    dir.writeUInt16LE(1, i * 16 + 4);
    dir.writeUInt16LE(32, i * 16 + 6);
    dir.writeUInt32LE(e.png.length, i * 16 + 8);
    dir.writeUInt32LE(offset, i * 16 + 12);
    offset += e.png.length;
  });
  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}

/** The big picture every size is made from: the owner's logo when its file exists, otherwise the monogram. */
async function bigPicture() {
  if (fs.existsSync(LOGO)) {
    const logo = nativeImage.createFromPath(LOGO);
    const { width, height } = logo.getSize();
    if (logo.isEmpty() || width !== height) throw new Error(`desktop/build/logo-source.png must be a square picture (it is ${width}x${height})`);
    console.log(`using the owner's logo: ${LOGO} (${width}x${height})`);
    return logo;
  }
  console.log('no desktop/build/logo-source.png: drawing the KPSMS monogram');
  const win = new BrowserWindow({ show: false, width: 1024, height: 1024, useContentSize: true, transparent: true, frame: false, webPreferences: { offscreen: true } });
  const html = `<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden">${svg}</body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 800));
  const big = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  if (big.isEmpty()) throw new Error('the picture came out empty');
  return big;
}

app.whenReady().then(async () => {
  try {
    const big = await bigPicture();
    fs.mkdirSync(out, { recursive: true });
    const png = big.toPNG();
    const sized = (n) => nativeImage.createFromBuffer(png).resize({ width: n, height: n, quality: 'best' });
    fs.writeFileSync(path.join(out, 'icon.png'), sized(512).toPNG());
    fs.writeFileSync(path.join(out, 'icon.ico'), packIco(SIZES.map((size) => ({ size, png: sized(size).toPNG() }))));
    for (const n of [16, 24, 32, 48, 256]) fs.writeFileSync(path.join(out, `icon-preview-${n}.png`), sized(n).toPNG());   // for looking at; deleted by the caller
    console.log('icon written to', out);
    app.exit(0);
  } catch (e) {
    console.error('make-icon failed:', e && e.stack ? e.stack : e);
    app.exit(1);
  }
});
