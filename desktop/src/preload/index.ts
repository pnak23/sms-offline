import { contextBridge, ipcRenderer } from 'electron';
import { CH } from '../shared/channels';

interface BackendStatus { state: 'starting' | 'ready' | 'failed' | 'stopped'; code?: string }
type Preset = 'standard' | 'low-memory';

/**
 * The ENTIRE privileged surface the web UI gets (docs §4.6). Each function maps to one fixed channel; ipcRenderer itself is
 * never exposed. The main process re-validates the sender and every argument.
 */
contextBridge.exposeInMainWorld('desktop', {
  getInfo: (): Promise<{ version: string; backendBaseUrl: string }> => ipcRenderer.invoke(CH.getInfo),
  onBackendStatus: (cb: (s: BackendStatus) => void): (() => void) => {
    const listener = (_e: unknown, s: BackendStatus) => cb(s);
    ipcRenderer.on(CH.backendStatus, listener);
    return () => ipcRenderer.removeListener(CH.backendStatus, listener);
  },
  onCloseRequested: (cb: () => void): (() => void) => {
    const listener = () => cb();
    ipcRenderer.on(CH.closeRequested, listener);
    return () => ipcRenderer.removeListener(CH.closeRequested, listener);
  },
  onClosing: (cb: () => void): (() => void) => {
    const listener = () => cb();
    ipcRenderer.on(CH.closing, listener);
    return () => ipcRenderer.removeListener(CH.closing, listener);
  },
  restartBackend: (): Promise<void> => ipcRenderer.invoke(CH.restartBackend),
  printCurrentPage: (opts?: { silent?: boolean }): Promise<{ ok: boolean }> => ipcRenderer.invoke(CH.print, opts ?? {}),
  savePdfOfCurrentPage: (opts: { defaultName: string }): Promise<{ saved: boolean }> => ipcRenderer.invoke(CH.savePdf, opts),
  saveFile: (opts: { defaultName: string; bytes: ArrayBuffer }): Promise<{ saved: boolean }> => ipcRenderer.invoke(CH.saveFile, opts),
  printers: { list: (): Promise<{ name: string; isDefault: boolean }[]> => ipcRenderer.invoke(CH.printers) },
  metrics: { get: (): Promise<{ totalWorkingSetMb: number; processCount: number }> => ipcRenderer.invoke(CH.metrics) },
  health: { exportDiagnostics: (report: unknown): Promise<{ saved: boolean }> => ipcRenderer.invoke(CH.exportDiagnostics, report) },
  backup: {
    copyToFolder: (opts: { id: string }): Promise<{ copied: boolean; reason?: string; sha256?: string; folderName?: string; sameDrive?: boolean }> =>
      ipcRenderer.invoke(CH.backupCopy, opts),
    pickForRestore: (): Promise<{ picked: boolean; reason?: string; fileName?: string }> => ipcRenderer.invoke(CH.backupPick),
  },
  config: {
    get: (): Promise<{ preset: Preset; disableGpu: boolean }> => ipcRenderer.invoke(CH.configGet),
    update: (patch: { preset?: Preset; disableGpu?: boolean }): Promise<{ preset: Preset; disableGpu: boolean }> => ipcRenderer.invoke(CH.configUpdate, patch),
  },
  openLogsFolder: (): Promise<void> => ipcRenderer.invoke(CH.openLogs),
  openBackupsFolder: (): Promise<void> => ipcRenderer.invoke(CH.openBackups),
  quit: (): Promise<void> => ipcRenderer.invoke(CH.quit),
  cancelClose: (): Promise<void> => ipcRenderer.invoke(CH.cancelClose),
  relaunch: (): Promise<void> => ipcRenderer.invoke(CH.relaunch),
});
