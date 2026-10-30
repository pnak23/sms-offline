import { useAppStore } from '~/stores/app';
import { useSessionStore } from '~/stores/session';
import { ROUTES } from '~/utils/guards';

/** Signs out (user menu, lock screen, forced recovery-key page): ends the session, leaves a notice, shows the sign-in page. */
export function useSignOut() {
  const session = useSessionStore();
  const app = useAppStore();
  const router = useRouter();

  return async function signOut(): Promise<void> {
    await session.logout();
    app.setNotice('SIGNED_OUT');
    await app.refreshStatus();
    await router.replace(ROUTES.login);
  };
}
