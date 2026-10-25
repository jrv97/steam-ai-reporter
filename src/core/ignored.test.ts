import { describe, expect, it, vi } from "vitest";
import { appId } from "../../tests/helpers/app-ids";
import { fixedClock } from "../../tests/helpers/fixed-clock";
import { ignoredGames } from "../../tests/helpers/ignored";
import { memoryStore } from "../../tests/helpers/memory-store";
import { isIgnored, loadIgnored } from "./ignored";
import type { KindId } from "./kinds/id";
import { ALLOW_ALL, type AllowScope } from "./settings/allow-data";
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
  const BASE = 100;
  const DLC = 101;

  type Listed = Partial<Record<AllowScope, readonly number[]>>;

  it.each<[string, Listed, number, KindId, number | undefined, boolean]>([
    ["a game for the kind it was ignored for", { kernel: [1] }, 1, "kernel", undefined, true],
    ["a game for another kind", { kernel: [1] }, 1, "ai", undefined, false],
    ["a game ignored for all kinds, in any kind", { [ALLOW_ALL]: [2] }, 2, "pvp", undefined, true],
    ["another game", { kernel: [1] }, 3, "kernel", undefined, false],
    ["a DLC, through its base game ignored for the kind", { ai: [BASE] }, DLC, "ai", BASE, true],
    ["a DLC in another kind than its base game's", { ai: [BASE] }, DLC, "pvp", BASE, false],
    [
      "a DLC, through its base game ignored for all",
      { [ALLOW_ALL]: [BASE] },
      DLC,
      "drm",
      BASE,
      true,
    ],
    [
      "a DLC whose base game is not known",
      { [ALLOW_ALL]: [BASE], ai: [BASE] },
      DLC,
      "ai",
      undefined,
      false,
    ],
    ["a DLC whose base game is not ignored", { ai: [999] }, DLC, "ai", BASE, false],
    ["a DLC on its own entry", { pvp: [DLC] }, DLC, "pvp", BASE, true],
    ["a DLC on its own entry, in another kind", { pvp: [DLC] }, DLC, "ai", BASE, false],
    ["a base game whose DLC is ignored", { [ALLOW_ALL]: [DLC] }, BASE, "ai", undefined, false],
    ["a DLC of a DLC, which looks one level up only", { ai: [BASE] }, 102, "ai", DLC, false],
  ])("decides for %s", (_name, listed, id, kind, parent, expected) => {
    const related = parent === undefined ? {} : { parent: appId(parent) };
    expect(isIgnored(ignoredGames(listed), appId(id), kind, related)).toBe(expected);
  });
});
