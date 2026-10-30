import { contextBridge, ipcRenderer } from 'electron';
import { CH } from '../shared/channels';

/** Preload of the start-up error window only: three buttons and the failure code. */
contextBridge.exposeInMainWorld('errorApi', {
  getInfo: (): Promise<{ code: string; logsDir: string }> => ipcRenderer.invoke(CH.error.getInfo),
  retry: (): Promise<void> => ipcRenderer.invoke(CH.error.retry),
  openLogs: (): Promise<void> => ipcRenderer.invoke(CH.error.openLogs),
  quit: (): Promise<void> => ipcRenderer.invoke(CH.error.quit),
});
