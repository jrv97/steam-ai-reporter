import { describe, expect, it, vi } from "vitest";
import { appId } from "../../tests/helpers/app-ids";
import { fixedClock } from "../../tests/helpers/fixed-clock";
import { memoryStore } from "../../tests/helpers/memory-store";
import { isIgnored, loadIgnored } from "./ignored";
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
