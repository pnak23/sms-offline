// Phase 6, step 9: the layout of every main page at the logical workspaces of the TARGET school laptop (a 14-inch Full HD screen, 1920x1080: Windows scaling 100 %, 125 % and 150 %), of a
// 1366x768 laptop at the same three scalings, and at the smallest window (880x440), in the REAL Electron shell with the REAL UI and backend, on a copy of the FICTIONAL sample school
// (72 invented students: realistic lists, not three rows). The owner's requirements (2026-11-05): comfortable at 1366x768 and smaller logical workspaces, no sideways scrolling on ordinary pages.
// What is measured on every page: no horizontal scroll bar on the page, nothing wider than the window outside a scrolling table, no vertical scroll bar on the PAGE itself (the content area
// scrolls inside the shell), no console error; and that the side menu collapses by itself when the window is narrow and opens again when it widens.
// What is NOT measured here: the real display scaling (a CSS-pixel window of the same size is used: the layout is the same, the font rendering is not), the real laptop, and the printed pages
// (A4 whatever the window; their page counts are in the other suites). The window sizes subtract a 48-pixel Windows 11 taskbar and a 31-pixel title bar from the screen at that scaling.
// Usage: node scripts/seed-sample-data.mjs --dir <a folder that does not exist yet>   then   node desktop/test/e2e-layout.mjs <that folder>
import { _electron as electron } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const desktop = path.join(root, 'desktop');
const outDir = path.join(desktop, 'test', 'out');
mkdirSync(outDir, { recursive: true });
const data = process.argv[2] ? path.resolve(process.argv[2]) : '';
if (!data || !existsSync(path.join(data, 'SAMPLE-LOGIN.txt'))) { console.error('Usage: node desktop/test/e2e-layout.mjs <a fictional sample school folder made with seed-sample-data.mjs --dir>'); process.exit(2); }
const login = readFileSync(path.join(data, 'SAMPLE-LOGIN.txt'), 'utf8');
const USER = /Username:\s*(\S+)/.exec(login)?.[1];
const PASS = /Password:\s*(\S+)/.exec(login)?.[1];
const km = JSON.parse(readFileSync(path.join(root, 'frontend', 'i18n', 'locales', 'km.json'), 'utf8'));
const t = (key) => { const v = key.split('.').reduce((n, p) => n?.[p], km); if (typeof v !== 'string') throw new Error(`km.json key missing: ${key}`); return v; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

/** What a window can show on a screen at a Windows scaling: the screen in DIPs less a 48-DIP taskbar and a 31-DIP title bar. */
const workspace = (screenW, screenH, scale) => ({ w: Math.round(screenW / scale), h: Math.round(screenH / scale - 48 - 31) });
const SHOTS = ['/dashboard', '/students', '/attendance', '/report-cards', '/homework', '/settings/academic'];
const SCENARIOS = [
  { id: 'fhd-100', label: 'the school laptop, Full HD at 100 %', ...workspace(1920, 1080, 1), shots: ['/dashboard'] },
  { id: 'fhd-125', label: 'the school laptop, Full HD at 125 %', ...workspace(1920, 1080, 1.25), shots: SHOTS },
  { id: 'fhd-150', label: 'the school laptop, Full HD at 150 %', ...workspace(1920, 1080, 1.5), shots: SHOTS },
  { id: 'hd-100', label: 'a 1366x768 laptop at 100 %', ...workspace(1366, 768, 1), shots: SHOTS },
  { id: 'hd-125', label: 'a 1366x768 laptop at 125 %', ...workspace(1366, 768, 1.25), shots: SHOTS },
  { id: 'hd-150', label: 'a 1366x768 laptop at 150 %', ...workspace(1366, 768, 1.5), shots: SHOTS },
  { id: 'smallest', label: 'the smallest window, 880x440', w: 880, h: 409, shots: ['/dashboard', '/students'], allowPageScrollY: true },
];

let app;
const consoleErrors = [];
try {
  const env = { ...process.env, SMS_DATA_DIR: data };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'), args: [desktop], env, timeout: 120_000 });
  let page;
  const end = Date.now() + 120_000;
  while (!page && Date.now() < end) { page = app.windows().find((w) => w.url().startsWith('app://school')); if (!page) await sleep(300); }
  if (!page) throw new Error('main window did not appear');
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 4(01|22|29)\b/.test(m.text())) consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e.message).slice(0, 300)));
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  const mainWindowCall = (fn, arg) => app.evaluate(({ BrowserWindow }, a) => {
    const win = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.webContents.getURL().startsWith('app://school'));
    return new Function('win', 'a', `return (${a.fn})(win, a.arg)`)(win, a);
  }, { fn: fn.toString(), arg });
  const windowInfo = () => mainWindowCall((win) => ({ maximized: win.isMaximized(), min: win.getMinimumSize(), content: win.getContentSize() }));
  // the window's own minimum is lifted for the test (a window can only be dragged down to it), so that the screen sizes of the table above can be set exactly
  const resize = async (w, h) => {
    await mainWindowCall((win, a) => { win.setMinimumSize(0, 0); win.unmaximize(); win.setContentSize(a.w, a.h); }, { w, h });
    await sleep(600);
  };

  // ---- the window the program opens: the minimum is 880x440 (a real window, before the test changes anything) -----------------------------------------------------
  const opened = await windowInfo();
  check('LY-win the program opens with a minimum window of 880x440 (it was 1200x650)', opened.min[0] <= 880 && opened.min[1] <= 440 && opened.min[0] > 0, JSON.stringify(opened));

  // ---- sign in with the fictional sample school's account ------------------------------------------------------------------------------------------------
  await page.locator('input[id^="field-username-"]').waitFor({ timeout: 60_000 });
  await page.locator('input[id^="field-username-"]').fill(USER);
  await page.locator('input[id^="field-password-"]').fill(PASS);
  await page.getByRole('button', { name: t('auth.login.submit'), exact: true }).click();
  await page.waitForURL('**/dashboard', { timeout: 60_000 });
  await page.locator('[data-testid=dashboard-figures]').waitFor({ timeout: 30_000 });

  // the pages to look at: every link of the side menu (printed pages have no menu and are not window-size dependent)
  const hrefs = [...new Set(await page.locator('nav a[href^="/"], aside a[href^="/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href'))))].filter((h) => !h.startsWith('/print'));
  check('LY-0 the side menu offers the main pages (at least 20) to look at', hrefs.length >= 20, `${hrefs.length} pages`);

  /** What sticks out of the window: an element wider than the window that is not inside a scrolling area; and whether the PAGE itself scrolls. */
  const measure = () => page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const scrollsX = (el) => { for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const o = getComputedStyle(n).overflowX; if ((o === 'auto' || o === 'scroll' || o === 'hidden') && n.getBoundingClientRect().right <= vw + 1) return true; } return false; };
    const offenders = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.right <= vw + 1) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.position === 'fixed') continue;
      if (scrollsX(el)) continue;
      offenders.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''} (right ${Math.round(r.right)} of ${vw})`);
      if (offenders.length >= 3) break;
    }
    return { vw, vh, pageScrollX: document.documentElement.scrollWidth > vw + 1, scrollWidth: document.documentElement.scrollWidth, pageScrollY: document.documentElement.scrollHeight > vh + 1, scrollHeight: document.documentElement.scrollHeight, offenders };
  });
  const goTo = async (href) => {
    await page.locator(`a[href="${href}"]`).first().click();
    await page.waitForLoadState('domcontentloaded');
    await page.locator('h1, h2').first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(600);
  };
  const collapsed = () => page.locator('.app-shell.is-collapsed').count().then((n) => n === 1);

  // start wide: the side menu is open
  await resize(1920, 1000);
  check('LY-menu-1 on a wide window (1920 px) the side menu is open', !(await collapsed()));

  for (const sc of SCENARIOS) {
    await resize(sc.w, sc.h);
    const narrow = sc.w < 1100;
    check(`LY-menu-${sc.id} ${sc.label} (${sc.w}x${sc.h}): the side menu is ${narrow ? 'collapsed to its icons by itself' : 'open'}`, (await collapsed()) === narrow);
    const bad = [];
    const tall = [];
    for (const href of hrefs) {
      try { await goTo(href); } catch (e) { bad.push(`${href}: could not open (${String(e.message).slice(0, 60)})`); continue; }
      const m = await measure();
      if (m.pageScrollX || m.offenders.length > 0) bad.push(`${href}: ${m.pageScrollX ? `page scrolls sideways (${m.scrollWidth} of ${m.vw}); ` : ''}${m.offenders.join(', ')}`);
      if (m.pageScrollY && !sc.allowPageScrollY) tall.push(`${href} (${m.scrollHeight} of ${m.vh})`);
      if (sc.shots.includes(href)) await page.screenshot({ path: path.join(outDir, `layout-${sc.id}-${href.replace(/\W+/g, '_').replace(/^_/, '')}.png`) });
    }
    check(`LY-${sc.id} ${sc.label} (${sc.w}x${sc.h}): all ${hrefs.length} pages fit the window width, no page scrolls sideways and nothing sticks out of it`, bad.length === 0, bad.slice(0, 6).join(' | '));
    if (!sc.allowPageScrollY) check(`LY-${sc.id}-tall ${sc.label}: no page needs a scroll bar on the page itself (the content area scrolls inside the shell)`, tall.length === 0, tall.slice(0, 6).join(' | '));
  }

  // the menu opens again when the window widens, and a person's own choice is kept
  await resize(1366, 689);
  check('LY-menu-back widening the window to 1366 px opens the side menu again', !(await collapsed()));
  await resize(1000, 600);
  check('LY-menu-narrow narrowing it to 1000 px collapses it again', await collapsed());
  await page.locator('.sidebar-toggle').first().click();
  await page.waitForTimeout(300);
  await resize(960, 600);
  check('LY-menu-own a person who opens the menu on a narrow window keeps it open while the window stays narrow', !(await collapsed()));

  check('LY-console no console error while looking at every page at every size', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
} catch (e) {
  failures++;
  console.log('FAIL  harness error: ' + (e.stack ?? e.message));
} finally {
  let leftoverJava = 0;
  try { leftoverJava = Number(readFileSync(path.join(data, 'config', 'backend.pid'), 'utf8')); } catch { /* a clean quit removed it */ }
  try { if (app) await app.close(); } catch { /* already gone */ }
  try { if (leftoverJava > 0) execFileSync('taskkill', ['/PID', String(leftoverJava), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
}
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
