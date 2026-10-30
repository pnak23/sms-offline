// Inactivity detection without polling: activity only stores a timestamp (cheap enough for mousemove), and a single
// timeout wakes up at the earliest moment the user could be idle, re-arming itself if there was activity meanwhile.
export interface IdleTimer {
  start(): void;
  stop(): void;
  /** Record user activity. */
  touch(): void;
  /** Change the limit (e.g. after the settings were loaded); re-arms when running. */
  setTimeoutMs(ms: number): void;
  readonly running: boolean;
}

export function createIdleTimer(initialTimeoutMs: number, onIdle: () => void): IdleTimer {
  let timeoutMs = initialTimeoutMs;
  let lastActivity = Date.now();
  let handle: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    if (handle !== null) clearTimeout(handle);
    handle = null;
  };

  const arm = (delay: number) => {
    clear();
    handle = setTimeout(check, Math.max(0, delay));
  };

  function check() {
    handle = null;
    const idleFor = Date.now() - lastActivity;
    if (idleFor >= timeoutMs) {
      onIdle();
      return;
    }
    arm(timeoutMs - idleFor);
  }

  return {
    start() {
      lastActivity = Date.now();
      arm(timeoutMs);
    },
    stop: clear,
    touch() {
      lastActivity = Date.now();
    },
    setTimeoutMs(ms) {
      timeoutMs = ms;
      if (handle !== null) arm(Math.max(0, timeoutMs - (Date.now() - lastActivity)));
    },
    get running() {
      return handle !== null;
    },
  };
}
