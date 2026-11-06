// Helpers for docs/user-guide/tools/capture-screenshots.mjs: they start the REAL KPSMS app (Electron + the real backend) on a throw-away data folder, drive it like a person would, and take
// pictures of it. Numbered red markers and outlines are drawn on top of the live page at the real position of each button or field (never painted afterwards), then removed again.
// Nothing here touches the program's source or a real data folder: the caller passes a scratch folder (SMS_DATA_DIR).
import { _electron as electron } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const root = path.resolve(import.meta.dirname, '..', '..', '..');
export const desktop = path.join(root, 'desktop');
export const shotsDir = path.join(root, 'docs', 'user-guide', 'SCREENSHOTS');
export const km = JSON.parse(readFileSync(path.join(root, 'frontend', 'i18n', 'locales', 'km.json'), 'utf8'));
/** The Khmer text of a key of km.json (the guide quotes the screen, so a missing key is an error, never a guess). */
export const t = (key) => { const v = key.split('.').reduce((n, p) => n?.[p], km); if (typeof v !== 'string') throw new Error(`km.json key missing: ${key}`); return v; };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KHMER_DIGITS = '០១២៣៤៥៦៧៨៩';
export const khmerNumber = (n) => String(n).replace(/\d/g, (d) => KHMER_DIGITS[Number(d)]);

export const VIEW = { width: 1280, height: 900 };

/** Starts the app on `dataDir` and returns { app, page, ... }. The window is a fixed 1280 x 900 and pictures are taken at 1.5x for sharp text. */
export async function launch(dataDir, { scale = 1.5 } = {}) {
  mkdirSync(shotsDir, { recursive: true });
  const env = { ...process.env, SMS_DATA_DIR: dataDir };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'), args: [desktop, `--force-device-scale-factor=${scale}`], env, timeout: 120_000 });
  let page;
  const end = Date.now() + 120_000;
  while (!page && Date.now() < end) { page = app.windows().find((w) => w.url().startsWith('app://school')); if (!page) await sleep(300); }
  if (!page) throw new Error('the main window did not appear');
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({ BrowserWindow }, v) => {
    const win = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.webContents.getURL().startsWith('app://school'));
    win.setMinimumSize(0, 0); win.setMaximumSize(0, 0); win.unmaximize(); win.setContentSize(v.width, v.height); win.setPosition(0, 0);   // the program caps its own window at the work area: lifted, so the window is really v.width x v.height
  }, VIEW);
  await sleep(800);
  const ctx = makeContext(app, page);
  return ctx;
}

