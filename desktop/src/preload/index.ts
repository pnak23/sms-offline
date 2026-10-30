import { contextBridge, ipcRenderer } from 'electron';
import { CH } from '../shared/channels';

interface BackendStatus { state: 'starting' | 'ready' | 'failed' | 'stopped'; code?: string }

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
  restartBackend: (): Promise<void> => ipcRenderer.invoke(CH.restartBackend),
  printCurrentPage: (opts?: { silent?: boolean }): Promise<{ ok: boolean }> => ipcRenderer.invoke(CH.print, opts ?? {}),
  savePdfOfCurrentPage: (opts: { defaultName: string }): Promise<{ saved: boolean }> => ipcRenderer.invoke(CH.savePdf, opts),
  saveFile: (opts: { defaultName: string; bytes: ArrayBuffer }): Promise<{ saved: boolean }> => ipcRenderer.invoke(CH.saveFile, opts),
  printers: { list: (): Promise<{ name: string; isDefault: boolean }[]> => ipcRenderer.invoke(CH.printers) },
  metrics: { get: (): Promise<{ totalWorkingSetMb: number; processCount: number }> => ipcRenderer.invoke(CH.metrics) },
  health: { exportDiagnostics: (report: unknown): Promise<{ saved: boolean }> => ipcRenderer.invoke(CH.exportDiagnostics, report) },
  openLogsFolder: (): Promise<void> => ipcRenderer.invoke(CH.openLogs),
  quit: (): Promise<void> => ipcRenderer.invoke(CH.quit),
});
