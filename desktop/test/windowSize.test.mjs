// Unit tests for src/main/windowSize.ts: the window fits every screen of the target school laptop (14-inch Full HD at 100 %, 125 % and 150 % Windows scaling) and of a 1366x768 laptop.
// Run: node --test desktop/test/windowSize.test.mjs   (bundles the TypeScript with esbuild on the fly; no Electron needed)
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const work = mkdtempSync(path.join(tmpdir(), 'sms-win-test-'));
const out = path.join(work, 'windowSize.cjs');
await build({ entryPoints: [path.join(root, 'src/main/windowSize.ts')], outfile: out, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
const { planMainWindow, MIN_WIDTH, MIN_HEIGHT } = (await import(pathToFileURL(out).href)).default;
test.after(() => rmSync(work, { recursive: true, force: true }));

// the work area of a screen: its size in DIPs minus the 48-DIP Windows 11 taskbar
const workArea = (screenWidth, screenHeight, scale) => ({ width: Math.round(screenWidth / scale), height: Math.round(screenHeight / scale) - 48 });

test('Full HD at 100 %: the usual 1366x768 window, not maximised on such a big work area', () => {
  const plan = planMainWindow(workArea(1920, 1080, 1));
  assert.deepEqual([plan.width, plan.height], [1366, 768]);
  assert.equal(plan.maximize, false);
});

test('Full HD at 125 % and 150 % (the school laptop): it starts maximised and never larger than the work area', () => {
  for (const scale of [1.25, 1.5]) {
    const work = workArea(1920, 1080, scale);
    const plan = planMainWindow(work);
    assert.equal(plan.maximize, true, `scale ${scale}`);
    assert.ok(plan.width <= work.width && plan.height <= work.height, `scale ${scale}: ${plan.width}x${plan.height} in ${work.width}x${work.height}`);
  }
  assert.deepEqual(planMainWindow(workArea(1920, 1080, 1.5)), { width: 1280, height: 672, minWidth: MIN_WIDTH, minHeight: MIN_HEIGHT, maximize: true });
});

test('a 1366x768 laptop at 100 %, 125 % and 150 %: the window fits the work area and its minimum is never larger than it', () => {
  for (const scale of [1, 1.25, 1.5]) {
    const work = workArea(1366, 768, scale);
    const plan = planMainWindow(work);
    assert.ok(plan.width <= work.width && plan.height <= work.height, `scale ${scale}`);
    assert.ok(plan.minWidth <= plan.width && plan.minHeight <= plan.height, `scale ${scale}: the minimum ${plan.minWidth}x${plan.minHeight} must fit the window ${plan.width}x${plan.height}`);
    assert.equal(plan.maximize, true);
  }
});

test('the smallest window is 880x440 (it was 1200x650, which made every page scroll sideways below it)', () => {
  assert.equal(MIN_WIDTH, 880);
  assert.equal(MIN_HEIGHT, 440);
  const plan = planMainWindow({ width: 2560, height: 1392 });
  assert.deepEqual([plan.width, plan.height, plan.minWidth, plan.minHeight, plan.maximize], [1366, 768, 880, 440, false]);
});

test('a work area smaller than the minimum shrinks the minimum instead of overflowing the screen', () => {
  const plan = planMainWindow({ width: 800, height: 400 });
  assert.deepEqual([plan.width, plan.height, plan.minWidth, plan.minHeight], [800, 400, 800, 400]);
});
