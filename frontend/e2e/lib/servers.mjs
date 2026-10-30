// Starts and stops the processes the walkthrough needs: the real backend (scripts/dev-backend.mjs), and either the
// Nuxt dev server or a tiny static server for .output/public. Every process it starts is stopped again at the end;
// it never touches java processes it did not start.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';

export const FRONTEND_DIR = path.resolve(import.meta.dirname, '..', '..');
export const ROOT_DIR = path.resolve(FRONTEND_DIR, '..');
export const UI_PORT = 3000; // the only dev origins the backend's CORS list allows are localhost:3000 and 127.0.0.1:3000
export const UI_ORIGIN = `http://localhost:${UI_PORT}`;
const SECRET = 'e2e-secret-0123456789abcdef';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function killTree(child) {
  if (!child || child.exitCode !== null || !child.pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGKILL');
}

export async function startBackend(dataDir) {
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });
  const child = spawn(process.execPath, [path.join(ROOT_DIR, 'scripts', 'dev-backend.mjs'), '--fresh', '--data', dataDir, '--secret', SECRET], {
    cwd: ROOT_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let log = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));

  const started = Date.now();
  let port = 0;
  while (Date.now() - started < 90_000) {
    const m = /API:\s+http:\/\/127\.0\.0\.1:(\d+)/.exec(log);
    if (m) {
      port = Number(m[1]);
      break;
    }
    if (child.exitCode !== null) throw new Error(`backend exited early:\n${log}`);
    await sleep(250);
  }
  if (!port) {
    killTree(child);
    throw new Error(`backend did not become ready in 90 s:\n${log}`);
  }
  const base = `http://127.0.0.1:${port}`;

  return {
    base,
    secret: SECRET,
    headers: { 'X-SMS-Launch-Secret': SECRET },
    async shutdown() {
      try {
        await fetch(`${base}/internal/shutdown`, { method: 'POST', headers: { 'X-SMS-Launch-Secret': SECRET } });
      } catch {
        /* already gone */
      }
      const t0 = Date.now();
      while (child.exitCode === null && Date.now() - t0 < 12_000) await sleep(200);
      if (child.exitCode === null) killTree(child);
    },
    get alive() {
      return child.exitCode === null;
    },
  };
}

async function waitForHttp(url, ms) {
  const started = Date.now();
  while (Date.now() - started < ms) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not yet */
    }
    await sleep(500);
  }
  throw new Error(`${url} did not answer within ${ms} ms`);
}

export async function startDevServer() {
  const nuxtBin = path.join(ROOT_DIR, 'node_modules', 'nuxt', 'bin', 'nuxt.mjs');
  const child = spawn(process.execPath, [nuxtBin, 'dev', '--port', String(UI_PORT), '--host', 'localhost'], {
    cwd: FRONTEND_DIR,
    env: { ...process.env, NUXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.resume();
  child.stderr.resume();
  await waitForHttp(UI_ORIGIN + '/', 180_000);
  return { stop: async () => killTree(child) };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/** Serves the generated site like the app:// protocol handler must: real files as-is, any other path -> 200.html. */
export async function startStaticServer() {
  const root = path.join(FRONTEND_DIR, '.output', 'public');
  if (!existsSync(path.join(root, '200.html'))) throw new Error('Run "npm run generate -w frontend" first (.output/public is missing).');
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', UI_ORIGIN);
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root) || !existsSync(file) || file === root || !path.extname(file)) file = path.join(root, '200.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise((resolve, reject) => server.listen(UI_PORT, 'localhost', resolve).on('error', reject));
  return { stop: async () => new Promise((resolve) => server.close(resolve)) };
}
