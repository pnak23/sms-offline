// DEVELOPMENT ONLY. Imported dynamically behind `import.meta.dev` (services/desktop.ts), so it is absent from production.
//
// Lets the UI run in a normal browser against `node scripts/dev-backend.mjs`:
//   http://localhost:3000/?devBackend=http://127.0.0.1:PORT&devSecret=SECRET
// The values are read once, kept in sessionStorage (so reloads work) and removed from the address bar.
// The launch secret goes out as X-SMS-Launch-Secret, which Electron's main process does in the real app.

const STORAGE_KEY = 'sms.dev.connection';
const SECRET_HEADER = 'X-SMS-Launch-Secret';

interface DevConnectionData {
  backend: string;
  secret: string;
}

function isLoopbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
  } catch {
    return false;
  }
}

function readConnection(): DevConnectionData | null {
  const params = new URLSearchParams(window.location.search);
  const backend = params.get('devBackend');
  const secret = params.get('devSecret');
  if (backend && secret && isLoopbackUrl(backend)) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ backend: backend.replace(/\/+$/, ''), secret }));
    params.delete('devBackend');
    params.delete('devSecret');
    const query = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null') as DevConnectionData | null;
    return stored && isLoopbackUrl(stored.backend) && stored.secret ? stored : null;
  } catch {
    return null;
  }
}

function createDevDesktop(backend: string): DesktopApi {
  const unavailable = (what: string) => Promise.reject(new Error(`${what} is only available inside the desktop app`));
  return {
    getInfo: () => Promise.resolve({ version: 'dev', backendBaseUrl: backend }),
    onBackendStatus: () => () => undefined,
    onCloseRequested: () => () => undefined,
    onClosing: () => () => undefined,
    restartBackend: () => unavailable('restartBackend'),
    printCurrentPage: () => {
      window.print();
      return Promise.resolve({ ok: true });
    },
    savePdfOfCurrentPage: () => Promise.resolve({ saved: false }),
    saveFile: () => Promise.resolve({ saved: false }),
    printers: { list: () => Promise.resolve([]) },
    metrics: { get: () => unavailable('metrics') },
    health: { exportDiagnostics: () => Promise.resolve({ saved: false }) },
    backup: {
      copyToFolder: () => Promise.resolve({ copied: false, reason: 'CANCELLED' }),
      pickForRestore: () => Promise.resolve({ picked: false, reason: 'CANCELLED' }),
    },
    config: {
      get: () => Promise.resolve({ preset: 'standard', disableGpu: false }),
      update: (patch) => Promise.resolve({ preset: patch.preset ?? 'standard', disableGpu: patch.disableGpu ?? false }),
    },
    openLogsFolder: () => Promise.resolve(),
    openBackupsFolder: () => Promise.resolve(),
    quit: () => Promise.resolve(),
    cancelClose: () => Promise.resolve(),
    relaunch: () => unavailable('relaunch'),
  };
}

export function createDevConnection(): { desktop: DesktopApi; extraHeaders: () => Record<string, string> } | null {
  const data = readConnection();
  if (!data) return null;
  return { desktop: createDevDesktop(data.backend), extraHeaders: () => ({ [SECRET_HEADER]: data.secret }) };
}
