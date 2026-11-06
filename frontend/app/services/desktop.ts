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

/** Save a file the user picks the place for (.xlsx, .pdf or .zip only; the shell checks the extension and size). */
export async function saveFile(defaultName: string, blob: Blob): Promise<{ saved: boolean }> {
  return getDesktop().saveFile({ defaultName, bytes: await blob.arrayBuffer() });
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

/** The user closed the window. Answer with quitApp() or cancelClose(). */
export function onCloseRequested(callback: () => void): () => void {
  return getDesktop().onCloseRequested(callback);
}

/** A backup is being made while the program closes. */
export function onClosing(callback: () => void): () => void {
  return getDesktop().onClosing(callback);
}

export function cancelClose(): Promise<void> {
  return getDesktop().cancelClose();
}

export function openBackupsFolder(): Promise<void> {
  return getDesktop().openBackupsFolder();
}

/** Shows a folder dialog and copies the backup there, proving the copy by its hash. */
export function copyBackupToFolder(id: string): Promise<DesktopBackupCopy> {
  return getDesktop().backup.copyToFolder({ id });
}

/** Shows a file dialog and copies the chosen zip into the backend's incoming folder. */
export function pickBackupForRestore(): Promise<DesktopBackupPick> {
  return getDesktop().backup.pickForRestore();
}

export function getDesktopConfig(): Promise<DesktopConfig> {
  return getDesktop().config.get();
}

export function updateDesktopConfig(patch: { preset?: DesktopPreset; disableGpu?: boolean }): Promise<DesktopConfig> {
  return getDesktop().config.update(toPlainData(patch));
}

/** Restarts the whole program (the backend closes cleanly first). */
export function relaunchApp(): Promise<void> {
  return getDesktop().relaunch();
}
