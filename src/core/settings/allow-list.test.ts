import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { readKey } from "../../../tests/helpers/store-read";
import type { JsonValue } from "../json";
import type { AppId } from "../types";
import { type AllowEntry, type AllowScope, perScope } from "./allow-data";
import { clearIgnoreLists, createAllowList, createCreatorList } from "./allow-list";

/** The ignored games of every scope, none. */
const NO_ENTRIES = perScope(() => new Map());

/** A counting store holding these values by key, and a clock standing at a fresh instant. */
function storeAndClock(initial: Readonly<Record<string, JsonValue>>) {
  const store = fake.countingStore(fake.store(new Map(Object.entries(initial))));
  return { store, clock: fake.clock(make.time()) };
}

function setup(initial: Readonly<Record<string, JsonValue>> = {}) {
  const { store, clock } = storeAndClock(initial);
  return { store, clock, allow: createAllowList(store, clock) };
}

/** The ignored games of one scope. */
async function scoped(
  allow: ReturnType<typeof setup>["allow"],
  scope: AllowScope,
): Promise<ReadonlyMap<AppId, AllowEntry>> {
  return (await allow.list())[scope];
}

describe("two quick changes", () => {
  it("both apply when two games stop being ignored at once", async () => {
    const { allow } = setup();
    const [one, two, three] = [make.appId(), make.appId(), make.appId()] as const;
    for (const id of [one, two, three]) {
      await allow.add("drm", id, make.text.name());
    }
    await Promise.all([allow.remove("drm", one), allow.remove("drm", two)]);
    expect([...(await scoped(allow, "drm")).keys()]).toEqual([three]);
  });

  it("keep every game added at once, in two scopes", async () => {
    const { allow } = setup();
    const one = make.appId();
    await Promise.all([
      allow.add("drm", one, make.text.name()),
      allow.add("eula", one, make.text.name()),
      allow.add("all", make.appId(), make.text.name()),
    ]);
    const listed = await allow.list();
    expect([listed.drm.size, listed.eula.size, listed.all.size]).toEqual([1, 1, 1]);
  });

  it("run the next change after one that failed", async () => {
    const { allow, store } = setup();
    const next = make.appId();
    store.break();
    const failed = allow.add("drm", make.appId(), make.text.name());
    await expect(failed).rejects.toBeInstanceOf(Error);
    store.heal();
    await allow.add("drm", next, make.text.name());
    expect([...(await scoped(allow, "drm")).keys()]).toEqual([next]);
  });
});

