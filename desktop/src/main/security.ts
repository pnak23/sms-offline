import { app, session, type WebContents } from 'electron';
import type { BackendManager } from './backend';
import { APP_ORIGIN, inlineScriptHashes } from './protocol';
import { log } from './log';

/**
 * Electron hardening (docs §4.4–4.5):
 *  - the per-launch secret is added to requests for the local backend HERE, so page JavaScript never sees it;
 *  - a Content-Security-Policy with script hashes instead of 'unsafe-inline';
 *  - every permission request is denied; navigation and new windows are locked to the app itself.
 */
export function installSecurity(opts: { backend: BackendManager; webRoot: string; devUrl?: string }): void {
  const { backend, webRoot, devUrl } = opts;
  const ses = session.defaultSession;

  ses.webRequest.onBeforeSendHeaders({ urls: ['http://127.0.0.1/*'] }, (details, cb) => {
    const headers = { ...details.requestHeaders };
    if (backend.secret && details.url.startsWith(backend.baseUrl() + '/')) headers['X-SMS-Launch-Secret'] = backend.secret;
    cb({ requestHeaders: headers });
  });

  if (!devUrl) {                                     // the Nuxt dev server needs eval/websockets; production does not
    const hashes = inlineScriptHashes(webRoot);
    ses.webRequest.onHeadersReceived((details, cb) => {
      if (!details.url.startsWith(APP_ORIGIN + '/')) { cb({}); return; }
      const csp = [
        "default-src 'none'",
        `script-src 'self' ${hashes.join(' ')}`.trim(),
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        `connect-src 'self' ${backend.baseUrl()}`,
        "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
      ].join('; ');
      cb({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } });
    });
  }

  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);

  app.on('web-contents-created', (_e, wc: WebContents) => {
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('will-navigate', (e, url) => {
      const ok = url.startsWith(APP_ORIGIN + '/') || (!!devUrl && url.startsWith(devUrl)) || url.startsWith('file:') && wc.getURL().startsWith('file:');
      if (!ok) { e.preventDefault(); log.warn(`blocked navigation to ${url.split('?')[0]}`); }
    });
    wc.on('will-attach-webview', (e) => e.preventDefault());
  });
}

/** Only the real app page may use the privileged IPC surface. */
export function isTrustedUrl(url: string | undefined, devUrl?: string): boolean {
  if (!url) return false;
  return url.startsWith(APP_ORIGIN + '/') || (!!devUrl && url.startsWith(devUrl));
}
