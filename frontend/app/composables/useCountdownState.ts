import { createCountdown, formatCountdown } from '~/utils/countdown';

/** A reactive countdown (e.g. "locked for 0:42"); stops when the component unmounts. */
export function useCountdownState() {
  const remaining = ref(0);
  const countdown = createCountdown(
    (seconds) => {
      remaining.value = seconds;
    },
    () => {
      remaining.value = 0;
    },
  );

  const active = computed(() => remaining.value > 0);
  const label = computed(() => formatCountdown(remaining.value));

  onScopeDispose(() => countdown.stop());

  return {
    remaining,
    active,
    label,
    start: (seconds: number) => countdown.start(seconds),
    stop: () => {
      countdown.stop();
      remaining.value = 0;
    },
  };
}
