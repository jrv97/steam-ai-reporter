import { describe, expect, it, vi } from "vitest";
import type { CreatorsSpec } from "../../tests/helpers/creators";
import { make } from "../../tests/helpers/factory";
import { fake } from "../../tests/helpers/fakes";
import type { IgnoredSpec } from "../../tests/helpers/ignored";
import {
  createIgnoreLists,
  type Ignored,
  type IgnoreLists,
  isIgnored,
  loadIgnored,
} from "./ignored";
import type { KindId } from "./kinds/id";
import type { Relations } from "./kinds/verdicts";
import { ALLOW_ALL } from "./settings/allow-data";
import type { AppId } from "./types";

/** Empty ignore lists over a store in memory. */
function emptyLists(): IgnoreLists {
  return createIgnoreLists(fake.store(), fake.clock(make.time()));
}

/** A creator key by clan ID, and the name key of the same creator. */
function creatorKeys() {
  return {
    clan: make.creator.key(`c:${String(make.creator.clan())}`),
    name: make.creator.key(`n:${make.text.creator()}`),
  };
}

describe("loadIgnored", () => {
  it("holds the stored games and creators of each scope", async () => {
    const lists = emptyLists();
    const [drm, all] = [make.appId(), make.appId()] as const;
    const { clan, name } = creatorKeys();
    await lists.games.add("drm", drm, make.text.name());
    await lists.games.add(ALLOW_ALL, all, make.text.name());
    await lists.creators.developer.add("ai", clan, make.text.creator());
    await lists.creators.publisher.add(ALLOW_ALL, name, make.text.creator());
    const ignored = await loadIgnored(lists, { error: vi.fn() });
    expect([...ignored.games.drm]).toEqual([drm]);
    expect([...ignored.games[ALLOW_ALL]]).toEqual([all]);
    expect([...ignored.games.ai]).toEqual([]);
    expect([...ignored.creators.developer.ai]).toEqual([clan]);
    expect([...ignored.creators.publisher[ALLOW_ALL]]).toEqual([name]);
    expect([...ignored.creators.developer[ALLOW_ALL]]).toEqual([]);
  });

  it.each<[
    string,
    (lists: IgnoreLists, problem: Error) => IgnoreLists,
    (ignored: Ignored) => number,
    (ignored: Ignored) => number,
  ]>([
    [
      "games",
      (lists, problem) => ({ ...lists, games: failing(lists.games, problem) }),
      (ignored) => ignored.games.ai.size,
      (ignored) => ignored.creators.developer.ai.size,
    ],
    [
      "developers",
      (lists, problem) => ({
        ...lists,
        creators: { ...lists.creators, developer: failing(lists.creators.developer, problem) },
      }),
      (ignored) => ignored.creators.developer.ai.size,
      (ignored) => ignored.games.ai.size,
    ],
  ])("logs a %s list that cannot be read, starts with none and keeps the others", async (
    _name,
    breakList,
    broken,
    kept,
  ) => {
    const problem = new Error();
    const logger = { error: vi.fn() };
    const lists = emptyLists();
    await lists.games.add("ai", make.appId(), make.text.name());
    await lists.creators.developer.add("ai", creatorKeys().clan, make.text.creator());
    await lists.creators.publisher.add("ai", creatorKeys().clan, make.text.creator());
    const ignored = await loadIgnored(breakList(lists, problem), logger);
    expect(logger.error).toHaveBeenCalledWith(problem);
    expect([broken(ignored), kept(ignored), ignored.creators.publisher.ai.size]).toEqual([0, 1, 1]);
  });
});

function failing<List extends { list(): Promise<unknown>; }>(list: List, problem: Error): List {
  return { ...list, list: () => Promise.reject(problem) };
}

