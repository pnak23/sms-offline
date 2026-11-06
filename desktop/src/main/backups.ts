import { createHash } from 'node:crypto';
import { createReadStream, existsSync, promises as fsp, statfsSync } from 'node:fs';
import path from 'node:path';

/**
 * The file-system half of backups, kept out of ipc.ts so it can be tested without Electron. The backend only ever touches the
 * managed backups/ folder and never receives a path from the page; copying to or from a USB stick or another folder happens
 * here, in the main process, with a folder the user chose in a native dialog.
 */

/** {@code SchoolBackup_YYYY-MM-DD_HH-mm-ss}: the only form of backup id the page can send. */
export const BACKUP_ID = /^SchoolBackup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/;
/** The backend refuses a backup larger than this anyway; checking here avoids copying a huge wrong file first. */
export const MAX_BACKUP_BYTES = 16 * 1024 ** 3;
const MARGIN = 1024 * 1024;

/** backups/<id>.zip (a manual one) or backups/auto/<id>.zip; null when the id is not a backup id or there is no such file. */
export function findBackupFile(dataDir: string, id: string): string | null {
  if (!BACKUP_ID.test(id)) return null;
  for (const dir of [path.join(dataDir, 'backups'), path.join(dataDir, 'backups', 'auto')]) {
    const file = path.join(dir, `${id}.zip`);
    if (existsSync(file)) return file;
  }
  return null;
}

export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file).on('data', (chunk) => hash.update(chunk)).on('error', reject).on('end', () => resolve(hash.digest('hex')));
  });
}

/** True when {@code child} is {@code parent} or inside it. */
export function isSameOrInside(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** A copy on the same drive letter as the data does not survive that disk failing, so it is not counted as "elsewhere". */
export function sameDrive(a: string, b: string): boolean {
  return path.parse(path.resolve(a)).root.toLowerCase() === path.parse(path.resolve(b)).root.toLowerCase();
}

export function freeBytes(dir: string): number | null {
  try {
    const s = statfsSync(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

/** A name in {@code folder} that does not exist yet: the file's own name first, then "name (2).zip", "name (3).zip"... Never overwrites. */
export function freeName(folder: string, fileName: string): string {
  const ext = path.extname(fileName);
  const stem = path.basename(fileName, ext);
  let candidate = path.join(folder, fileName);
  for (let i = 2; existsSync(candidate); i++) candidate = path.join(folder, `${stem} (${i})${ext}`);
  return candidate;
}

export type CopyResult =
  | { copied: true; sha256: string; target: string }
  | { copied: false; reason: 'NO_SPACE' | 'VERIFY_FAILED' | 'COPY_FAILED' };

/**
 * Copies {@code source} into {@code folder} and PROVES the copy: the SHA-256 of what was written is compared with the source's.
 * A copy that does not match is deleted and reported, never kept. A file with the same name and the same content that is
 * already there counts as the copy (nothing is duplicated); a different file with that name is never overwritten.
 */
export async function copyVerified(source: string, folder: string): Promise<CopyResult> {
  try {
    const size = (await fsp.stat(source)).size;
    const free = freeBytes(folder);
    const sourceHash = await sha256File(source);
    const same = path.join(folder, path.basename(source));
    if (existsSync(same) && (await sha256File(same)) === sourceHash) return { copied: true, sha256: sourceHash, target: same };
    if (free !== null && free < size + MARGIN) return { copied: false, reason: 'NO_SPACE' };
    const target = freeName(folder, path.basename(source));
    await fsp.copyFile(source, target);
    const copyHash = await sha256File(target);
    if (copyHash !== sourceHash) {
      await fsp.rm(target, { force: true });
      return { copied: false, reason: 'VERIFY_FAILED' };
    }
    return { copied: true, sha256: copyHash, target };
  } catch {
    return { copied: false, reason: 'COPY_FAILED' };
  }
}

/** A zip starts with "PK": a cheap check before copying a big wrong file into the data folder. */
export async function looksLikeZip(file: string): Promise<boolean> {
  const handle = await fsp.open(file, 'r');
  try {
    const head = Buffer.alloc(4);
    const { bytesRead } = await handle.read(head, 0, 4, 0);
    return bytesRead === 4 && head[0] === 0x50 && head[1] === 0x4b && (head[2] === 3 || head[2] === 5) && (head[3] === 4 || head[3] === 6);
  } finally {
    await handle.close();
  }
}

export type StageResult = { picked: true; fileName: string } | { picked: false; reason: 'NOT_ZIP' | 'TOO_LARGE' | 'NO_SPACE' | 'COPY_FAILED' };

/**
 * Copies the zip the user chose into backups/incoming/ under a name the backend accepts (incoming-<number>.zip). The backend then
 * verifies it completely before anything is staged; this only refuses what cannot possibly be a backup.
 */
export async function stageIncoming(dataDir: string, chosen: string, now = Date.now()): Promise<StageResult> {
  try {
    if (!(await looksLikeZip(chosen))) return { picked: false, reason: 'NOT_ZIP' };
    const size = (await fsp.stat(chosen)).size;
    if (size > MAX_BACKUP_BYTES) return { picked: false, reason: 'TOO_LARGE' };
    const incoming = path.join(dataDir, 'backups', 'incoming');
    await fsp.mkdir(incoming, { recursive: true });
    const free = freeBytes(incoming);
    if (free !== null && free < size * 2 + MARGIN) return { picked: false, reason: 'NO_SPACE' };   // the copy, and then the unpacked files
    const fileName = `incoming-${now}.zip`;
    await fsp.copyFile(chosen, path.join(incoming, fileName));
    return { picked: true, fileName };
  } catch {
    return { picked: false, reason: 'COPY_FAILED' };
  }
}
