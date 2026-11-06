import { getDesktopConfig } from '~/services/desktop';
import { motionAllowed } from '~/utils/charts';

// Whether the dashboard's charts may animate: not when the person has asked their system for less motion, and not on the Low-memory preset. Until the program has answered which
// preset it is on, nothing animates (a Low-memory PC must never start an animation it should not have). Nothing is stored.
const preset = ref<string | null>(null);
const known = ref(false);
let asked = false;

export function useChartMotion() {
  const reduced = ref(false);
  onMounted(() => {
    const query = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined;
    reduced.value = !!query?.matches;
    query?.addEventListener?.('change', (event) => {
      reduced.value = event.matches;
    });
    if (!asked) {
      asked = true;
      try {
        getDesktopConfig()
          .then((config) => {
            preset.value = config.preset;
          })
          .catch(() => undefined)
          .finally(() => {
            known.value = true;
          });
      } catch {
        known.value = true;   // a browser without the desktop shell (development): nothing to ask
      }
    }
  });
  return computed(() => known.value && motionAllowed(reduced.value, preset.value));
}
