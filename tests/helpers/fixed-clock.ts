import type { Clock } from "../../src/core/ports";

export interface FixedClock extends Clock {
  /** Moves the time forward by `ms`. */
  advance(ms: number): void;
  /** Sets the time to `t`, in milliseconds since the epoch. */
  set(t: number): void;
}

/** A `Clock` that stands still at `t` until a test moves it. */
export function fixedClock(t: number): FixedClock {
  let time = t;
  return {
    now: () => time,
    advance(ms) {
      time += ms;
    },
    set(next) {
      time = next;
    },
  };
}
