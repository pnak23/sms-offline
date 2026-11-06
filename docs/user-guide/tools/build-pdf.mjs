// Builds docs/user-guide/USER-GUIDE-KM.pdf from docs/user-guide/USER-GUIDE-KM.md with the program's own print engine (Electron / Chromium): A4, the Khmer fonts the program already ships
// (@fontsource/noto-sans-khmer and @fontsource/moul, embedded in the PDF), a cover page, a table of contents whose page numbers are READ BACK from the finished PDF (its outline), page
// numbers in Khmer digits at the foot of every page but the cover, and a PDF outline (bookmarks). Nothing is downloaded and nothing of the program is changed.
// Usage (from the repository root; see docs/user-guide/README.md):   node docs/user-guide/tools/build.mjs
// (that small script clears ELECTRON_RUN_AS_NODE, which some terminals set, and starts this file with the program's own Electron).
import { app, BrowserWindow } from 'electron';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { khmerNumber, mdToHtml } from './md.mjs';

const guideDir = path.resolve(import.meta.dirname, '..');
const root = path.resolve(guideDir, '..', '..');
const config = JSON.parse(readFileSync(path.join(guideDir, 'guide.config.json'), 'utf8'));
const release = JSON.parse(readFileSync(path.join(root, 'release', 'release.json'), 'utf8'));
const fontUrl = (pkg, file) => pathToFileURL(path.join(root, 'node_modules', '@fontsource', pkg, 'files', file)).href;
const logoUrl = pathToFileURL(path.join(root, 'desktop', 'build', 'logo-source.png')).href;
const KHMER_RANGE = 'U+1780-17FF, U+19E0-19FF, U+200C-200D, U+25CC';
const LATIN_RANGE = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';

/** The size of a PNG, read from its header. */
function pngSize(file) { const b = readFileSync(file); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; }
// pictures taken before the sidebar exists (setup, sign-in, lock), the printed sheets, and the overview whose subject IS the menu keep their full width
const KEEP_FULL = /(^|\/)(02-|16-login|01-lock|01-dashboard-overview)|print|receipt/;
const cropSidebar = (src) => { try { const { w, h } = pngSize(path.join(guideDir, src)); return w === 1920 && h === 1350 && !KEEP_FULL.test(src); } catch { return false; } };

const fonts = [400, 500, 600, 700].map((w) => `
@font-face { font-family: 'KP Sans'; font-weight: ${w}; src: url('${fontUrl('noto-sans-khmer', `noto-sans-khmer-khmer-${w}-normal.woff2`)}') format('woff2'); unicode-range: ${KHMER_RANGE}; }
@font-face { font-family: 'KP Sans'; font-weight: ${w}; src: url('${fontUrl('noto-sans-khmer', `noto-sans-khmer-latin-${w}-normal.woff2`)}') format('woff2'); unicode-range: ${LATIN_RANGE}; }`).join('')
  + `
@font-face { font-family: 'KP Title'; font-weight: 400; src: url('${fontUrl('moul', 'moul-khmer-400-normal.woff2')}') format('woff2'); unicode-range: ${KHMER_RANGE}; }
@font-face { font-family: 'KP Title'; font-weight: 400; src: url('${fontUrl('moul', 'moul-latin-400-normal.woff2')}') format('woff2'); unicode-range: ${LATIN_RANGE}; }`;