describe("createAllowList", () => {
  it("starts empty in every scope", async () => {
    expect(await setup().allow.list()).toStrictEqual(NO_ENTRIES);
  });

  it("adds a game with its name and the time it was added", async () => {
    const { allow, clock } = setup();
    const first = { id: make.appId(), name: make.text.name(), added: clock.now() };
    await allow.add("ai", first.id, first.name);
    clock.advance(make.duration());
    const second = { id: make.appId(), name: make.text.name(), added: clock.now() };
    await allow.add("ai", second.id, second.name);
    expect(await scoped(allow, "ai")).toStrictEqual(
      new Map([
        [first.id, { name: first.name, added: first.added }],
        [second.id, { name: second.name, added: second.added }],
      ]),
    );
  });

  it("keeps a game's ignore apart in each scope", async () => {
    const { allow } = setup();
    const [ai, all] = [make.appId(), make.appId()] as const;
    await allow.add("ai", ai, make.text.name());
    await allow.add("all", all, make.text.name());
    expect([...(await scoped(allow, "ai")).keys()]).toStrictEqual([ai]);
    expect([...(await scoped(allow, "all")).keys()]).toStrictEqual([all]);
    await allow.remove("all", ai);
    expect((await scoped(allow, "ai")).has(ai)).toBe(true);
  });

  it("stores one object per scope, each from app ID to name and date", async () => {
    const { allow, store, clock } = setup();
    const id = make.appId();
    const name = make.text.name();
    await allow.add("ai", id, name);
    expect(await readKey(store, "v2:allow")).toStrictEqual({
      ...make.raw.noGames(),
      ai: { [String(id)]: { name, added: clock.now() } },
    });
  });

  it("replaces the entry of a game that is added again", async () => {
    const { allow, clock } = setup();
    const id = make.appId();
    await allow.add("ai", id, make.text.name());
    clock.advance(make.duration());
    const name = make.text.name();
    await allow.add("ai", id, name);
    expect(await scoped(allow, "ai")).toStrictEqual(new Map([[id, { name, added: clock.now() }]]));
  });

  it("removes a game and keeps the others", async () => {
    const { allow } = setup();
    const [gone, kept] = [make.appId(), make.appId()] as const;
    await allow.add("ai", gone, make.text.name());
    await allow.add("ai", kept, make.text.name());
    await allow.remove("ai", gone);
    expect([...(await scoped(allow, "ai")).keys()]).toStrictEqual([kept]);
    await allow.remove("ai", kept);
    expect(await scoped(allow, "ai")).toStrictEqual(new Map());
  });

  it("ignores removing a game that is not listed, without writing", async () => {
    const { allow, store } = setup();
    await allow.remove("ai", make.appId());
    expect(store.calls.set).toBe(0);
  });

  it.each<[string, (merged: number) => number, <T>(here: T, merged: T) => T]>([
    ["the earlier entry here", (merged) => merged - 1, (here) => here],
    ["the earlier entry in the merge", (merged) => merged + 1, (_here, merged) => merged],
  ])("keeps %s when a merge lists a game again", async (_case, hereAdded, kept) => {
    const { allow, clock } = setup();
    const id = make.appId();
    const here = { name: make.text.name(), added: hereAdded(clock.now()) };
    const merged = { name: make.text.name(), added: clock.now() };
    clock.set(here.added);
    await allow.add("ai", id, here.name);
    await allow.merge(make.allow.games({ ai: [[id, merged.name, merged.added]] }));
    expect((await scoped(allow, "ai")).get(id)).toStrictEqual(kept(here, merged));
  });

  it("merges in one write, counts the new games and writes nothing the second time", async () => {
    const { allow, store } = setup();
    const [shared, own] = [make.appId(), make.appId()] as const;
    const entry = make.raw.allowEntry();
    const merged = make.allow.games({
      all: [[shared, entry.name, entry.added]],
      drm: [[shared, entry.name, entry.added], [own, entry.name, entry.added]],
    });
    expect(await allow.merge(merged)).toBe(3);
    expect(await allow.merge(merged)).toBe(0);
    expect(store.calls.set).toBe(1);
  });

  it("is cleared with the creator lists in one write, with no v1 list copied back", async () => {
    const { allow, store, clock } = setup({ "v1:allow": make.raw.v1Allow() });
    const developers = createCreatorList(store, clock, "developer");
    await allow.add("drm", make.appId(), make.text.name());
    await developers.merge(make.allow.creators({ all: [make.allow.clanRow()] }));
    const writes = store.calls.set;
    await clearIgnoreLists(store);
    expect(store.calls.set).toBe(writes + 1);
    expect([await createAllowList(store, clock).list(), await developers.list()]).toStrictEqual([
      NO_ENTRIES,
      NO_ENTRIES,
    ]);
  });

  it("is shared by every list over the same store", async () => {
    const { allow, store, clock } = setup();
    const id = make.appId();
    await allow.add("ai", id, make.text.name());
    expect((await scoped(createAllowList(store, clock), "ai")).has(id)).toBe(true);
  });

  it("reads only the v2 key once the list is stored, and writes once per change", async () => {
    const { allow, store } = setup({
      "v2:allow": make.raw.noGames(),
      "v1:allow": make.raw.v1Allow(),
    });
    await allow.add("ai", make.appId(), make.text.name());
    expect(store.gets).toStrictEqual([["v2:allow"]]);
    expect(store.calls.set).toBe(1);
    await allow.list();
    expect(store.gets).toStrictEqual([["v2:allow"], ["v2:allow"]]);
  });

  it("reads the v1 key only when the v2 key is absent", async () => {
    const { allow, store } = setup();
    await allow.list();
    expect(store.gets).toStrictEqual([["v2:allow"], ["v1:allow"]]);
  });

  describe("a v1 list", () => {
    const first = make.appId();
    const second = make.appId();
    const firstEntry = make.raw.allowEntry();
    const secondEntry = make.raw.allowEntry();
    const V1 = make.raw.v1Allow({ [String(first)]: firstEntry, [String(second)]: secondEntry });

    it("is copied to the AI scope on the first read, and left in place", async () => {
      const { allow, store } = setup({ "v1:allow": V1 });
      expect(await scoped(allow, "ai")).toStrictEqual(
        new Map([[first, firstEntry], [second, secondEntry]]),
      );
      expect(await scoped(allow, "all")).toStrictEqual(new Map());
      expect(await readKey(store, "v2:allow")).toStrictEqual({ ...make.raw.noGames(), ai: V1 });
      expect(await readKey(store, "v1:allow")).toStrictEqual(V1);
    });

    it("is copied once: later changes go to v2 and the list is not copied again", async () => {
      const { allow, store, clock } = setup({ "v1:allow": V1 });
      await allow.remove("ai", first);
      expect([...(await scoped(allow, "ai")).keys()]).toStrictEqual([second]);
      expect([...(await scoped(createAllowList(store, clock), "ai")).keys()]).toStrictEqual([
        second,
      ]);
    });

    it("keeps the entries it can read when part of the list is corrupt", async () => {
      const { allow } = setup({
        "v1:allow": {
          [String(first)]: firstEntry,
          [String(second)]: make.raw.corruptNumber(),
          ...Object.fromEntries(make.raw.badGameKeys().map((key) => [key, secondEntry])),
        },
      });
      expect([...(await scoped(allow, "ai")).keys()]).toStrictEqual([first]);
    });
  });

  describe("invalid stored values", () => {
    it.each(make.raw.junk())("discards %j, which is not an object", async (stored) => {
      const { allow } = setup({ "v2:allow": stored });
      expect(await allow.list()).toStrictEqual(NO_ENTRIES);
    });

    it("discards the entries of a scope that is not an object", async () => {
      const id = make.appId();
      const entry = make.raw.allowEntry();
      const { allow } = setup({
        "v2:allow": { all: make.raw.corruptText(), ai: { [String(id)]: entry } },
      });
      expect(await scoped(allow, "all")).toStrictEqual(new Map());
      expect(await scoped(allow, "ai")).toStrictEqual(new Map([[id, entry]]));
    });

    it("drops invalid entries and keys that are no app ID, and keeps the valid ones", async () => {
      const id = make.appId();
      const entry = make.raw.allowEntry();
      const { allow } = setup({
        "v2:allow": {
          ai: {
            [String(id)]: entry,
            ...Object.fromEntries(
              make.raw.badAllowEntries().map((bad) => [String(make.appId()), bad]),
            ),
            ...Object.fromEntries(make.raw.badGameKeys().map((key) => [key, entry])),
          },
        },
      });
      expect(await scoped(allow, "ai")).toStrictEqual(new Map([[id, entry]]));
    });

    it("drops scopes it does not know", async () => {
      const { allow } = setup({ "v2:allow": { future: make.raw.v1Allow() } });
      expect(await allow.list()).toStrictEqual(NO_ENTRIES);
    });

    it("repairs the stored object on the next change", async () => {
      const [good, bad, added] = [make.appId(), make.appId(), make.appId()] as const;
      const entry = make.raw.allowEntry();
      const { allow, store, clock } = setup({
        "v2:allow": {
          ai: { [String(good)]: entry, [String(bad)]: make.raw.corruptNumber() },
          future: make.raw.v1Allow(),
        },
      });
      const name = make.text.name();
      await allow.add("ai", added, name);
      expect(await readKey(store, "v2:allow")).toStrictEqual({
        ...make.raw.noGames(),
        ai: { [String(good)]: entry, [String(added)]: { name, added: clock.now() } },
      });
    });
  });
});

