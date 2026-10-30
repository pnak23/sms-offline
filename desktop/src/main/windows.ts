import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import { APP_ORIGIN } from './protocol';

const staticDir = () => path.join(__dirname, 'static');
const safePrefs = { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false } as const;

export function createSplash(): BrowserWindow {
  const w = new BrowserWindow({
    width: 460, height: 300, frame: false, resizable: false, movable: true, show: false, alwaysOnTop: true, skipTaskbar: true,
    backgroundColor: '#ffffff', webPreferences: { ...safePrefs, devTools: false },
  });
  w.once('ready-to-show', () => w.show());
  void w.loadFile(path.join(staticDir(), 'splash.html'));
  return w;
}

export function createErrorWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 680, height: 460, resizable: false, minimizable: false, maximizable: false, autoHideMenuBar: true, show: false,
    backgroundColor: '#ffffff', title: 'School Management',
    webPreferences: { ...safePrefs, devTools: false, preload: path.join(__dirname, 'preload-error.cjs') },
  });
  w.removeMenu();
  w.once('ready-to-show', () => w.show());
  void w.loadFile(path.join(staticDir(), 'error.html'));
  return w;
}

export function createMainWindow(devUrl?: string): BrowserWindow {
  Menu.setApplicationMenu(null);
  const w = new BrowserWindow({
    width: 1366, height: 768, minWidth: 1200, minHeight: 650, show: false, autoHideMenuBar: true,
    backgroundColor: '#ffffff', title: 'School Management',   // white: Chromium paints this base colour in the @page margins of a PDF/printout
    webPreferences: { ...safePrefs, devTools: !app.isPackaged, preload: path.join(__dirname, 'preload.cjs') },
  });
  w.removeMenu();
  void w.loadURL(devUrl ?? `${APP_ORIGIN}/`);
  return w;
}
