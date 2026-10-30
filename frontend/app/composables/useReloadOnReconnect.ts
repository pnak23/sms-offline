import { useAppStore } from '~/stores/app';

/** Re-runs a page's data loading when the backend comes back after a runtime loss (the page itself stays mounted). */
export function useReloadOnReconnect(reload: () => void | Promise<void>): void {
  const app = useAppStore();
  watch(
    () => app.backendDown,
    (down, wasDown) => {
      if (!down && wasDown) void reload();
    },
  );
}
