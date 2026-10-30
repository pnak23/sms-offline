import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { CH } from '../shared/channels';
import type { BackendManager } from './backend';
import { log } from './log';
import type { Paths } from './paths';
import { safeFileName } from './filename';
import { isTrustedUrl } from './security';

interface Deps {
  backend: BackendManager;
  paths: Paths;
  devUrl?: string;
  mainWindow: () => BrowserWindow | null;
}

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXT = new Set(['.xlsx', '.pdf', '.zip']);

const PrintArgs = z.object({ silent: z.boolean().optional() }).strict();
const PdfArgs = z.object({ defaultName: z.string().min(1).max(120) }).strict();
const FileArgs = z.object({
  defaultName: z.string().min(1).max(120),
  bytes: z.custom<ArrayBuffer | Uint8Array>((v) => v instanceof ArrayBuffer || ArrayBuffer.isView(v), 'bytes must be binary'),
}).strict();
const Diag = z.unknown().refine((v) => JSON.stringify(v ?? null).length < 1_000_000, 'report too large');

/** Electron's PrinterInfo has no default-printer flag, so ask Windows once (cached for the session; it rarely changes). */
let defaultPrinter: Promise<string | null> | null = null;
function windowsDefaultPrinter(): Promise<string | null> {
  defaultPrinter ??= new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_Printer | Where-Object { $_.Default }).Name'],
      { windowsHide: true, timeout: 8000 }, (err, stdout) => resolve(err ? null : (stdout.trim().split(/\r?\n/)[0] || null)));
  });
  return defaultPrinter;
}

export function registerIpc(d: Deps): void {
  /** Wraps a handler: sender must be OUR main window showing OUR page; arguments are validated with zod. */
  const secure = <S extends z.ZodTypeAny | undefined, R>(channel: string, schema: S, fn: (arg: S extends z.ZodTypeAny ? z.infer<S> : undefined, e: IpcMainInvokeEvent) => R | Promise<R>) =>
    ipcMain.handle(channel, async (e, raw) => {
      const win = d.mainWindow();
      if (!win || e.sender !== win.webContents || !isTrustedUrl(e.senderFrame?.url, d.devUrl)) {
        log.warn(`rejected IPC ${channel} from untrusted sender`);
        throw new Error('UNTRUSTED_SENDER');
      }
      const arg = schema ? schema.parse(raw) : undefined;
      return fn(arg as never, e);
    });

  secure(CH.getInfo, undefined, () => {
    if (d.backend.state !== 'ready') throw new Error('BACKEND_NOT_READY');
    return { version: app.getVersion(), backendBaseUrl: d.backend.baseUrl() };
  });
  secure(CH.restartBackend, undefined, async () => { await d.backend.restart(); });

  secure(CH.print, PrintArgs, (_a, e) => new Promise<{ ok: boolean }>((resolve) => {
    e.sender.print({ silent: false, printBackground: true }, (success) => resolve({ ok: success }));
  }));

  secure(CH.savePdf, PdfArgs, async (a, e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const name = safeFileName(a.defaultName, '.pdf');
    const res = await dialog.showSaveDialog(win!, { defaultPath: path.join(app.getPath('documents'), name), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (res.canceled || !res.filePath) return { saved: false };
    // The page's own @page rule decides size and margins (A4, 15 mm); backgrounds on so table shading prints.
    const pdf = await e.sender.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true });
    writeFileSync(res.filePath, pdf);
    log.info(`saved a PDF (${pdf.length} bytes)`);
    return { saved: true };
  });

  secure(CH.saveFile, FileArgs, async (a, e) => {
    const ext = path.extname(a.defaultName).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) throw new Error('EXTENSION_NOT_ALLOWED');
    const bytes = a.bytes instanceof ArrayBuffer ? new Uint8Array(a.bytes) : new Uint8Array(a.bytes.buffer, a.bytes.byteOffset, a.bytes.byteLength);
    if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('FILE_TOO_LARGE');
    const win = BrowserWindow.fromWebContents(e.sender);
    const res = await dialog.showSaveDialog(win!, { defaultPath: path.join(app.getPath('documents'), safeFileName(a.defaultName, ext)), filters: [{ name: ext.slice(1).toUpperCase(), extensions: [ext.slice(1)] }] });
    if (res.canceled || !res.filePath) return { saved: false };
    writeFileSync(res.filePath, bytes);
    return { saved: true };
  });

  secure(CH.printers, undefined, async (_a, e) => {
    const [printers, def] = await Promise.all([e.sender.getPrintersAsync(), windowsDefaultPrinter()]);
    return printers.map((p) => ({ name: p.name, isDefault: def !== null && p.name === def }));
  });

  secure(CH.metrics, undefined, async () => {
    const metrics = app.getAppMetrics();
    const electronMb = Math.round(metrics.reduce((s, m) => s + m.memory.workingSetSize, 0) / 1024);
    const backendMb = await d.backend.memoryMb();
    return { totalWorkingSetMb: electronMb + backendMb, electronMb, backendMb, processCount: metrics.length + (backendMb > 0 ? 1 : 0) };
  });

  secure(CH.exportDiagnostics, Diag, async (report, e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    const res = await dialog.showSaveDialog(win!, { defaultPath: path.join(d.paths.logsDir, 'diagnostics', `diagnostics_${stamp}.txt`), filters: [{ name: 'Text', extensions: ['txt'] }] });
    if (res.canceled || !res.filePath) return { saved: false };
    const tail = (f: string) => existsSync(f) ? readFileSync(f, 'utf8').split(/\r?\n/).slice(-300).join('\n') : '(missing)';
    const text = [
      '# School Management — diagnostics (no personal data is included)',
      `app ${app.getVersion()} | electron ${process.versions.electron} | chromium ${process.versions.chrome} | node ${process.versions.node}`,
      `os ${os.type()} ${os.release()} ${os.arch()} | ram ${Math.round(os.totalmem() / 1048576)} MB | cpus ${os.cpus().length}`,
      `backend ${JSON.stringify(d.backend.status())}`,
      '', '## health report (from the renderer)', JSON.stringify(report, null, 2),
      '', '## desktop.log (last 300 lines)', tail(path.join(d.paths.logsDir, 'desktop.log')),
      '', '## backend.log (last 300 lines)', tail(path.join(d.paths.logsDir, 'backend.log')),
    ].join('\n');
    writeFileSync(res.filePath, text, 'utf8');
    return { saved: true };
  });

  secure(CH.openLogs, undefined, async () => { await shell.openPath(d.paths.logsDir); });
  secure(CH.quit, undefined, () => { app.quit(); });
}

/** Start-up error window: three fixed actions, valid only from that window. */
export function registerErrorIpc(d: { window: () => BrowserWindow | null; code: () => string; paths: Paths; retry: () => void }): void {
  const own = (e: IpcMainInvokeEvent) => { const w = d.window(); if (!w || e.sender !== w.webContents) throw new Error('UNTRUSTED_SENDER'); };
  ipcMain.removeHandler(CH.error.getInfo); ipcMain.removeHandler(CH.error.retry); ipcMain.removeHandler(CH.error.openLogs); ipcMain.removeHandler(CH.error.quit);
  ipcMain.handle(CH.error.getInfo, (e) => { own(e); return { code: d.code(), logsDir: d.paths.logsDir }; });
  ipcMain.handle(CH.error.retry, (e) => { own(e); d.retry(); });
  ipcMain.handle(CH.error.openLogs, async (e) => { own(e); await shell.openPath(d.paths.logsDir); });
  ipcMain.handle(CH.error.quit, (e) => { own(e); app.quit(); });
}
