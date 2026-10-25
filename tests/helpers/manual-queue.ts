/** Callbacks a test runs by hand, for code that takes a `frame` or a `delay` option. */
export interface ManualQueue {
  /** Queues the callback, as a `frame` option. */
  readonly frame: (callback: () => void) => void;
  /** Queues the callback and returns its cancel, as a `delay` option; the time is ignored. */
  readonly delay: (callback: () => void, ms: number) => () => void;
  /** Runs what is queued now; a callback queued while they run waits for the next call. */
  run(): void;
  /** How many callbacks wait. */
  readonly size: number;
}

export function manualQueue(): ManualQueue {
  let queued: (() => void)[] = [];
  const add = (callback: () => void) => {
    queued.push(callback);
  };
  return {
    frame: add,
    delay(callback) {
      add(callback);
      return () => {
        queued = queued.filter((each) => each !== callback);
      };
    },
    run() {
      const due = queued;
      queued = [];
      for (const callback of due) {
        callback();
      }
    },
    get size() {
      return queued.length;
    },
  };
}
