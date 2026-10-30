import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';

let file: string | null = null;
const MAX_BYTES = 2 * 1024 * 1024;

/** Must be called once the data directory is known. Until then messages go to stderr only. */
export function initLog(logsDir: string): void {
  mkdirSync(logsDir, { recursive: true });
  file = path.join(logsDir, 'desktop.log');
}

function write(level: string, msg: string): void {
  const line = `${new Date().toISOString()} ${level} ${msg}\n`;
  if (!file) { process.stderr.write(line); return; }
  try {
    if (existsSync(file) && statSync(file).size > MAX_BYTES) renameSync(file, file + '.1');
    appendFileSync(file, line, 'utf8');
  } catch { process.stderr.write(line); }
}

// Rule: never log personal data, passwords, recovery keys or tokens. Log events, codes and timings only.
export const log = {
  info: (msg: string) => write('INFO ', msg),
  warn: (msg: string) => write('WARN ', msg),
  error: (msg: string) => write('ERROR', msg),
};
