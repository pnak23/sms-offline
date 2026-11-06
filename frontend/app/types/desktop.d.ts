// The Electron preload exposes exactly this object as `window.desktop`. Keep it in sync with desktop/src/preload.
// This file is a global declaration script (no imports/exports) so the names below are visible everywhere.

interface BackendStatus {
  state: 'starting' | 'ready' | 'failed' | 'stopped';
  code?: string;
}

interface DesktopInfo {
  version: string;
  /** The shell's own components, for the About page. */
  electron?: string;
  chromium?: string;
  node?: string;
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

type DesktopPreset = 'standard' | 'low-memory';

interface DesktopConfig {
  preset: DesktopPreset;
  /** Hardware acceleration off: fewer effects, a little less memory. */
  disableGpu: boolean;
}

/** `reason` when nothing was copied: CANCELLED, NOT_FOUND, SAME_FOLDER, NO_SPACE, VERIFY_FAILED, COPY_FAILED. */
interface DesktopBackupCopy {
  copied: boolean;
  reason?: string;
  /** SHA-256 of the copy, proved equal to the original's. */
  sha256?: string;
  folderName?: string;
  /** The copy is on the same drive as the program's data: it does not survive that disk failing. */
  sameDrive?: boolean;
}

/** `reason` when nothing was staged: CANCELLED, NOT_ZIP, TOO_LARGE, NO_SPACE, COPY_FAILED. */
interface DesktopBackupPick {
  picked: boolean;
  reason?: string;
  /** The name of the copy in the backend's incoming folder, for POST /backups/restore/stage. */
  fileName?: string;
}

interface DesktopApi {
  getInfo(): Promise<DesktopInfo>;
  onBackendStatus(cb: (s: BackendStatus) => void): () => void;
  /** The user closed the window: answer with quit() or cancelClose() (no answer in 5 s and the program closes). */
  onCloseRequested(cb: () => void): () => void;
  /** A backup is being made while the program closes. */
  onClosing(cb: () => void): () => void;
  restartBackend(): Promise<void>;
  printCurrentPage(opts?: { silent?: boolean }): Promise<{ ok: boolean }>;
  savePdfOfCurrentPage(opts: { defaultName: string }): Promise<{ saved: boolean }>;
  /** .xlsx / .pdf / .zip only */
  saveFile(opts: { defaultName: string; bytes: ArrayBuffer }): Promise<{ saved: boolean }>;
  printers: { list(): Promise<DesktopPrinter[]> };
  metrics: { get(): Promise<DesktopMetrics> };
  health: { exportDiagnostics(report: unknown): Promise<{ saved: boolean }> };
  backup: {
    /** A folder dialog, then a copy that is proved by its hash. */
    copyToFolder(opts: { id: string }): Promise<DesktopBackupCopy>;
    /** A file dialog, then a copy into the backend's incoming folder. */
    pickForRestore(): Promise<DesktopBackupPick>;
  };
  config: {
    get(): Promise<DesktopConfig>;
    update(patch: { preset?: DesktopPreset; disableGpu?: boolean }): Promise<DesktopConfig>;
  };
  openLogsFolder(): Promise<void>;
  openBackupsFolder(): Promise<void>;
  quit(): Promise<void>;
  cancelClose(): Promise<void>;
  /** Restarts the whole program (a changed performance setting applies then). */
  relaunch(): Promise<void>;
}

interface Window {
  desktop?: DesktopApi;
}
