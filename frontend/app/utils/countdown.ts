// A countdown that survives timer drift (it recomputes from a deadline) and is easy to test (injectable clock).
export interface CountdownClock {
  now(): number;
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

const realClock: CountdownClock = {
  now: () => Date.now(),
  setInterval: (handler, ms) => setInterval(handler, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

export interface Countdown {
  start(seconds: number): void;
  stop(): void;
  readonly remaining: number;
}

/** Calls `onTick` whenever the whole number of remaining seconds changes, and `onDone` once at zero. */
export function createCountdown(
  onTick: (remainingSeconds: number) => void,
  onDone: () => void,
  clock: CountdownClock = realClock,
): Countdown {
  let handle: unknown = null;
  let deadline = 0;
  let remaining = 0;

  const stop = () => {
    if (handle !== null) clock.clearInterval(handle);
    handle = null;
    remaining = 0;
  };

  const tick = () => {
    const next = Math.max(0, Math.ceil((deadline - clock.now()) / 1000));
    if (next !== remaining) {
      remaining = next;
      onTick(next);
    }
    if (next <= 0) {
      stop();
      onDone();
    }
  };

  return {
    start(seconds) {
      stop();
      if (!(seconds > 0)) {
        onDone();
        return;
      }
      deadline = clock.now() + seconds * 1000;
      remaining = Math.ceil(seconds);
      onTick(remaining);
      handle = clock.setInterval(tick, 250);
    },
    stop,
    get remaining() {
      return remaining;
    },
  };
}

/** m:ss, e.g. 65 -> "1:05". */
export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
