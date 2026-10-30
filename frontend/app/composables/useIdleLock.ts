import { usePreferencesStore } from '~/stores/preferences';
import { useSessionStore } from '~/stores/session';
import { createIdleTimer } from '~/utils/idleTimer';

const ACTIVITY_EVENTS = ['pointerdown', 'mousemove', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Locks the UI after `ui.idleLockMinutes` without mouse, keyboard or touch input. Runs only while someone is signed in
 * and the screen is not already locked, so a locked or signed-out app has no listeners and no timer.
 */
export function useIdleLock(): void {
  const session = useSessionStore();
  const preferences = usePreferencesStore();
  const timer = createIdleTimer(preferences.idleLockMinutes * 60_000, () => session.lock());
  const touch = () => timer.touch();
  const shouldRun = computed(() => session.isAuthenticated && !session.locked);

  function start(): void {
    for (const type of ACTIVITY_EVENTS) window.addEventListener(type, touch, { capture: true, passive: true });
    timer.start();
  }

  function stop(): void {
    for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, touch, { capture: true });
    timer.stop();
  }

  watch(
    shouldRun,
    (running) => {
      if (running) start();
      else stop();
    },
    { immediate: true },
  );

  watch(
    () => preferences.idleLockMinutes,
    (minutes) => timer.setTimeoutMs(minutes * 60_000),
  );

  onScopeDispose(stop);
}
