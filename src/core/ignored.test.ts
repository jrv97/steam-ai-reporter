import { describe, expect, it, vi } from "vitest";
import { appId } from "../../tests/helpers/app-ids";
import { creatorsFor, type CreatorsSpec, keyOf } from "../../tests/helpers/creators";
import { fixedClock } from "../../tests/helpers/fixed-clock";
import { ignoredSets, type IgnoredSpec } from "../../tests/helpers/ignored";
import { memoryStore } from "../../tests/helpers/memory-store";
import { createIgnoreLists, type IgnoreLists, isIgnored, loadIgnored } from "./ignored";
import type { KindId } from "./kinds/id";
import { ALLOW_ALL } from "./settings/allow-data";

const quiet = { error: vi.fn() };

describe("loadIgnored", () => {
  it("holds the stored games and creators of each scope", async () => {
    const lists = createIgnoreLists(memoryStore(), fixedClock(0));
    await lists.games.add("drm", appId(10), "Ten");
    await lists.games.add(ALLOW_ALL, appId(20), "Twenty");
    await lists.creators.developer.add("ai", keyOf("c:4"), "Valve");
    await lists.creators.publisher.add(ALLOW_ALL, keyOf("n:Embark"), "Embark");
    const ignored = await loadIgnored(lists, quiet);
    expect([...ignored.games.drm]).toEqual([10]);
    expect([...ignored.games[ALLOW_ALL]]).toEqual([20]);
    expect([...ignored.games.ai]).toEqual([]);
    expect([...ignored.creators.developer.ai]).toEqual(["c:4"]);
    expect([...ignored.creators.publisher[ALLOW_ALL]]).toEqual(["n:Embark"]);
    expect([...ignored.creators.developer[ALLOW_ALL]]).toEqual([]);
  });

  it.each<[string, (lists: IgnoreLists, problem: Error) => IgnoreLists, string]>([
    ["games", (lists, problem) => ({ ...lists, games: failing(lists.games, problem) }), "games"],
    [
      "developers",
      (lists, problem) => ({
        ...lists,
        creators: { ...lists.creators, developer: failing(lists.creators.developer, problem) },
      }),
      "creators",
    ],
  ])("logs a %s list that cannot be read, starts with none and keeps the others", async (
    _name,
    breakList,
    held,
  ) => {
    const problem = new Error();
    const lists = createIgnoreLists(memoryStore(), fixedClock(0));
    await lists.games.add("ai", appId(1), "One");
    await lists.creators.publisher.add("ai", keyOf("c:7"), "Seven");
    const ignored = await loadIgnored(breakList(lists, problem), quiet);
    expect(quiet.error).toHaveBeenCalledWith(problem);
    expect(held === "games" ? ignored.creators.publisher.ai.size : ignored.games.ai.size).toBe(1);
    expect(held === "games" ? ignored.games.ai.size : ignored.creators.developer.ai.size).toBe(0);
  });
});

function failing<List extends { list(): Promise<unknown>; }>(list: List, problem: Error): List {
  return { ...list, list: () => Promise.reject(problem) };
}

describe("isIgnored", () => {
  const BASE = 100;
  const DLC = 101;

  it.each<[string, IgnoredSpec, number, KindId, number | undefined, boolean]>([
    [
      "a game for the kind it was ignored for",
      { games: { kernel: [1] } },
      1,
      "kernel",
      undefined,
      true,
    ],
    ["a game for another kind", { games: { kernel: [1] } }, 1, "ai", undefined, false],
    [
      "a game ignored for all kinds, in any kind",
      { games: { all: [2] } },
      2,
      "pvp",
      undefined,
      true,
    ],
    ["another game", { games: { kernel: [1] } }, 3, "kernel", undefined, false],
    ["a DLC, through its base game for the kind", { games: { ai: [BASE] } }, DLC, "ai", BASE, true],
    [
      "a DLC in another kind than its base game's",
      { games: { ai: [BASE] } },
      DLC,
      "pvp",
      BASE,
      false,
    ],
    ["a DLC, through its base game for all", { games: { all: [BASE] } }, DLC, "drm", BASE, true],
    [
      "a DLC whose base game is not known",
      { games: { all: [BASE], ai: [BASE] } },
      DLC,
      "ai",
      undefined,
      false,
    ],
    ["a DLC whose base game is not ignored", { games: { ai: [999] } }, DLC, "ai", BASE, false],
    ["a DLC on its own entry", { games: { pvp: [DLC] } }, DLC, "pvp", BASE, true],
    ["a DLC on its own entry, in another kind", { games: { pvp: [DLC] } }, DLC, "ai", BASE, false],
    ["a base game whose DLC is ignored", { games: { all: [DLC] } }, BASE, "ai", undefined, false],
    [
      "a DLC of a DLC, which looks one level up only",
      { games: { ai: [BASE] } },
      102,
      "ai",
      DLC,
      false,
    ],
  ])("decides for %s", (_name, spec, id, kind, parent, expected) => {
    const related = parent === undefined ? {} : { parent: appId(parent) };
    expect(isIgnored(ignoredSets(spec), appId(id), kind, related)).toBe(expected);
  });

  const VALVE: CreatorsSpec = { developers: [["Valve", 4]], publishers: [["Valve", 4]] };

  it.each<[string, IgnoredSpec, CreatorsSpec | undefined, KindId, boolean]>([
    ["a developer by clan ID", { developers: { ai: ["c:4"] } }, VALVE, "ai", true],
    ["a developer in another kind", { developers: { ai: ["c:4"] } }, VALVE, "pvp", false],
    ["a developer for all kinds", { developers: { all: ["c:4"] } }, VALVE, "pvp", true],
    [
      "a developer by name",
      { developers: { ai: ["n:Embark"] } },
      { developers: ["Embark"] },
      "ai",
      true,
    ],
    [
      "a developer by name once Steam adds a clan ID",
      { developers: { ai: ["n:Valve"] } },
      VALVE,
      "ai",
      true,
    ],
    [
      "a developer by clan ID after a rename",
      { developers: { ai: ["c:4"] } },
      { developers: [["Valve Renamed", 4]] },
      "ai",
      true,
    ],
    [
      "a clan entry for a creator that now has no clan ID",
      { developers: { ai: ["c:4"] } },
      { developers: ["Valve"] },
      "ai",
      false,
    ],
    ["another developer", { developers: { ai: ["c:5"] } }, VALVE, "ai", false],
    [
      "one of several developers",
      { developers: { ai: ["n:Two"] } },
      { developers: ["One", "Two"] },
      "ai",
      true,
    ],
    ["a publisher by clan ID", { publishers: { ai: ["c:4"] } }, VALVE, "ai", true],
    [
      "a developer list for the game's publisher",
      { developers: { ai: ["c:4"] } },
      { publishers: [["Valve", 4]] },
      "ai",
      false,
    ],
    [
      "a publisher list for the game's developer",
      { publishers: { ai: ["c:4"] } },
      { developers: [["Valve", 4]] },
      "ai",
      false,
    ],
    ["a game with no known creators", { developers: { all: ["c:4"] } }, undefined, "ai", false],
  ])("decides for %s", (_name, spec, creators, kind, expected) => {
    const related = creators === undefined ? {} : { creators: creatorsFor(creators) };
    expect(isIgnored(ignoredSets(spec), appId(1), kind, related)).toBe(expected);
  });
});
