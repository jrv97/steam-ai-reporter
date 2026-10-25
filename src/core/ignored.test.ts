import { describe, expect, it, vi } from "vitest";
import { appId } from "../../tests/helpers/app-ids";
import { fixedClock } from "../../tests/helpers/fixed-clock";
import { memoryStore } from "../../tests/helpers/memory-store";
import { isIgnored, loadIgnored } from "./ignored";
import { KIND_IDS } from "./kinds/id";
import { ALLOW_ALL, perScope } from "./settings/allow-data";
import { createAllowList } from "./settings/allow-list";

const quiet = { error: vi.fn() };

describe("loadIgnored", () => {
  it("holds the stored games of each scope", async () => {
    const allowList = createAllowList(memoryStore(), fixedClock(0));
    await allowList.add("drm", appId(10), "Ten");
    await allowList.add(ALLOW_ALL, appId(20), "Twenty");
    const ignored = await loadIgnored(allowList, quiet);
    expect([...ignored.drm]).toEqual([10]);
    expect([...ignored[ALLOW_ALL]]).toEqual([20]);
    expect([...ignored.ai]).toEqual([]);
  });

  it("logs a list that cannot be read and starts with none ignored", async () => {
    const problem = new Error();
    const ignored = await loadIgnored({
      list: () => Promise.reject(problem),
      add: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    }, quiet);
    expect(quiet.error).toHaveBeenCalledWith(problem);
    expect(Object.values(ignored).every((games) => games.size === 0)).toBe(true);
  });
});

describe("isIgnored", () => {
  const ignored = perScope(() => new Set<ReturnType<typeof appId>>());
  ignored.kernel.add(appId(1));
  ignored[ALLOW_ALL].add(appId(2));

  it("ignores a game for the kinds it was ignored for", () => {
    expect(isIgnored(ignored, appId(1), "kernel")).toBe(true);
    expect(isIgnored(ignored, appId(1), "ai")).toBe(false);
  });

  it("ignores a game ignored for all kinds in every kind", () => {
    expect(isIgnored(ignored, appId(2), "ai")).toBe(true);
    expect(isIgnored(ignored, appId(2), "pvp")).toBe(true);
  });

  it("ignores no other game", () => {
    expect(isIgnored(ignored, appId(3), "kernel")).toBe(false);
  });
});

describe("isIgnored for a DLC", () => {
  const BASE = appId(100);
  const DLC = appId(101);
  const fresh = () => perScope(() => new Set<ReturnType<typeof appId>>());

  it("follows a base game ignored for one kind, in that kind only", () => {
    const ignored = fresh();
    ignored.ai.add(BASE);
    expect(isIgnored(ignored, DLC, "ai", BASE)).toBe(true);
    expect(isIgnored(ignored, DLC, "pvp", BASE)).toBe(false);
    expect(isIgnored(ignored, DLC, "kernel", BASE)).toBe(false);
  });

  it("follows a base game ignored for all kinds, in every kind", () => {
    const ignored = fresh();
    ignored[ALLOW_ALL].add(BASE);
    for (const kind of KIND_IDS) {
      expect(isIgnored(ignored, DLC, kind, BASE)).toBe(true);
    }
  });

  it("behaves as before when the base game is not known", () => {
    const ignored = fresh();
    ignored[ALLOW_ALL].add(BASE);
    ignored.ai.add(BASE);
    expect(isIgnored(ignored, DLC, "ai")).toBe(false);
    expect(isIgnored(ignored, DLC, "ai", undefined)).toBe(false);
    expect(isIgnored(ignored, BASE, "ai")).toBe(true);
  });

  it("stays shown while its base game is not ignored", () => {
    const ignored = fresh();
    ignored.ai.add(appId(999));
    expect(isIgnored(ignored, DLC, "ai", BASE)).toBe(false);
  });

  it("ignores a DLC on its own entry, with or without a base game", () => {
    const ignored = fresh();
    ignored.pvp.add(DLC);
    expect(isIgnored(ignored, DLC, "pvp")).toBe(true);
    expect(isIgnored(ignored, DLC, "pvp", BASE)).toBe(true);
    expect(isIgnored(ignored, DLC, "ai", BASE)).toBe(false);
    expect(isIgnored(ignored, BASE, "pvp")).toBe(false);
  });

  it("does not ignore the base game because a DLC is ignored", () => {
    const ignored = fresh();
    ignored[ALLOW_ALL].add(DLC);
    expect(isIgnored(ignored, BASE, "ai")).toBe(false);
  });

  it("shows the DLC again after the base game stops being ignored", () => {
    const ignored = fresh();
    ignored.ai.add(BASE);
    expect(isIgnored(ignored, DLC, "ai", BASE)).toBe(true);
    ignored.ai.delete(BASE);
    expect(isIgnored(ignored, DLC, "ai", BASE)).toBe(false);
  });

  it("looks one level up only", () => {
    const ignored = fresh();
    ignored.ai.add(BASE);
    expect(isIgnored(ignored, appId(102), "ai", DLC)).toBe(false);
  });
});
