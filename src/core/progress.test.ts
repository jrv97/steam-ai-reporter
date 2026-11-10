import { describe, expect, it, vi } from "vitest";
import { make } from "../../tests/helpers/factory";
import type { KindVerdicts } from "./kinds/verdicts";
import { createLoadProgress, followProgress, type LoadProgress } from "./progress";

const KNOWN = make.verdicts.full();
const LIMITED = make.verdicts.uniform("rate-limited");
const MISSING = make.verdicts.uniform("missing");

/** One answer: the index of the game among the three asked for, its verdicts, and a retry. */
type Answer = readonly [game: number, verdicts: KindVerdicts, retrying: boolean];

describe("createLoadProgress", () => {
  it.each<readonly [string, readonly Answer[], LoadProgress]>([
    ["nothing answered", [], { total: 3, answered: 0, unknown: 0 }],
    ["a known answer, stored ones included", [[0, KNOWN, false], [1, MISSING, false]], {
      total: 3,
      answered: 2,
      unknown: 0,
    }],
    ["a transient answer with a retry ahead", [[0, LIMITED, true]], {
      total: 3,
      answered: 0,
      unknown: 0,
    }],
    ["a transient answer with no retry left", [[0, LIMITED, true], [0, LIMITED, false]], {
      total: 3,
      answered: 1,
      unknown: 1,
    }],
    ["a retry that answered", [[0, LIMITED, false], [0, KNOWN, false]], {
      total: 3,
      answered: 1,
      unknown: 0,
    }],
  ])("counts %s", (_name, answers, expected) => {
    const ids = make.appIds(3);
    const progress = createLoadProgress(() => undefined);
    progress.asked([...ids, ...ids]);
    for (const [game, verdicts, retrying] of answers) {
      progress.answered(ids[game] ?? make.appId(), verdicts, retrying);
    }
    progress.asked(ids);
    expect(progress.snapshot()).toStrictEqual(expected);
  });

  it("carries the breaker's pause while it runs", () => {
    const until = make.time();
    expect(createLoadProgress(() => until).snapshot()).toStrictEqual({
      total: 0,
      answered: 0,
      unknown: 0,
      pausedUntil: until,
    });
  });

  it("tells each listener once per microtask, only when the progress changed", async () => {
    const ids = make.appIds(2);
    const progress = createLoadProgress(() => undefined);
    const listener = vi.fn();
    const unsubscribe = progress.subscribe(listener);
    progress.asked(ids);
    for (const id of ids) {
      progress.answered(id, KNOWN, false);
    }
    await Promise.resolve();
    progress.asked(ids);
    await Promise.resolve();
    unsubscribe();
    progress.asked(make.appIds(1));
    await Promise.resolve();
    expect(listener).toHaveBeenCalledExactlyOnceWith({ total: 2, answered: 2, unknown: 0 });
  });
});

describe("followProgress", () => {
  it("hears a running app's progress now and as it changes", async () => {
    const progress = createLoadProgress(() => undefined);
    const heard: (LoadProgress | undefined)[] = [];
    followProgress(Promise.resolve(progress)).subscribe((each) => heard.push(each));
    await Promise.resolve();
    progress.asked(make.appIds(1));
    await Promise.resolve();
    expect(heard).toStrictEqual([
      { total: 0, answered: 0, unknown: 0 },
      { total: 1, answered: 0, unknown: 0 },
    ]);
  });

  it.each<
    readonly [string, (unsubscribe: () => void) => void, readonly (LoadProgress | undefined)[]]
  >([
    ["hears no store page from an app that did not start", () => undefined, [undefined]],
    ["hears nothing once unsubscribed before the app starts", (unsubscribe) => {
      unsubscribe();
    }, []],
  ])("%s", async (_name, then, expected) => {
    const heard: (LoadProgress | undefined)[] = [];
    then(followProgress(Promise.resolve(undefined)).subscribe((each) => heard.push(each)));
    await Promise.resolve();
    expect(heard).toStrictEqual(expected);
  });
});
