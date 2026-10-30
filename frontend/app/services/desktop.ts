/**
 * Typed access to the Electron preload bridge (`window.desktop`, see types/desktop.d.ts).
 *
 * In a plain browser during development (`import.meta.dev` and no `window.desktop`) a small shim from
 * ./devDesktop.ts is used instead; that module is behind `import.meta.dev`, so production builds do not contain it.
 */
export class DesktopUnavailableError extends Error {
  constructor() {
    super('DESKTOP_BRIDGE_MISSING');
    this.name = 'DesktopUnavailableError';
  }
}

export interface DesktopConnection {
  desktop: DesktopApi;
  info: DesktopInfo;
  /** Headers every API request needs besides the Bearer token (only the dev shim has any). */
  extraHeaders?: () => Record<string, string>;
}

let connection: DesktopConnection | null = null;

export async function connectDesktop(): Promise<DesktopConnection> {
  if (connection) return connection;

  if (typeof window !== 'undefined' && window.desktop) {
    const desktop = window.desktop;
    connection = { desktop, info: await desktop.getInfo() };
    return connection;
  }

  if (import.meta.dev) {
    const dev = await import('./devDesktop');
    const found = dev.createDevConnection();
    if (found) {
      connection = { desktop: found.desktop, info: await found.desktop.getInfo(), extraHeaders: found.extraHeaders };
      return connection;
    }
  }

  throw new DesktopUnavailableError();
}

/** The connected bridge. Call `connectDesktop()` first (the route middleware does). */
export function getDesktop(): DesktopApi {
  if (!connection) throw new DesktopUnavailableError();
  return connection.desktop;
}

export function isDesktopConnected(): boolean {
  return connection !== null;
}

/** Forget the connection (tests). */
export function resetDesktopConnection(): void {
  connection = null;
}

export function onBackendStatus(callback: (status: BackendStatus) => void): () => void {
  return getDesktop().onBackendStatus(callback);
}

export function restartBackend(): Promise<void> {
  return getDesktop().restartBackend();
}

export function printCurrentPage(opts?: { silent?: boolean }): Promise<{ ok: boolean }> {
  return getDesktop().printCurrentPage(toPlainData(opts));
}

export function savePdfOfCurrentPage(defaultName: string): Promise<{ saved: boolean }> {
  return getDesktop().savePdfOfCurrentPage({ defaultName });
}

export function listPrinters(): Promise<DesktopPrinter[]> {
  return getDesktop().printers.list();
}

export function getAppMetrics(): Promise<DesktopMetrics> {
  return getDesktop().metrics.get();
}

/**
 * Everything sent to the Electron main process travels over IPC, which uses the structured-clone algorithm. A Vue reactive
 * object is a Proxy and CANNOT be cloned ("An object could not be cloned") — a bug the mocked browser walkthrough could not
 * show and the real shell did. Arguments are therefore reduced to plain JSON data before they cross the bridge.
 */
export function toPlainData<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

export function exportDiagnostics(report: unknown): Promise<{ saved: boolean }> {
  return getDesktop().health.exportDiagnostics(toPlainData(report));
}

export function openLogsFolder(): Promise<void> {
  return getDesktop().openLogsFolder();
}

export function quitApp(): Promise<void> {
  return getDesktop().quit();
}
