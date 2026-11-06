import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

let file: string | null = null;
/** desktop.log rolls at 10 MB and keeps five older files (desktop.log.1 is the newest), like backend.log. */
const MAX_BYTES = 10 * 1024 * 1024;
const KEEP = 5;

/** Shifts desktop.log.N to .N+1 (the oldest is dropped) and the live file to .1. Exported for the test. */
export function rotate(logFile: string, keep = KEEP): void {
  rmSync(`${logFile}.${keep}`, { force: true });
  for (let i = keep - 1; i >= 1; i--) if (existsSync(`${logFile}.${i}`)) renameSync(`${logFile}.${i}`, `${logFile}.${i + 1}`);
  renameSync(logFile, `${logFile}.1`);
}

/** Must be called once the data directory is known. Until then messages go to stderr only. */
export function initLog(logsDir: string): void {
  mkdirSync(logsDir, { recursive: true });
  file = path.join(logsDir, 'desktop.log');
}

function write(level: string, msg: string): void {
  const line = `${new Date().toISOString()} ${level} ${msg}\n`;
  if (!file) { process.stderr.write(line); return; }
  try {
    if (existsSync(file) && statSync(file).size > MAX_BYTES) rotate(file);
    appendFileSync(file, line, 'utf8');
  } catch { process.stderr.write(line); }
}

// Rule: never log personal data, passwords, recovery keys or tokens. Log events, codes and timings only.
export const log = {
  info: (msg: string) => write('INFO ', msg),
  warn: (msg: string) => write('WARN ', msg),
  error: (msg: string) => write('ERROR', msg),
};
