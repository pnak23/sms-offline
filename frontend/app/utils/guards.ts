import type { AuthStatus } from '../types/api';

export const ROUTES = {
  home: '/',
  login: '/login',
  recover: '/recover',
  setup: '/setup',
  dashboard: '/dashboard',
  forcedRecoveryKey: '/security/recovery-key',
  printRecoveryKey: '/print/recovery-key',
  settingsSecurity: '/settings/security',
} as const;

export interface GuardInput {
  status: AuthStatus;
  path: string;
  /** A freshly issued recovery key is held in memory (wizard step 3, recovery, regeneration). */
  hasRecoveryKey: boolean;
}

// Pages that legitimately show a just-issued, not yet confirmed recovery key.
const KEY_FLOW_PATHS: ReadonlySet<string> = new Set([
  ROUTES.setup,
  ROUTES.forcedRecoveryKey,
  ROUTES.settingsSecurity,
  ROUTES.printRecoveryKey,
]);

/**
 * Where the app must send the user for the given backend status, or null when `path` is allowed.
 * Order matters: setup gate, then sign-in, then the recovery-key obligation, then the unfinished wizard.
 */
export function decideRoute({ status, path, hasRecoveryKey }: GuardInput): string | null {
  const to = (target: string) => (target === path ? null : target);

  if (status.setupRequired) return to(ROUTES.setup);

  if (!status.authenticated) {
    if (path === ROUTES.login || path === ROUTES.recover) return null;
    if (path === ROUTES.printRecoveryKey && hasRecoveryKey) return null; // key shown after "recover" while signed out
    return to(ROUTES.login);
  }

  if (status.recoveryKeyPending) {
    if (hasRecoveryKey && KEY_FLOW_PATHS.has(path) && (path !== ROUTES.setup || !status.setupCompleted)) return null;
    return to(ROUTES.forcedRecoveryKey);
  }

  if (path === ROUTES.printRecoveryKey && hasRecoveryKey) return null;
  if (!status.setupCompleted) return to(ROUTES.setup);

  const authOnlyPages: string[] = [
    ROUTES.home,
    ROUTES.login,
    ROUTES.recover,
    ROUTES.setup,
    ROUTES.forcedRecoveryKey,
    ROUTES.printRecoveryKey,
  ];
  return authOnlyPages.includes(path) ? ROUTES.dashboard : null;
}

/** First wizard step to show for a signed-in user: the server's saved step, but never before step 4 (steps 1-3 are done). */
export function resumeStep(savedStep: number): number {
  return Math.min(7, Math.max(4, Math.trunc(savedStep) || 4));
}
