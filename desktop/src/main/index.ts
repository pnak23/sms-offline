import { app, type BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { CH } from '../shared/channels';
import { BackendManager } from './backend';
import { loadConfig } from './config';
import { registerErrorIpc, registerIpc } from './ipc';
import { initLog, log } from './log';
import { resolvePaths } from './paths';
import { registerAppScheme, serveApp } from './protocol';
import { installSecurity } from './security';
import { createErrorWindow, createMainWindow, createSplash } from './windows';

registerAppScheme();                                    // must happen before the app is ready
const devUrl = process.env.SMS_DEV_URL;                // e.g. http://localhost:3000 while developing the UI

start();

function start(): void {
  const paths = resolvePaths();
  app.setPath('userData', path.join(paths.configDir, 'electron'));   // keep everything in the one data folder
  // The lock is keyed on userData, so it must be requested AFTER the path is set: one instance per data folder.
  if (!app.requestSingleInstanceLock()) {
    app.quit();                                         // a second launch just focuses the first window (below)
    return;
  }
  initLog(paths.logsDir);
  const config = loadConfig(paths.configDir);
  if (config.desktop.disableGpu) app.disableHardwareAcceleration();
  log.info(`starting v${app.getVersion()} (packaged=${app.isPackaged}) data=${paths.dataDir}`);

  const backend = new BackendManager(paths, () => config);
  let mainWin: BrowserWindow | null = null;
  let splash: BrowserWindow | null = null;
  let errorWin: BrowserWindow | null = null;
  let failureCode = 'UNKNOWN';
  let quitting = false;
  let ready = false;

  backend.on('status', (s) => mainWin?.webContents.send(CH.backendStatus, s));
  // A restart normally keeps the port. If it had to change, the page's CSP and base URL are stale: reload the UI.
  backend.on('portChanged', () => mainWin?.webContents.reload());

  async function boot(): Promise<void> {
    splash = createSplash();                            // created synchronously: the window count never drops to zero on retry
    await backend.start();
    if (backend.state !== 'ready') { showError(backend.failureCode ?? 'UNKNOWN'); return; }
    if (!devUrl && !existsSync(path.join(paths.webRoot, 'index.html'))) { showError('UI_MISSING'); return; }
    if (!ready) {
      installSecurity({ backend, webRoot: paths.webRoot, devUrl });
      if (!devUrl) serveApp(paths.webRoot);
      ready = true;
    }
    mainWin = createMainWindow(devUrl);
    mainWin.once('ready-to-show', () => {
      splash?.close(); splash = null; mainWin?.show();
      log.info(`main window shown ${Math.round(process.uptime() * 1000)} ms after the process started`);
    });
    mainWin.on('closed', () => { mainWin = null; });
  }

  function showError(code: string): void {
    failureCode = code;
    log.error(`showing the start-up error window: ${code}`);
    if (splash) { splash.close(); splash = null; }
    errorWin = createErrorWindow();
    errorWin.on('closed', () => { errorWin = null; });
  }

  app.on('second-instance', () => {
    if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); }
  });
  app.on('window-all-closed', () => { if (!quitting) app.quit(); });
  app.on('before-quit', (e) => {                        // graceful: stop the backend (WAL checkpoint) before exiting
    if (quitting) return;
    quitting = true;
    e.preventDefault();
    void backend.stop().finally(() => app.exit(0));
  });
  process.on('uncaughtException', (err) => log.error(`uncaught exception: ${err.stack ?? err.message}`));

  void app.whenReady().then(() => {
    registerIpc({ backend, paths, devUrl, mainWindow: () => mainWin });
    registerErrorIpc({
      window: () => errorWin, code: () => failureCode, paths,
      retry: () => { void boot(); errorWin?.close(); },   // boot() opens the splash first, then the error window closes
    });
    return boot();
  });
}
