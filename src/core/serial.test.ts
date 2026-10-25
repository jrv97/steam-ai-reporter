import { describe, expect, it } from "vitest";
import { createSerial } from "./serial";

/** A promise the test settles by hand. */
function gate() {
  let open = (): void => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

describe("createSerial", () => {
  it("starts a task only when the one before it has settled", async () => {
    const serial = createSerial();
    const log: string[] = [];
    const first = gate();
    const one = serial(async () => {
      log.push("one starts");
      await first.opened;
      log.push("one ends");
    });
    const two = serial(() => {
      log.push("two starts");
      return Promise.resolve();
    });
    await Promise.resolve();
    expect(log).toEqual(["one starts"]);
    first.open();
    await Promise.all([one, two]);
    expect(log).toEqual(["one starts", "one ends", "two starts"]);
  });

  it("hands each task's result to its own caller", async () => {
    const serial = createSerial();
    expect(await Promise.all([serial(() => Promise.resolve(1)), serial(() => Promise.resolve(2))]))
      .toEqual([1, 2]);
  });

  it("rejects the failed task and still runs the next one", async () => {
    const serial = createSerial();
    const failed = serial(() => Promise.reject(new Error()));
    const next = serial(() => Promise.resolve("ran"));
    await expect(failed).rejects.toBeInstanceOf(Error);
    expect(await next).toBe("ran");
  });
});