const css = `${fonts}
:root { --blue: #1d5c96; --deep: #0f2a4a; --gold: #d4a62a; --ink: #1c2430; --muted: #566273; --line: #d9dfe7; }
@page { size: A4; margin: 20mm 18mm 22mm 18mm; @bottom-center { content: counter(page, khmer); font-family: 'KP Sans', sans-serif; font-size: 10pt; color: #566273; } }
@page cover { margin: 0; @bottom-center { content: none; } }
* { box-sizing: border-box; }
html { font-size: 11.5pt; }
body { margin: 0; font-family: 'KP Sans', 'Noto Sans Khmer', sans-serif; color: var(--ink); line-height: 1.95; }
h1, h2, h3, h4 { font-family: 'KP Sans', sans-serif; font-weight: 700; line-height: 1.6; break-after: avoid; }
/* Moul has tall glyph tops: a short line box lets them spill onto the previous page, so its line box is made tall */
h1 { font-family: 'KP Title', 'KP Sans', serif; font-weight: 400; font-size: 21pt; line-height: 2.6; padding-top: 4pt; color: var(--deep); border-bottom: 3pt solid var(--gold); padding-bottom: 5pt; margin: 0 0 14pt; break-before: page; }
h2 { font-size: 15pt; color: var(--blue); margin: 20pt 0 6pt; }
h3 { font-size: 12.5pt; color: var(--deep); margin: 16pt 0 4pt; padding-left: 8pt; border-left: 4pt solid var(--gold); }
h4 { font-size: 11.5pt; color: var(--muted); margin: 12pt 0 2pt; }
p { margin: 0 0 6pt; }
ul, ol { margin: 0 0 8pt; padding-left: 20pt; }
ol { list-style-type: khmer; }
li { margin: 0 0 2pt; }
a { color: var(--blue); text-decoration: none; }
code { font-family: Consolas, 'Courier New', monospace; font-size: 10pt; background: #eef2f7; padding: 0 3pt; border-radius: 2pt; }
pre { background: #eef2f7; border: 1px solid var(--line); border-radius: 4pt; padding: 6pt 8pt; font-size: 9.5pt; line-height: 1.5; white-space: pre-wrap; break-inside: avoid; }
.ui { font-weight: 600; color: var(--deep); background: #e6eff8; border-radius: 3pt; padding: 0 3pt; white-space: nowrap; }
strong { font-weight: 700; }
hr { border: 0; border-top: 1px solid var(--line); margin: 12pt 0; }
.pagebreak { break-after: page; }
.blk { border-radius: 4pt; padding: 5pt 9pt; margin: 0 0 6pt; break-inside: avoid; }
.blk-purpose { background: #e6eff8; border-left: 4pt solid var(--blue); }
.blk-step { background: #fff; border: 1px solid var(--line); border-left: 4pt solid var(--blue); }
.blk-result { background: #e5f4ec; border-left: 4pt solid #1b7a4b; }
.blk-note { background: #fff3dc; border-left: 4pt solid #c88a00; }
.blk-warning { background: #fdebea; border-left: 4pt solid #b42318; }
blockquote { margin: 0 0 8pt; padding: 4pt 10pt; border-left: 3pt solid var(--line); color: var(--muted); }
blockquote p:last-child { margin-bottom: 0; }
table { border-collapse: collapse; width: 100%; margin: 4pt 0 10pt; font-size: 10.5pt; line-height: 1.6; break-inside: auto; }
th, td { border: 1px solid var(--line); padding: 3pt 6pt; vertical-align: top; text-align: left; }
th { background: #eef2f7; font-weight: 700; }
tr { break-inside: avoid; }
figure { margin: 6pt 0 12pt; break-inside: avoid; text-align: center; }
figure img { max-width: 100%; max-height: 120mm; border: 1px solid var(--line); border-radius: 4pt; }
figcaption { font-size: 9.5pt; color: var(--muted); line-height: 1.6; margin-top: 3pt; }
.fig-no { font-weight: 700; color: var(--blue); }
/* the cover */
.cover { page: cover; break-after: page; height: 297mm; width: 210mm; background: linear-gradient(160deg, #0f2a4a 0%, #1d5c96 100%); color: #fff; position: relative; padding: 38mm 24mm 0; text-align: center; overflow: hidden; }
.cover::before { content: ''; position: absolute; right: -40mm; top: -40mm; width: 120mm; height: 120mm; border-radius: 50%; background: radial-gradient(circle, rgba(212,166,42,.45), rgba(212,166,42,0) 70%); }
.cover::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 9mm; background: var(--gold); }
.cover img { width: 46mm; height: 46mm; position: relative; border-radius: 8mm; background: #fff; padding: 2mm; }
.cover .kicker { font-size: 13pt; letter-spacing: .12em; color: #f3d98a; margin: 12mm 0 4mm; position: relative; }
.cover .cover-title { display: block; font-family: 'KP Title', 'KP Sans', serif; font-size: 30pt; line-height: 1.9; color: #fff; position: relative; }
.cover .sub { font-size: 15pt; margin-top: 6mm; color: #e6eff8; position: relative; }
.cover .meta { position: absolute; left: 24mm; right: 24mm; bottom: 28mm; font-size: 11.5pt; color: #e6eff8; line-height: 1.9; }
.cover .draft { display: inline-block; margin-top: 4mm; border: 1px solid #f3d98a; border-radius: 4pt; padding: 2pt 10pt; color: #f3d98a; font-size: 10.5pt; }
/* the table of contents */
.toc { break-after: page; }
.toc-title { font-family: 'KP Title', 'KP Sans', serif; font-size: 21pt; line-height: 2.6; color: var(--deep); border-bottom: 3pt solid var(--gold); padding-bottom: 5pt; margin: 0 0 12pt; }
.toc-row { display: flex; align-items: baseline; gap: 6pt; line-height: 1.55; }
.toc-row .t { flex: none; max-width: 88%; }
.toc-row .dots { flex: 1; border-bottom: 1.5px dotted #9aa6b6; transform: translateY(-3pt); min-width: 10pt; }
.toc-row .n { flex: none; font-variant-numeric: tabular-nums; }
.toc-ch { font-weight: 700; margin-top: 6pt; color: var(--deep); font-size: 10.5pt; }
.toc-sec { padding-left: 18pt; font-size: 9.5pt; color: var(--ink); line-height: 1.5; }
/* the sidebar (about 18 % of the width) and the thin top bar of the program's window are cut off, which makes the rest about 22 % larger */
.fig-crop { overflow: hidden; border: 1px solid var(--line); border-radius: 4pt; line-height: 0; width: 96%; margin: 0 auto; }
.fig-crop img { width: 122.6%; max-width: none; max-height: none; margin-left: -22.6%; margin-top: -5.6%; border: 0; border-radius: 0; display: block; }   /* the menu column and the thin top bar are cut off */
`;

