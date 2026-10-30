import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCountdown, formatCountdown } from '~/utils/countdown';
import { createIdleTimer } from '~/utils/idleTimer';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('countdown (account lock)', () => {
  it('ticks down once per second and then reports done', () => {
    const ticks: number[] = [];
    const done = vi.fn();
    const countdown = createCountdown((s) => ticks.push(s), done);
    countdown.start(3);
    expect(ticks).toEqual([3]);
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1000);
    expect(ticks).toEqual([3, 2, 1]);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(ticks).toEqual([3, 2, 1, 0]);
    expect(done).toHaveBeenCalledTimes(1);
    expect(countdown.remaining).toBe(0);
  });

  it('is based on the deadline, so a stalled timer catches up instead of drifting', () => {
    const ticks: number[] = [];
    const countdown = createCountdown((s) => ticks.push(s), () => undefined);
    countdown.start(60);
    vi.advanceTimersByTime(45_000);
    expect(ticks.at(-1)).toBe(15);
  });

  it('restarting replaces the previous countdown', () => {
    const done = vi.fn();
    const ticks: number[] = [];
    const countdown = createCountdown((s) => ticks.push(s), done);
    countdown.start(5);
    countdown.start(2);
    vi.advanceTimersByTime(2000);
    expect(done).toHaveBeenCalledTimes(1);
    expect(ticks.at(-1)).toBe(0);
  });

  it('stop cancels without calling done', () => {
    const done = vi.fn();
    const countdown = createCountdown(() => undefined, done);
    countdown.start(5);
    countdown.stop();
    vi.advanceTimersByTime(10_000);
    expect(done).not.toHaveBeenCalled();
  });

  it('finishes immediately for zero or negative seconds', () => {
    const done = vi.fn();
    createCountdown(() => undefined, done).start(0);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('formats m:ss', () => {
    expect(formatCountdown(65)).toBe('1:05');
    expect(formatCountdown(9)).toBe('0:09');
    expect(formatCountdown(900)).toBe('15:00');
    expect(formatCountdown(-3)).toBe('0:00');
  });
});

describe('idle timer (lock screen)', () => {
  it('fires after the idle period without activity', () => {
    const onIdle = vi.fn();
    const timer = createIdleTimer(10 * 60_000, onIdle);
    timer.start();
    vi.advanceTimersByTime(10 * 60_000 - 1);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('activity postpones the lock: it fires one full period after the LAST activity', () => {
    const onIdle = vi.fn();
    const timer = createIdleTimer(10_000, onIdle);
    timer.start();
    vi.advanceTimersByTime(9_000);
    timer.touch();
    vi.advanceTimersByTime(9_000);
    expect(onIdle).not.toHaveBeenCalled();
    timer.touch();
    vi.advanceTimersByTime(9_999);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('does not poll: a touch alone never creates timers', () => {
    const timer = createIdleTimer(10_000, () => undefined);
    timer.start();
    const pending = vi.getTimerCount();
    for (let i = 0; i < 1000; i++) timer.touch();
    expect(vi.getTimerCount()).toBe(pending);
  });

  it('stop cancels the lock and can be restarted', () => {
    const onIdle = vi.fn();
    const timer = createIdleTimer(5_000, onIdle);
    timer.start();
    timer.stop();
    expect(timer.running).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(onIdle).not.toHaveBeenCalled();
    timer.start();
    vi.advanceTimersByTime(5_000);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('applies a changed limit (settings loaded after sign-in) to the running timer', () => {
    const onIdle = vi.fn();
    const timer = createIdleTimer(10 * 60_000, onIdle);
    timer.start();
    vi.advanceTimersByTime(60_000);
    timer.setTimeoutMs(2 * 60_000); // user preference: 2 minutes; 1 minute has already passed
    vi.advanceTimersByTime(60_000);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('locks at once when the limit is already exceeded after a long suspend', () => {
    const onIdle = vi.fn();
    const timer = createIdleTimer(5_000, onIdle);
    timer.start();
    vi.setSystemTime(Date.now() + 60 * 60_000); // PC slept for an hour
    vi.advanceTimersByTime(5_000);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });
});
