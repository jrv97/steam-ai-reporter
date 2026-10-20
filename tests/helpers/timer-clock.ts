import { vi } from "vitest";
import type { Clock } from "../../src/core/ports";

/** The start time of every fake-timer test: 2026-10-20T00:00:00Z. */
export const T0 = Date.UTC(2026, 9, 20);

/**
 * Fakes `setTimeout` and `Date` (not microtasks) from `T0`, and returns a `Clock` on the fake
 * `Date.now()`, so the clock and the timers move together under `vi.advanceTimersByTimeAsync`.
 * Call `vi.useRealTimers()` after the test.
 */
export function useTimerClock(): Clock {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: T0 });
  return { now: () => Date.now() };
}