describe("isIgnored", () => {
  const GAME = make.appId();
  const OTHER = make.appId();
  const BASE = make.appId();
  const DLC = make.appId();
  const DLC_OF_DLC = make.appId();
  const NONE: Relations = {};
  const OF_BASE: Relations = { parent: BASE };
  const OF_DLC: Relations = { parent: DLC };

  it.each<[string, IgnoredSpec, AppId, KindId, Relations, boolean]>([
    [
      "a game for the kind it was ignored for",
      { games: { kernel: [GAME] } },
      GAME,
      "kernel",
      NONE,
      true,
    ],
    ["a game for another kind", { games: { kernel: [GAME] } }, GAME, "ai", NONE, false],
    [
      "a game ignored for all kinds, in any kind",
      { games: { all: [GAME] } },
      GAME,
      "pvp",
      NONE,
      true,
    ],
    ["another game", { games: { kernel: [GAME] } }, OTHER, "kernel", NONE, false],
    [
      "a DLC, through its base game for the kind",
      { games: { ai: [BASE] } },
      DLC,
      "ai",
      OF_BASE,
      true,
    ],
    [
      "a DLC in another kind than its base game's",
      { games: { ai: [BASE] } },
      DLC,
      "pvp",
      OF_BASE,
      false,
    ],
    ["a DLC, through its base game for all", { games: { all: [BASE] } }, DLC, "drm", OF_BASE, true],
    [
      "a DLC whose base game is not known",
      { games: { all: [BASE], ai: [BASE] } },
      DLC,
      "ai",
      NONE,
      false,
    ],
    ["a DLC whose base game is not ignored", { games: { ai: [OTHER] } }, DLC, "ai", OF_BASE, false],
    ["a DLC on its own entry", { games: { pvp: [DLC] } }, DLC, "pvp", OF_BASE, true],
    [
      "a DLC on its own entry, in another kind",
      { games: { pvp: [DLC] } },
      DLC,
      "ai",
      OF_BASE,
      false,
    ],
    ["a base game whose DLC is ignored", { games: { all: [DLC] } }, BASE, "ai", NONE, false],
    [
      "a DLC of a DLC, which looks one level up only",
      { games: { ai: [BASE] } },
      DLC_OF_DLC,
      "ai",
      OF_DLC,
      false,
    ],
  ])("decides for %s", (_name, spec, id, kind, related, expected) => {
    expect(isIgnored(make.ignored(spec), id, kind, related)).toBe(expected);
  });

  const CLAN = make.creator.clan();
  const NAME = make.text.creator();
  const OTHER_NAME = make.text.creator();
  const BY_CLAN = `c:${String(CLAN)}`;
  const BY_NAME = `n:${NAME}`;
  /** Relations holding these developers and publishers. */
  const made = (creators: CreatorsSpec): Relations => ({
    creators: make.creator.forItem(creators),
  });
  const STUDIO = made({ developers: [[NAME, CLAN]], publishers: [[NAME, CLAN]] });

  it.each<[string, IgnoredSpec, Relations, KindId, boolean]>([
    ["a developer by clan ID", { developers: { ai: [BY_CLAN] } }, STUDIO, "ai", true],
    ["a developer in another kind", { developers: { ai: [BY_CLAN] } }, STUDIO, "pvp", false],
    ["a developer for all kinds", { developers: { all: [BY_CLAN] } }, STUDIO, "pvp", true],
    [
      "a developer by name",
      { developers: { ai: [BY_NAME] } },
      made({ developers: [NAME] }),
      "ai",
      true,
    ],
    [
      "a developer by name once Steam adds a clan ID",
      { developers: { ai: [BY_NAME] } },
      STUDIO,
      "ai",
      true,
    ],
    [
      "a developer by clan ID after a rename",
      { developers: { ai: [BY_CLAN] } },
      made({ developers: [[OTHER_NAME, CLAN]] }),
      "ai",
      true,
    ],
    [
      "a clan entry for a creator that now has no clan ID",
      { developers: { ai: [BY_CLAN] } },
      made({ developers: [NAME] }),
      "ai",
      false,
    ],
    [
      "another developer",
      { developers: { ai: [`c:${String(make.creator.clan())}`] } },
      STUDIO,
      "ai",
      false,
    ],
    [
      "one of several developers",
      { developers: { ai: [BY_NAME] } },
      made({ developers: [OTHER_NAME, NAME] }),
      "ai",
      true,
    ],
    ["a publisher by clan ID", { publishers: { ai: [BY_CLAN] } }, STUDIO, "ai", true],
    [
      "a developer list for the game's publisher",
      { developers: { ai: [BY_CLAN] } },
      made({ publishers: [[NAME, CLAN]] }),
      "ai",
      false,
    ],
    [
      "a publisher list for the game's developer",
      { publishers: { ai: [BY_CLAN] } },
      made({ developers: [[NAME, CLAN]] }),
      "ai",
      false,
    ],
    ["a game with no known creators", { developers: { all: [BY_CLAN] } }, NONE, "ai", false],
  ])("decides for %s", (_name, spec, related, kind, expected) => {
    expect(isIgnored(make.ignored(spec), GAME, kind, related)).toBe(expected);
  });
});
