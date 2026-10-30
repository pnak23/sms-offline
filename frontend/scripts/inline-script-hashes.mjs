// Prints the Content-Security-Policy hash of every EXECUTABLE inline <script> in the generated site.
//
//   npm run generate -w frontend
//   node frontend/scripts/inline-script-hashes.mjs            # reads frontend/.output/public/{index,200,404}.html
//
// `nuxt generate` writes one inline script into index.html (it carries the runtime config). With `buildId` fixed in
// nuxt.config.ts its content, and so its hash, only changes when the config changes. The desktop shell can allow it with
//   script-src 'self' 'sha256-<hash printed here>'
// instead of 'unsafe-inline'. Inline JSON data blocks (type="application/json") are not executed and need no hash.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, '..', '.output', 'public'));
const pages = ['index.html', '200.html', '404.html'].map((name) => path.join(dir, name)).filter(existsSync);
if (pages.length === 0) {
  console.error(`No generated pages in ${dir}. Run "npm run generate -w frontend" first.`);
  process.exit(1);
}

const hashes = new Map();
for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const attrs = match[1] ?? '';
    const body = match[2] ?? '';
    if (/\bsrc\s*=/.test(attrs) || body.trim() === '') continue; // external scripts are covered by 'self'
    const type = /\btype\s*=\s*["']([^"']+)["']/.exec(attrs)?.[1];
    if (type && !/^(module|text\/javascript|application\/javascript)$/.test(type)) continue; // data blocks never run
    const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
    hashes.set(hash, [...(hashes.get(hash) ?? []), path.basename(file)]);
  }
}

for (const [hash, files] of hashes) console.log(`${hash}   ${[...new Set(files)].join(', ')}`);
if (hashes.size === 0) console.log('(no executable inline scripts)');
