import { app, BrowserWindow, Menu, screen } from 'electron';
import path from 'node:path';
import { product } from './product';
import { APP_ORIGIN } from './protocol';
import { planMainWindow } from './windowSize';

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
    backgroundColor: '#ffffff', title: product.shortName,
    webPreferences: { ...safePrefs, devTools: false, preload: path.join(__dirname, 'preload-error.cjs') },
  });
  w.removeMenu();
  w.once('ready-to-show', () => w.show());
  void w.loadFile(path.join(staticDir(), 'error.html'));
  return w;
}

export function createMainWindow(devUrl?: string): BrowserWindow {
  Menu.setApplicationMenu(null);
  // the size follows the screen (see windowSize.ts): never bigger than the work area, maximised on a laptop-sized one, never smaller than 880x440
  const plan = planMainWindow(screen.getPrimaryDisplay().workAreaSize);
  const w = new BrowserWindow({
    width: plan.width, height: plan.height, minWidth: plan.minWidth, minHeight: plan.minHeight, show: false, autoHideMenuBar: true,
    backgroundColor: '#ffffff', title: product.shortName,   // white: Chromium paints this base colour in the @page margins of a PDF/printout
    webPreferences: { ...safePrefs, devTools: !app.isPackaged, preload: path.join(__dirname, 'preload.cjs') },
  });
  w.removeMenu();
  if (plan.maximize) w.maximize();
  void w.loadURL(devUrl ?? `${APP_ORIGIN}/`);
  return w;
}
