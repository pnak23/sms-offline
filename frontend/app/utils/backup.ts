import type { BackupItem, BackupKind } from '../types/api';

/** "12.3 MB": the unit letters stay Latin (they are the same on every Windows screen), the number follows the size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** Whole days between an ISO instant and now (never negative). */
export function daysSince(iso: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / 86_400_000));
}

export type BackupState = 'verified' | 'damaged' | 'unchecked';

/** A backup is "verified" while it was read back whole, "damaged" when it was found not to be, "unchecked" when never read back. */
export function backupState(item: Pick<BackupItem, 'verifiedAt' | 'verifyError'>): BackupState {
  if (item.verifyError) return 'damaged';
  return item.verifiedAt ? 'verified' : 'unchecked';
}

export const BACKUP_KINDS: BackupKind[] = ['MANUAL', 'AUTO', 'PRE_MIGRATION', 'PRE_RESTORE'];

/** The newest backup that is verified: what "copy to a USB stick" should offer first. */
export function newestVerified(items: BackupItem[]): BackupItem | null {
  return items.find((item) => backupState(item) === 'verified') ?? null;
}