function makeContext(app, page) {
  const ctx = { app, page, shots: [], failed: [] };
  ctx.field = (name) => page.locator(`input[id^="field-${name}-"], textarea[id^="field-${name}-"], select[id^="field-${name}-"]`).first();
  ctx.button = (text, exact = true) => page.getByRole('button', { name: text, exact }).first();
  ctx.link = (text, exact = true) => page.getByRole('link', { name: text, exact }).first();
  ctx.text = (text) => page.getByText(text, { exact: false }).first();
  ctx.modal = () => page.locator('.modal.show').first();
  ctx.heading = (text) => page.locator('h1, h2, h3').filter({ hasText: text }).first();
  /** Click the sidebar entry that goes to `href` and wait a moment for the page to draw (a page reload would sign the user out, so every move is a click). */
  ctx.go = async (href) => { await page.locator(`a[href="${href}"]`).first().click(); await page.waitForLoadState('domcontentloaded'); await sleep(900); };
  ctx.settle = async (ms = 700) => { await sleep(ms); };
  /** Keep or hide the toast notifications (hidden by default so that one never covers a button). */
  ctx.toasts = async (show) => { await page.evaluate((s) => { let el = document.getElementById('kp-hide-toasts'); if (!s && !el) { el = document.createElement('style'); el.id = 'kp-hide-toasts'; el.textContent = '.toast-container{display:none!important}'; document.head.appendChild(el); } if (s && el) el.remove(); }, !!show); };
  ctx.signIn = async (user, pass) => {
    await ctx.field('username').waitFor({ timeout: 60_000 });
    await ctx.field('username').fill(user);
    await ctx.field('password').fill(pass);
    await ctx.button(t('auth.login.submit')).click();
    await page.waitForURL('**/dashboard', { timeout: 60_000 });
    await sleep(1500);
  };
  ctx.shot = (id, opts) => shot(ctx, id, opts);
  ctx.scene = async (id, fn) => {
    try { await ctx.closeModals(); await fn(); }
    catch (error) {
      const message = String(error.message ?? error).split(/\r?\n/)[0].slice(0, 200);
      ctx.failed.push({ id, error: message });
      let where = '';
      try { where = JSON.stringify(await page.evaluate(() => ({ url: location.pathname, buttons: [...document.querySelectorAll('button, a.btn')].filter((b) => b.offsetParent).map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 16) }))); } catch { /* the page may be gone */ }
      console.log('FAIL  ' + id + ': ' + message + '  ' + where.slice(0, 300));
      if (process.env.KPSMS_GUIDE_DEBUG_DIR) { try { await page.screenshot({ path: path.join(process.env.KPSMS_GUIDE_DEBUG_DIR, `failed-${id}.png`), timeout: 8000 }); } catch { /* ignore */ } }
    }
  };
  /** Close anything left open by an earlier scene (a pop-up, a menu). */
  ctx.closeModals = async () => {
    for (let i = 0; i < 3; i++) {
      const open = page.locator('.modal.show').first();
      if (!(await open.count())) break;
      const cancel = open.getByRole('button', { name: /^(បោះបង់|បិទ)$/ }).first();
      if (await cancel.count()) await cancel.click().catch(() => {}); else await page.keyboard.press('Escape');
      await sleep(500);
    }
    await page.keyboard.press('Escape').catch(() => {});
  };
  return ctx;
}

/**
 * Takes SCREENSHOTS/<file>.png.
 *  clip:  undefined = the whole window | a Locator (or an array of them) = their union | { x, y, width, height }
 *  pad:   pixels around a clipped Locator (default 14)
 *  marks: [ locator | { at: locator, pos: 'tl'|'tr'|'bl'|'br'|'l'|'r', outline: false } ... ] numbered 1, 2, 3 (Khmer digits) in this order
 *  toast: true to keep the notifications visible
 */
