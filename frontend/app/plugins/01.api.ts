import type { Pinia } from 'pinia';
import { http } from '~/services/http';
import { useAppStore } from '~/stores/app';
import { useSessionStore } from '~/stores/session';
import { ROUTES } from '~/utils/guards';

/** Wires the HTTP client's reactions to the stores and the router (401 -> sign-in, no backend -> overlay). */
export default defineNuxtPlugin((nuxtApp) => {
  const pinia = nuxtApp.$pinia as Pinia;
  const router = useRouter();

  http.configure({
    getToken: () => useSessionStore(pinia).token,

    onUnauthenticated: () => {
      const session = useSessionStore(pinia);
      if (!session.isAuthenticated) return; // nothing to expire; the route guard already handles signed-out pages
      session.clear();
      useAppStore(pinia).setNotice('SESSION_EXPIRED');
      if (router.currentRoute.value.path !== ROUTES.login) void router.replace(ROUTES.login);
    },

    onSetupRequired: () => {
      void useAppStore(pinia)
        .refreshStatus()
        .then(() => router.replace(ROUTES.setup));
    },

    onNetworkError: () => {
      useAppStore(pinia).markBackendDown('NETWORK_ERROR');
    },
  });
});
