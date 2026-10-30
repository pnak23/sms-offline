// The Electron preload exposes exactly this object as `window.desktop`. Keep it in sync with desktop/src/preload.
// This file is a global declaration script (no imports/exports) so the names below are visible everywhere.

interface BackendStatus {
  state: 'starting' | 'ready' | 'failed' | 'stopped';
  code?: string;
}

interface DesktopInfo {
  version: string;
  /** http://127.0.0.1:<port> - the launch secret is injected by Electron and never visible to the UI */
  backendBaseUrl: string;
}

interface DesktopPrinter {
  name: string;
  isDefault: boolean;
}

interface DesktopMetrics {
  totalWorkingSetMb: number;
  processCount: number;
}

interface DesktopApi {
  getInfo(): Promise<DesktopInfo>;
  onBackendStatus(cb: (s: BackendStatus) => void): () => void;
  restartBackend(): Promise<void>;
  printCurrentPage(opts?: { silent?: boolean }): Promise<{ ok: boolean }>;
  savePdfOfCurrentPage(opts: { defaultName: string }): Promise<{ saved: boolean }>;
  /** .xlsx / .pdf / .zip only */
  saveFile(opts: { defaultName: string; bytes: ArrayBuffer }): Promise<{ saved: boolean }>;
  printers: { list(): Promise<DesktopPrinter[]> };
  metrics: { get(): Promise<DesktopMetrics> };
  health: { exportDiagnostics(report: unknown): Promise<{ saved: boolean }> };
  openLogsFolder(): Promise<void>;
  quit(): Promise<void>;
}

interface Window {
  desktop?: DesktopApi;
}