async function shot(ctx, file, { clip, pad = 14, marks = [], toast = false, settle = 500 } = {}) {
  const { page } = ctx;
  await ctx.toasts(toast);
  await sleep(settle);
  // 1. every element we need, 2. scroll the topmost one into view ONCE if any is outside the window, 3. measure them all together (so a later scroll can never make an earlier box stale)
  const clipList = clip && clip.x === undefined && clip.width === undefined ? (Array.isArray(clip) ? clip : [clip]) : [];
  const markSpecs = marks.map((m) => (m.at ? m : { at: m }));
  const targets = [...markSpecs.map((m) => m.at), ...clipList];
  const measure = async () => { const out = []; for (const l of targets) { const b = await l.first().boundingBox(); if (!b) throw new Error('a marked element is not visible'); out.push(b); } return out; };
  let boxes = targets.length ? await measure() : [];
  if (boxes.some((b) => b.y < 0 || b.y + b.height > VIEW.height || b.x < 0 || b.x + b.width > VIEW.width)) {
    const top = targets[boxes.reduce((best, b, i) => (b.y < boxes[best].y ? i : best), 0)];
    // scroll so that the topmost marked element sits about 60 px below the top of the window (the browser stops at the end of the page)
    const delta = Math.min(...boxes.map((b) => b.y)) - 60;
    await top.first().evaluate((el, d) => {
      let p = el.parentElement;
      while (p && !(p.scrollHeight > p.clientHeight && /(auto|scroll)/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
      (p ?? document.scrollingElement).scrollBy(0, d);
    }, delta);
    await sleep(400);
    boxes = await measure();
    const still = boxes.findIndex((b) => b.y < -2 || b.y + b.height > VIEW.height + 2);
    if (still >= 0) {
      const inner = await page.evaluate(() => [innerWidth, innerHeight]);
      throw new Error(`the marked elements do not fit in one window (element ${still + 1} is off-screen; window ${inner.join('x')}; tops/bottoms ${boxes.map((b) => `${Math.round(b.y)}/${Math.round(b.y + b.height)}`).join(' ')})`);
    }
  }
  const prepared = markSpecs.map((m, i) => ({ x: boxes[i].x, y: boxes[i].y, w: boxes[i].width, h: boxes[i].height, label: khmerNumber(i + 1), pos: m.pos ?? 'tl', outline: m.outline !== false }));
  if (prepared.length) {
    await page.evaluate((ms) => {
      const layer = document.createElement('div');
      layer.id = 'kp-annot';
      layer.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483647;pointer-events:none;';
      for (const m of ms) {
        if (m.outline) {
          const o = document.createElement('div');
          o.style.cssText = `position:absolute;left:${m.x - 3}px;top:${m.y - 3}px;width:${m.w + 6}px;height:${m.h + 6}px;border:3px solid #e5484d;border-radius:7px;box-shadow:0 0 0 2px rgba(255,255,255,.85);`;
          layer.appendChild(o);
        }
        const size = 28;
        const spots = { tl: [m.x - 16, m.y - 16], tr: [m.x + m.w - 12, m.y - 16], bl: [m.x - 16, m.y + m.h - 12], br: [m.x + m.w - 12, m.y + m.h - 12], l: [m.x - 36, m.y + m.h / 2 - 14], r: [m.x + m.w + 8, m.y + m.h / 2 - 14] };
        const [bx, by] = spots[m.pos] ?? spots.tl;
        const b = document.createElement('div');
        b.textContent = m.label;
        b.style.cssText = `position:absolute;left:${Math.max(2, bx)}px;top:${Math.max(2, by)}px;width:${size}px;height:${size}px;border-radius:50%;background:#e5484d;color:#fff;font:700 16px 'Noto Sans Khmer','Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45);`;
        layer.appendChild(b);
      }
      document.body.appendChild(layer);
    }, prepared);
  }
  let rect;
  if (!clip) rect = { x: 0, y: 0, width: VIEW.width, height: VIEW.height };
  else if (clip.x !== undefined && clip.width !== undefined) rect = clip;
  else {
    const cb = boxes.slice(markSpecs.length);
    const x1 = Math.min(...cb.map((q) => q.x)), y1 = Math.min(...cb.map((q) => q.y));
    const x2 = Math.max(...cb.map((q) => q.x + q.width)), y2 = Math.max(...cb.map((q) => q.y + q.height));
    rect = { x: x1 - pad, y: y1 - pad, width: x2 - x1 + 2 * pad, height: y2 - y1 + 2 * pad };
  }
  // keep inside the window
  const x = Math.max(0, Math.floor(rect.x)), y = Math.max(0, Math.floor(rect.y));
  const width = Math.min(VIEW.width - x, Math.ceil(rect.width + (rect.x - x))), height = Math.min(VIEW.height - y, Math.ceil(rect.height + (rect.y - y)));
  const out = path.join(shotsDir, `${file}.png`);
  try {
    await page.screenshot({ path: out, clip: { x, y, width, height }, timeout: 10_000 });
  } catch {
    // some pages (the print sheets) make Playwright's own screenshot wait for ever: ask Electron for the picture of the window instead
    const base64 = await ctx.app.evaluate(async ({ BrowserWindow }, r) => {
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().startsWith('app://school'));
      const image = await win.webContents.capturePage(r);
      return image.toPNG().toString('base64');
    }, { x, y, width, height });
    writeFileSync(out, Buffer.from(base64, 'base64'));
  }
  await page.evaluate(() => document.getElementById('kp-annot')?.remove());
  ctx.shots.push(file);
  console.log(`shot  ${file}.png  ${Math.round(width)}x${Math.round(height)}${marks.length ? `  (${marks.length} markers)` : ''}`);
}

export const exists = existsSync;
