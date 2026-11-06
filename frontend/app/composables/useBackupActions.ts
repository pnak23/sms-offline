import { backupApi } from '~/services/backupApi';
import { copyBackupToFolder } from '~/services/desktop';
import type { BackupItem } from '~/types/api';

/** recorded: copied, proved and noted; notElsewhere: copied but on the same drive as the data (not counted); cancelled: no folder chosen. */
export type CopyOutcome = 'recorded' | 'notElsewhere' | 'cancelled' | 'failed';

/** What the backup page and the exit prompt both do: make a backup, and copy one to a USB stick with the copy proved. */
export function useBackupActions() {
  const { t, te } = useI18n();
  const { messageFor } = useApiError();
  const notify = useNotify();

  /**
   * The shell shows a folder dialog, copies the backup and compares the SHA-256 of the copy with the original's; only then is the
   * backend told, so "last copied" is never recorded for a copy that was not proved.
   */
  async function copyToUsb(id: string): Promise<CopyOutcome> {
    let result: DesktopBackupCopy;
    try {
      result = await copyBackupToFolder(id);
    } catch {
      notify.error(t('backup.copy.reason.COPY_FAILED'));
      return 'failed';
    }
    if (!result.copied) {
      if (result.reason === 'CANCELLED') return 'cancelled';
      const key = `backup.copy.reason.${result.reason ?? 'COPY_FAILED'}`;
      notify.error(t(te(key) ? key : 'backup.copy.reason.COPY_FAILED'));
      return 'failed';
    }
    if (result.sameDrive) {
      notify.warning(t('backup.copy.sameDrive', { folder: result.folderName ?? '' }));
      return 'notElsewhere';
    }
    try {
      await backupApi.recordCopy(id, result.sha256 ?? '');
    } catch (error) {
      notify.error(messageFor(error));
      return 'failed';
    }
    notify.success(t('backup.copy.done', { folder: result.folderName ?? '' }));
    return 'recorded';
  }

  /** A manual backup, read back before it is reported as made. Null when it failed (the message was shown). */
  async function createNow(): Promise<BackupItem | null> {
    try {
      const item = await backupApi.create();
      notify.success(t('backup.created'));
      return item;
    } catch (error) {
      notify.error(messageFor(error));
      return null;
    }
  }

  return { copyToUsb, createNow };
}
