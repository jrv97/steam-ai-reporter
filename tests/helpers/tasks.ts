/** Lets every queued task run, so a late call or an unhandled rejection shows in the test. */
export function nextTask(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
