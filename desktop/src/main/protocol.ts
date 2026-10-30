import { net, protocol } from 'electron';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { log } from './log';

export const APP_ORIGIN = 'app://school';

/** Must run before the app is ready. `standard` + `secure` give the UI a real origin (CORS, CSP, absolute paths). */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
}

/**
 * Serves the static Nuxt build from {@code webRoot} at app://school/ (docs D12). Path traversal is rejected; unknown
 * extension-less paths fall back to index.html so history-mode routing works after a reload.
 */
export function serveApp(webRoot: string): void {
  const root = path.normalize(webRoot + path.sep);
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'school') return new Response('Not found', { status: 404 });
    const rel = decodeURIComponent(url.pathname);
    let target = path.normalize(path.join(webRoot, rel));
    if (!(target + path.sep).startsWith(root)) return new Response('Forbidden', { status: 403 });
    const isFile = existsSync(target) && statSync(target).isFile();
    if (!isFile) {
      if (path.extname(rel) !== '') return new Response('Not found', { status: 404 });
      target = path.join(webRoot, 'index.html');
    }
    return net.fetch(pathToFileURL(target).toString());
  });
}

/**
 * Nuxt's SPA shell contains a small inline bootstrap script. Rather than allow 'unsafe-inline' scripts, we hash every
 * inline script found in the shell and put exactly those hashes into the Content-Security-Policy.
 */
export function inlineScriptHashes(webRoot: string): string[] {
  const hashes = new Set<string>();
  for (const name of ['index.html', '200.html']) {
    const file = path.join(webRoot, name);
    if (!existsSync(file)) continue;
    const html = readFileSync(file, 'utf8');
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const attrs = m[1] ?? '';
      const body = m[2] ?? '';
      if (/type=["']application\/json["']/i.test(attrs) || body.trim() === '') continue;   // data blocks are not executed
      hashes.add(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
    }
  }
  log.info(`CSP: ${hashes.size} inline script hash(es)`);
  return [...hashes];
}
