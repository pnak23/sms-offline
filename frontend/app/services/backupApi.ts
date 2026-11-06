import type { BackupItem, BackupOverview, RestoreState, StagedRestore } from '../types/api';
import { http } from './http';

/**
 * Backups and restore. Paths never travel here: the backend only knows its own backups folder, and the files a USB stick holds are
 * copied by the desktop shell (services/desktop.ts: copyBackupToFolder, pickBackupForRestore).
 */
export const backupApi = {
  overview: () => http.get<BackupOverview>('/backups'),

  /** Makes a backup now and reads it back before answering. */
  create: () => http.post<BackupItem>('/backups'),

  /** Reads one backup back from the start; a damaged one stays listed with `verifyError`. */
  verify: (id: string) => http.post<BackupItem>(`/backups/${id}/verify`),

  remove: (id: string) => http.delete<void>(`/backups/${id}`),

  /** The shell copied the backup to a USB stick or folder and proved the copy: `sha256` is the hash of that copy. */
  recordCopy: (id: string, sha256: string) => http.post<BackupItem>(`/backups/${id}/external-copy`, { sha256 }),

  // Restore: usable before any account exists (a new PC), a session afterwards.
  restoreState: () => http.get<RestoreState>('/backups/restore'),

  /** Checks a file the shell copied into incoming/ (`fileName`) completely and unpacks it for restoring. */
  stageFile: (fileName: string) => http.post<StagedRestore>('/backups/restore/stage', { fileName }),

  /** The same for a backup that is already in the list. */
  stageListed: (backupId: string) => http.post<StagedRestore>('/backups/restore/stage', { backupId }),

  /** The user said yes. The swap itself happens when the backend restarts, before its database opens. */
  apply: () => http.post<StagedRestore>('/backups/restore/apply'),

  cancelStaged: () => http.delete<void>('/backups/restore'),
};
