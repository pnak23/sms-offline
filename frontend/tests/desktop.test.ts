import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive, ref } from 'vue';
import { connectDesktop, DesktopUnavailableError, exportDiagnostics as exportDiagnostics_, getDesktop, resetDesktopConnection, toPlainData } from '~/services/desktop';
import { createDevConnection } from '~/services/devDesktop';

function fakeDesktop(overrides: Partial<DesktopApi> = {}): DesktopApi {
  return {
    getInfo: vi.fn().mockResolvedValue({ version: '1.2.3', backendBaseUrl: 'http://127.0.0.1:4242' }),
    onBackendStatus: vi.fn(() => () => undefined),
    onCloseRequested: vi.fn(() => () => undefined),
    onClosing: vi.fn(() => () => undefined),
    restartBackend: vi.fn().mockResolvedValue(undefined),
    printCurrentPage: vi.fn().mockResolvedValue({ ok: true }),
    savePdfOfCurrentPage: vi.fn().mockResolvedValue({ saved: true }),
    saveFile: vi.fn().mockResolvedValue({ saved: true }),
    printers: { list: vi.fn().mockResolvedValue([]) },
    metrics: { get: vi.fn().mockResolvedValue({ totalWorkingSetMb: 1, processCount: 1 }) },
    health: { exportDiagnostics: vi.fn().mockResolvedValue({ saved: true }) },
    backup: {
      copyToFolder: vi.fn().mockResolvedValue({ copied: false, reason: 'CANCELLED' }),
      pickForRestore: vi.fn().mockResolvedValue({ picked: false, reason: 'CANCELLED' }),
    },
    config: {
      get: vi.fn().mockResolvedValue({ preset: 'standard', disableGpu: false }),
      update: vi.fn().mockResolvedValue({ preset: 'standard', disableGpu: false }),
    },
    openLogsFolder: vi.fn().mockResolvedValue(undefined),
    openBackupsFolder: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue(undefined),
    cancelClose: vi.fn().mockResolvedValue(undefined),
    relaunch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  resetDesktopConnection();
});

afterEach(() => {
  delete (window as { desktop?: DesktopApi }).desktop;
  window.history.replaceState(null, '', '/');
});

describe('desktop bridge (Electron preload)', () => {
  it('uses window.desktop and reads the backend URL from getInfo(); it never adds a secret header itself', async () => {
    window.desktop = fakeDesktop();
    const connection = await connectDesktop();
    expect(connection.info).toEqual({ version: '1.2.3', backendBaseUrl: 'http://127.0.0.1:4242' });
    expect(connection.extraHeaders).toBeUndefined();
    expect(getDesktop()).toBe(window.desktop);
  });

  it('is unavailable without the bridge (production has no dev shim; here import.meta.dev is off)', async () => {
    await expect(connectDesktop()).rejects.toBeInstanceOf(DesktopUnavailableError);
    expect(() => getDesktop()).toThrow(DesktopUnavailableError);
  });

  it('even with ?devBackend in the URL, a build without the dev flag does not create a shim', async () => {
    window.history.replaceState(null, '', '/?devBackend=http://127.0.0.1:5000&devSecret=abc');
    await expect(connectDesktop()).rejects.toBeInstanceOf(DesktopUnavailableError);
  });
});

describe('arguments crossing the Electron bridge must be structured-cloneable', () => {
  it('a Vue reactive object is a Proxy that structuredClone rejects — the real shell failed on it', () => {
    const reactiveReport = reactive({ backend: { checks: [{ id: 'DATABASE', status: 'OK' }] }, printers: ref(['A4 printer']) });
    expect(() => structuredClone(reactiveReport)).toThrow();   // documents the failure mode (Electron: "An object could not be cloned")
  });

  it('exportDiagnostics hands the main process plain data, even when given reactive state, and keeps the content', async () => {
    const exportDiagnostics = vi.fn().mockResolvedValue({ saved: true });
    window.desktop = fakeDesktop({ health: { exportDiagnostics } });
    await connectDesktop();
    const report = reactive({ backend: { status: 'OK', checks: [{ id: 'FONTS', params: { families: ['Noto Sans Khmer'] } }] }, fontLoaded: ref(true), printers: ref([{ name: 'EPSON', isDefault: false }]) });
    await expect(exportDiagnostics_(report)).resolves.toEqual({ saved: true });
    const sent = exportDiagnostics.mock.calls[0]?.[0];
    expect(() => structuredClone(sent)).not.toThrow();
    expect(sent).toEqual({ backend: { status: 'OK', checks: [{ id: 'FONTS', params: { families: ['Noto Sans Khmer'] } }] }, fontLoaded: true, printers: [{ name: 'EPSON', isDefault: false }] });
  });

  it('toPlainData keeps undefined (optional arguments) and Khmer text', () => {
    expect(toPlainData(undefined)).toBeUndefined();
    expect(toPlainData({ name: 'សាលាបឋមសិក្សា ភូមិថ្មី' })).toEqual({ name: 'សាលាបឋមសិក្សា ភូមិថ្មី' });
  });
});

describe('dev shim (development only)', () => {
  it('reads devBackend/devSecret once, keeps them in sessionStorage, removes them from the address bar, and sends the secret header', async () => {
    window.history.replaceState(null, '', '/setup?devBackend=http://127.0.0.1:5123&devSecret=dev-secret-xyz&x=1');
    const dev = createDevConnection();
    expect(dev).not.toBeNull();
    expect(dev?.extraHeaders()).toEqual({ 'X-SMS-Launch-Secret': 'dev-secret-xyz' });
    expect((await dev?.desktop.getInfo())?.backendBaseUrl).toBe('http://127.0.0.1:5123');
    expect(window.location.search).toBe('?x=1');
    expect(window.location.search).not.toContain('devSecret');
    // a reload (no parameters any more) still works through sessionStorage
    expect(createDevConnection()?.extraHeaders()['X-SMS-Launch-Secret']).toBe('dev-secret-xyz');
  });

  it('refuses a backend that is not on loopback', () => {
    window.history.replaceState(null, '', '/?devBackend=http://evil.example.com:80&devSecret=abc');
    expect(createDevConnection()).toBeNull();
  });

  it('is null without parameters or stored values', () => {
    expect(createDevConnection()).toBeNull();
  });

  it('stubs the desktop methods: no printers, no metrics, print falls back to window.print()', async () => {
    window.history.replaceState(null, '', '/?devBackend=http://localhost:5124&devSecret=s');
    const desktop = createDevConnection()!.desktop;
    expect(await desktop.printers.list()).toEqual([]);
    await expect(desktop.metrics.get()).rejects.toThrow();
    const print = vi.fn();
    window.print = print; // happy-dom has no print()
    expect(await desktop.printCurrentPage()).toEqual({ ok: true });
    expect(print).toHaveBeenCalledOnce();
  });
});