describe.each(
  [
    ["developer", "v2:allow-developers", "v2:allow-publishers"],
    ["publisher", "v2:allow-publishers", "v2:allow-developers"],
  ] as const,
)("createCreatorList for the %s role", (role, storageKey, otherKey) => {
  const byClan = make.creator.key(`c:${String(make.creator.clan())}`);
  const byName = make.creator.key(`n:${make.text.creator()}`);

  function creatorSetup(initial: Readonly<Record<string, JsonValue>> = {}) {
    const { store, clock } = storeAndClock(initial);
    return { store, clock, list: createCreatorList(store, clock, role) };
  }

  it("starts empty, and reads its own key only", async () => {
    const { list, store } = creatorSetup();
    expect(await list.list()).toStrictEqual(NO_ENTRIES);
    expect(store.gets).toStrictEqual([[storageKey]]);
  });

  it("stores an object per scope from creator key to name and date, in its own key", async () => {
    const { list, store, clock } = creatorSetup();
    const clan = { name: make.text.creator(), added: clock.now() };
    await list.add("ai", byClan, clan.name);
    clock.advance(make.duration());
    const named = { name: make.text.creator(), added: clock.now() };
    await list.add("all", byName, named.name);
    expect(await readKey(store, storageKey)).toStrictEqual({
      ...make.raw.noGames(),
      ai: { [byClan]: clan },
      all: { [byName]: named },
    });
    expect((await store.get([otherKey, "v2:allow"])).size).toBe(0);
  });

  it("removes a creator from one scope and keeps the others", async () => {
    const { list } = creatorSetup();
    await list.add("ai", byClan, make.text.creator());
    await list.add("pvp", byClan, make.text.creator());
    await list.remove("ai", byClan);
    const listed = await list.list();
    expect([listed.ai.size, [...listed.pvp.keys()]]).toStrictEqual([0, [byClan]]);
  });

  it("drops a stored entry whose key is not a creator key", async () => {
    const entry = make.raw.allowEntry();
    const { list } = creatorSetup({
      [storageKey]: {
        ai: {
          [byClan]: entry,
          ...Object.fromEntries(make.creator.badKeyTexts().map((text) => [text, entry])),
        },
      },
    });
    expect([...(await list.list()).ai.keys()]).toStrictEqual([byClan]);
  });

  it("does not read the games' v2:allow entries", async () => {
    const { list } = creatorSetup({ "v2:allow": make.raw.v2Allow("ai", make.appId()) });
    expect(await list.list()).toStrictEqual(NO_ENTRIES);
  });
});
