import { onBackendStatus, restartBackend } from '~/services/desktop';
import { useAppStore } from '~/stores/app';

let unsubscribeBackendStatus: (() => void) | null = null;

/**
 * Start-up and recovery of the connection to the backend: find it through the desktop bridge, read /auth/status,
 * and follow the shell's own backend status events (runtime loss -> overlay; back to "ready" -> overlay clears).
 */
export function useAppBootstrap() {
  const app = useAppStore();

  function followBackendStatus(): void {
    if (unsubscribeBackendStatus) return;
    unsubscribeBackendStatus = onBackendStatus((status) => {
      if (status.state === 'failed' || status.state === 'stopped') app.markBackendDown(status.code ?? 'BACKEND_STOPPED');
      else if (status.state === 'starting' && app.backendDown) app.markBackendDown('BACKEND_STARTING');
      else if (status.state === 'ready' && app.backendDown) void ensureReady();
    });
  }

  /** True when the backend answered and `app.status` is fresh. */
  async function ensureReady(): Promise<boolean> {
    if (!(await app.connect())) return false;
    followBackendStatus();
    return (await app.refreshStatus()) !== null;
  }

  /** The overlay's "Try again". */
  async function retry(): Promise<boolean> {
    return ensureReady();
  }

  /** The overlay's "Restart": asks the shell to restart the backend process, then tries again. */
  async function restart(): Promise<boolean> {
    try {
      await restartBackend();
    } catch {
      // not available in a plain browser; fall through to a normal retry
    }
    return ensureReady();
  }

  return { ensureReady, retry, restart };
}
