import { useAppStore } from '~/stores/app';
import { useRecoveryKeyStore } from '~/stores/recoveryKey';
import { decideRoute, ROUTES } from '~/utils/guards';

/**
 * The one route guard: every navigation re-reads /auth/status (a loopback call), so setup state, sign-in, an expired
 * session and the recovery-key obligation are always decided from the backend's truth (utils/guards.ts has the rules).
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { ensureReady } = useAppBootstrap();
  if (!(await ensureReady())) return; // the overlay explains; keep the page the user is on

  if (to.matched.length === 0) return navigateTo(ROUTES.home, { replace: true });

  const app = useAppStore();
  const target = decideRoute({
    status: app.status!,
    path: to.path,
    hasRecoveryKey: useRecoveryKeyStore().hasKey,
  });
  if (target) return navigateTo(target, { replace: true });
});
