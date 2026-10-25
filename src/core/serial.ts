/** Runs the tasks it is given one after another. A task that fails does not stop the next. */
export type Serial = <T>(task: () => Promise<T>) => Promise<T>;

/** A queue of one: each task starts when the one before it has settled. */
export function createSerial(): Serial {
  let tail: Promise<unknown> = Promise.resolve();
  return (task) => {
    const result = tail.then(task);
    tail = result.catch(() => undefined);
    return result;
  };
}
