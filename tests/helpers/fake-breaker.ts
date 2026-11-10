import type { Breaker } from "../../src/core/detect/breaker";

/** A `Breaker` that never opens and records nothing. */
export function closedBreaker(): Breaker {
  return {
    isOpen: () => Promise.resolve(false),
    record: () => Promise.resolve(),
    pausedUntil: () => undefined,
  };
}