function buildHtml(bodyHtml, headings, pages) {
  const date = config.dateKm ?? '';
  const toc = headings.filter((h) => h.level <= 2).map((h) => {
    const text = h.text.replace(/«|»|\*\*|`/g, '');
    const n = pages?.[h.id] ? khmerNumber(pages[h.id]) : '០០';
    return `<div class="toc-row ${h.level === 1 ? 'toc-ch' : 'toc-sec'}"><span class="t">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span><span class="dots"></span><span class="n">${n}</span></div>`;
  }).join('\n');
  return `<!doctype html><html lang="km"><head><meta charset="utf-8"><title>${config.title} — ${release.shortName} ${release.version}</title><style>${css}</style></head><body>
<section class="cover">
  <img src="${logoUrl}" alt="">
  <div class="kicker">${release.shortName} · ${khmerNumber(release.version.split('.')[0])}.${release.version.split('.').slice(1).map(khmerNumber).join('.')}</div>
  <div class="cover-title">${config.title}</div>
  <div class="sub">${config.subtitle}</div>
  <div class="meta">${config.audience}<br>${config.edition} · ${date}<br><span class="draft">${config.draftNotice}</span></div>
</section>
<section class="toc"><div class="toc-title">${config.tocTitle}</div>
${toc}
</section>
${bodyHtml}
</body></html>`;
}

/** The pages of every heading, read back from the finished PDF: its outline (bookmarks) lists the headings in order and each points at a page object. */
export function outlinePages(pdf) {
  const text = pdf.toString('latin1');
  const objects = new Map();
  for (const m of text.matchAll(/(\d+) 0 obj\s*(<<[\s\S]*?>>)\s*(?:stream|endobj)/g)) objects.set(Number(m[1]), m[2]);
  const ref = (dict, key) => { const m = new RegExp(`/${key}\\s+(\\d+) 0 R`).exec(dict); return m ? Number(m[1]) : null; };
  // the pages in reading order (the page tree may be nested)
  const order = [];
  const walk = (num) => {
    const dict = objects.get(num);
    if (!dict) return;
    if (/\/Type\s*\/Pages\b/.test(dict)) { for (const k of /\/Kids\s*\[([^\]]*)\]/.exec(dict)?.[1].matchAll(/(\d+) 0 R/g) ?? []) walk(Number(k[1])); }
    else order.push(num);
  };
  const rootPages = [...objects.entries()].find(([, d]) => /\/Type\s*\/Pages\b/.test(d) && !/\/Parent\b/.test(d));
  if (rootPages) walk(rootPages[0]);
  const pageOf = new Map(order.map((n, i) => [n, i + 1]));
  const decode = (hex) => { const b = Buffer.from(hex, 'hex'); let s = ''; for (let i = 2; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]); return s; };
  const entries = [];
  const visit = (num) => {
    for (let n = num; n; n = ref(objects.get(n) ?? '', 'Next')) {
      const dict = objects.get(n) ?? '';
      const title = /\/Title\s*<([0-9A-Fa-f]+)>/.exec(dict);
      const dest = /\/Dest\s*\[\s*(\d+) 0 R/.exec(dict);
      entries.push({ title: title ? decode(title[1]) : '', page: dest ? pageOf.get(Number(dest[1])) ?? null : null });
      const first = ref(dict, 'First');
      if (first) visit(first);
    }
  };
  const outlines = [...objects.entries()].find(([, d]) => /\/Type\s*\/Outlines\b/.test(d));
  if (outlines) { const first = ref(outlines[1], 'First'); if (first) visit(first); }
  return { pageCount: order.length, entries };
}

async function printPdf(win, html, file) {
  writeFileSync(file, html);
  if (process.env.KPSMS_GUIDE_HTML_OUT) writeFileSync(process.env.KPSMS_GUIDE_HTML_OUT, html);   // for looking at the page the PDF is printed from
  await win.loadFile(file);
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => Promise.all([...document.images].map((i) => i.complete ? 1 : new Promise((r) => { i.onload = i.onerror = r; }))))');
  return win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true, generateDocumentOutline: true, generateTaggedPDF: true });
}

app.whenReady().then(async () => {
  const work = mkdtempSync(path.join(tmpdir(), 'kpsms-guide-'));
  try {
    const source = readFileSync(path.join(guideDir, 'USER-GUIDE-KM.md'), 'utf8');
    const { html: body, headings, figures } = mdToHtml(source, { resolve: (src) => pathToFileURL(path.join(guideDir, src)).href, cropSidebar });
    const win = new BrowserWindow({ show: false, width: 900, height: 1200, webPreferences: { offscreen: true } });
    let pages = null;
    let pdf;
    for (let pass = 1; pass <= 4; pass++) {
      pdf = await printPdf(win, buildHtml(body, headings, pages), path.join(work, 'guide.html'));
      const { pageCount, entries } = outlinePages(pdf);
      // the cover and the table of contents have no headings; the outline lists the headings of the body in order
      if (entries.length !== headings.length) throw new Error(`the PDF outline has ${entries.length} headings, the guide has ${headings.length}`);
      const next = {};
      headings.forEach((h, i) => { next[h.id] = entries[i].page; });
      const stable = pages && headings.every((h) => pages[h.id] === next[h.id]);
      pages = next;
      console.log(`pass ${pass}: ${pageCount} pages, ${headings.length} headings, ${figures} figures${stable ? ' (the table of contents is stable)' : ''}`);
      if (stable) break;
    }
    writeFileSync(path.join(guideDir, 'USER-GUIDE-KM.pdf'), pdf);
    console.log('written docs/user-guide/USER-GUIDE-KM.pdf');
    app.exit(0);
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    app.exit(1);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
