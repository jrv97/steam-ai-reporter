import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { KIND_IDS, type KindId } from "../kinds/id";
import { PVP_CATEGORY_IDS } from "../kinds/pvp";
import { perKind } from "../kinds/registry";
import { type KindVerdicts, UNKNOWN_KINDS, withRelations } from "../kinds/verdicts";
import { decodeVerdicts, encodeVerdicts } from "./stored";

const T = make.time();

/** Every kind disclosed with every field set; a disclosed entry is stored as the verdict itself. */
const FULL = make.verdicts.full();

describe("encodeVerdicts and decodeVerdicts", () => {
  it.each<readonly [string, KindVerdicts]>([
    ["every kind disclosed", make.verdicts.uniform("disclosed")],
    ["every kind not disclosed", make.verdicts.uniform("not-disclosed")],
    ["every kind gated", make.verdicts.uniform("gated")],
    ["every kind missing", make.verdicts.uniform("missing")],
    ["every kind malformed", make.verdicts.uniform("malformed")],
    ["disclosed kinds beside malformed ones", {
      ...FULL,
      drm: make.verdict.unknown("malformed"),
      pvp: make.verdict.unknown("malformed"),
    }],
    ["AI not disclosed on the page", {
      ...make.verdicts.uniform("not-disclosed"),
      ai: make.verdict.notDisclosed("html"),
    }],
    ["disclosed, not disclosed and missing kinds", {
      ...FULL,
      drm: make.verdict.notDisclosed(),
      pvp: make.verdict.unknown("missing"),
    }],
    ["a kind left unrequested", {
      ...make.verdicts.uniform("not-disclosed"),
      pvp: make.verdict.unknown("unrequested"),
    }],
    [
      "a kernel anti-cheat with nothing but the flag",
      make.verdicts({
        kernel: make.verdict.minimal("kernel", { uninstallsCompletely: false }),
      }),
    ],
    [
      "a kernel anti-cheat with boot protection and no token",
      make.verdicts({
        kernel: make.verdict.minimal("kernel", { uninstallsCompletely: true, bootProtection: {} }),
      }),
    ],
    [
      "an anti-cheat with no name",
      make.verdicts({ anticheat: make.verdict.minimal("anticheat", {}) }),
    ],
    [
      "a DRM text with no activation limit",
      make.verdicts({
        drm: make.verdict.minimal("drm", { text: make.text.service() }),
      }),
    ],
    [
      "an account that does not link to Steam",
      make.verdicts({
        account: make.verdict.minimal("account", {
          text: make.text.service(),
          linksToSteam: false,
        }),
      }),
    ],
    [
      "one EULA with no link",
      make.verdicts({
        eula: make.verdict.minimal("eula", { items: [{ name: make.text.name() }] }),
      }),
    ],
    [
      "every PvP category",
      make.verdicts({
        pvp: make.verdict.minimal("pvp", { categoryIds: [...PVP_CATEGORY_IDS] }),
      }),
    ],
    [
      "AI notes read from the page",
      make.verdicts({
        ai: make.verdict.disclosed("ai", { source: "html" }),
      }),
    ],
  ])("round trip %s", (_name, verdicts) => {
    expect(decodeVerdicts(encodeVerdicts(verdicts, T))).toStrictEqual({ verdicts, time: T });
  });

  it("stores the fetch time once and one entry for each kind", () => {
    const encoded = encodeVerdicts(make.verdicts.uniform("not-disclosed"), T);
    expect(encoded).toStrictEqual({
      time: T,
      kinds: perKind(() => ({ state: "not-disclosed", source: "api" })),
    });
    expect(Object.keys(perKind(() => 0))).toStrictEqual([...KIND_IDS]);
  });

  it("stores a disclosed verdict as itself, and the unknown ones as their reason", () => {
    expect(encodeVerdicts(FULL, T)).toStrictEqual({ time: T, kinds: FULL });
    expect(encodeVerdicts(make.verdicts.uniform("gated"), T)).toStrictEqual({
      time: T,
      kinds: perKind(() => ({ state: "unknown", reason: "gated" })),
    });
  });

  it("leaves out the fields a payload does not have instead of storing them empty", () => {
    const ai = make.verdict.minimal("ai", { notes: make.text.note(), language: "english" });
    const kernel = make.verdict.minimal("kernel", { uninstallsCompletely: false });
    const eula = make.verdict.minimal("eula", { items: [{ name: make.text.name() }] });
    const stored = encodeVerdicts(make.verdicts({ ai, kernel, eula }), T);
    expect(stored).toMatchObject({ kinds: { ai, kernel, eula } });
    expect(JSON.stringify(stored)).not.toMatch(/undefined|null|nameToken|service|bootProtection/);
  });

  it.each<readonly [string, KindVerdicts]>([
    ["every kind failed", UNKNOWN_KINDS.error],
    ["every kind waited", UNKNOWN_KINDS["rate-limited"]],
    ["the AI kind failed", make.verdicts({ ai: make.verdict.unknown("error") })],
    ["one kind failed beside disclosed ones", { ...FULL, pvp: make.verdict.unknown("error") }],
    ["one kind waited beside disclosed ones", {
      ...FULL,
      drm: make.verdict.unknown("rate-limited"),
    }],
  ])("does not encode an app whose verdicts live in memory only: %s", (_name, verdicts) => {
    expect(encodeVerdicts(verdicts, T)).toBeUndefined();
  });

  it.each<readonly [string, KindVerdicts]>([
    ["not disclosed", {
      ...make.verdicts.uniform("not-disclosed"),
      ai: make.verdict.notDisclosed("html"),
    }],
    ["unknown", UNKNOWN_KINDS.gated],
  ])("shares the %s verdict objects", (_name, verdicts) => {
    const decoded = decodeVerdicts(encodeVerdicts(verdicts, T));
    for (const id of KIND_IDS) {
      expect(decoded?.verdicts[id]).toBe(verdicts[id]);
    }
  });
});

describe("the sections in storage", () => {
  const asked = { ...FULL, sections: ["basic_info", "platforms"] } as const;

  it("round trips the sections an answer came with, and stores none without a record", () => {
    expect(encodeVerdicts(asked, T)).toMatchObject({ sections: ["basic_info", "platforms"] });
    expect(decodeVerdicts(encodeVerdicts(asked, T))).toStrictEqual({ verdicts: asked, time: T });
    expect(encodeVerdicts(FULL, T)).not.toHaveProperty("sections");
  });

  it.each([["a section it does not know", ["reviews"]], ["no list", "platforms"]])(
    "discards an entry with %s, so the app is fetched again",
    (_name, sections) => {
      expect(decodeVerdicts({ time: T, kinds: FULL, sections })).toBeUndefined();
    },
  );
});

describe("the demo mark in storage", () => {
  const game = make.appId();
  const demo = withRelations(FULL, { parent: game, demo: true });
  const stored = { time: T, kinds: FULL, parent: game };

  it("round trips the mark beside the full game, and stores nothing for a DLC", () => {
    expect(encodeVerdicts(demo, T)).toMatchObject({ parent: game, demo: true });
    expect(decodeVerdicts(encodeVerdicts(demo, T))).toStrictEqual({ verdicts: demo, time: T });
    const dlc = withRelations(FULL, { parent: game });
    expect(encodeVerdicts(dlc, T)).not.toHaveProperty("demo");
  });

  it.each([["false", false], ["a number", 1], ["a string", "true"]])(
    "discards an entry whose mark is %s, so the app is fetched again",
    (_name, value) => {
      expect(decodeVerdicts({ ...stored, demo: value })).toBeUndefined();
    },
  );

  it("stores the demo's own verdicts, never a lent one's mark", () => {
    const shown = { ...demo, ai: make.verdict.lent(FULL.ai) };
    expect(decodeVerdicts(encodeVerdicts(shown, T))?.verdicts.ai).toStrictEqual(FULL.ai);
  });
});

describe("the base game of a DLC in storage", () => {
  const parent = make.appId();
  const dlc = withRelations(FULL, { parent });
  const stored = { time: T, kinds: FULL };

  it("round trips the parent with the verdicts", () => {
    expect(decodeVerdicts(encodeVerdicts(dlc, T))).toStrictEqual({ verdicts: dlc, time: T });
    expect(
      decodeVerdicts(
        encodeVerdicts(withRelations(make.verdicts.uniform("not-disclosed"), { parent }), T),
      ),
    )
      .toMatchObject({ verdicts: { parent } });
  });

  it("stores the parent as a number beside the kinds, and nothing for an app without one", () => {
    expect(encodeVerdicts(dlc, T)).toMatchObject({ time: T, parent });
    expect(encodeVerdicts(FULL, T)).not.toHaveProperty("parent");
    expect(encodeVerdicts(make.verdicts.uniform("missing"), T)).not.toHaveProperty("parent");
  });

  it.each([
    ["a string", String(parent)],
    ["zero", 0],
    ["a negative number", -1],
    ["a fraction", 2.5],
    ["null", null],
    ["a list", [parent]],
  ])("discards an entry whose parent is %s, so the app is fetched again", (_name, value) => {
    expect(decodeVerdicts({ ...stored, parent: value })).toBeUndefined();
  });
});

describe("the developers and publishers in storage", () => {
  const stored = { time: T, kinds: FULL };
  const clan = make.creator.clan();
  const owner = make.text.creator();
  const studio = make.text.creator();
  const creators = make.creator.forItem({
    developers: [[owner, clan], studio],
    publishers: [[owner, clan]],
  });
  const known = withRelations(FULL, { creators });

  it("round trips the creators with the verdicts, clan IDs included", () => {
    expect(decodeVerdicts(encodeVerdicts(known, T))).toStrictEqual({ verdicts: known, time: T });
  });

  it("stores each creator as its name and clan ID", () => {
    expect(encodeVerdicts(known, T)).toMatchObject({
      developers: [{ name: owner, clan }, { name: studio }],
      publishers: [{ name: owner, clan }],
    });
  });

  it.each([["every kind disclosed", FULL], ["every kind missing", UNKNOWN_KINDS.missing]])(
    "stores no creators for an app without them: %s",
    (_name, verdicts) => {
      const entry = encodeVerdicts(verdicts, T);
      expect(entry).not.toHaveProperty("developers");
      expect(entry).not.toHaveProperty("publishers");
    },
  );

  it("reads a role the entry lacks as having none", () => {
    const decoded = decodeVerdicts({ ...stored, publishers: [{ name: owner }] });
    expect(decoded?.verdicts.creators).toStrictEqual(
      make.creator.forItem({ publishers: [owner] }),
    );
  });

  it.each([
    ["a string", owner],
    ["an object", { name: owner }],
    ["null", null],
    ["entries without a name", [{ clan }]],
    ["entries with a name that is no text", [{ name: clan }]],
    ["entries with a clan ID that is no ID", [{ name: owner, clan: String(clan) }]],
    ["entries with a clan ID of zero", [{ name: owner, clan: 0 }]],
  ])("discards an entry whose developers are %s, so the app is fetched again", (_name, value) => {
    expect(decodeVerdicts({ ...stored, developers: value })).toBeUndefined();
  });
});

describe("decodeVerdicts", () => {
  const valid = { time: T, kinds: FULL };

  /** The valid entry with the stored value of one kind replaced. */
  function withEntry(id: KindId, entry: unknown): unknown {
    return { time: T, kinds: { ...FULL, [id]: entry } };
  }

  /** The valid entry with fields of one kind's stored value replaced. */
  function withFields(id: KindId, fields: Readonly<Record<string, unknown>>): unknown {
    return withEntry(id, { ...FULL[id], ...fields });
  }

  it("accepts the valid shape, as an app with no parent and no creators", () => {
    expect(decodeVerdicts(valid)).toStrictEqual({ verdicts: FULL, time: T });
  });

  it.each([undefined, ...make.raw.junk(), [valid]])("discards %o, a value of the wrong type", (
    stored,
  ) => {
    expect(decodeVerdicts(stored)).toBeUndefined();
  });

  it.each<readonly [string, unknown]>([
    ["no kinds", { time: T, kinds: {} }],
    ["no kinds record", { time: T }],
    ["only a kind it does not know", { time: T, kinds: { other: FULL.ai } }],
    ...KIND_IDS.map((id): readonly [string, unknown] => [
      `every kind but ${id}`,
      { time: T, kinds: Object.fromEntries(Object.entries(FULL).filter(([key]) => key !== id)) },
    ]),
    ["a time in text", { time: "yesterday", kinds: FULL }],
    ["a time that is no number", { time: Number.NaN, kinds: FULL }],
    ["no time", { kinds: FULL }],
  ])("discards an entry with %s", (_name, stored) => {
    expect(decodeVerdicts(stored)).toBeUndefined();
  });

  it.each<readonly [KindId, unknown]>([
    ["ai", { state: "not-disclosed" }],
    ["ai", { state: "unknown", reason: "error" }],
    ["ai", { state: "unknown", reason: "rate-limited" }],
    ["ai", { state: "unknown" }],
    ["ai", null],
    ["kernel", FULL.anticheat],
  ])("discards a stored %s value of %o", (id, entry) => {
    expect(decodeVerdicts(withEntry(id, entry))).toBeUndefined();
  });

  it.each<readonly [KindId, Readonly<Record<string, unknown>>]>([
    ["ai", { state: "maybe" }],
    ["ai", { state: undefined }],
    ["ai", { kind: "drm" }],
    ["ai", { kind: undefined }],
    ["ai", { notes: "" }],
    ["ai", { notes: 5 }],
    ["ai", { language: "klingon" }],
    ["ai", { language: undefined }],
    ["ai", { source: "guess" }],
    ["ai", { service: 3 }],
    ["ai", { name: null }],
    ["kernel", { uninstallsCompletely: undefined }],
    ["kernel", { uninstallsCompletely: "yes" }],
    ["kernel", { name: 7 }],
    ["kernel", { nameToken: [] }],
    ["kernel", { bootProtection: true }],
    ["kernel", { bootProtection: { token: 1 } }],
    ["anticheat", { name: false }],
    ["anticheat", { kind: "kernel" }],
    ["drm", { text: "" }],
    ["drm", { text: undefined }],
    ["drm", { activationLimit: 5 }],
    ["account", { text: "" }],
    ["account", { linksToSteam: undefined }],
    ["account", { linksToSteam: "true" }],
    ["eula", { items: [] }],
    ["eula", { items: make.text.name() }],
    ["eula", { items: [{ url: "https://store.steampowered.com/eula/1" }] }],
    ["eula", { items: [{ name: make.text.name(), url: 5 }] }],
    ["pvp", { categoryIds: [] }],
    ["pvp", { categoryIds: ["49"] }],
    ["pvp", { categoryIds: [49.5] }],
    ["pvp", { categoryIds: undefined }],
    ["iap", { kind: "pvp" }],
    ["deck", { facet: "unknown" }],
    ["machine", { facet: undefined }],
    ["family", { facet: "verified" }],
  ])("discards a stored %s verdict with %o instead of casting it", (id, fields) => {
    expect(decodeVerdicts(withFields(id, fields))).toBeUndefined();
  });

  it("drops a stored link that is not an EULA link and keeps the name", () => {
    const [script, elsewhere, clean, plain] = [
      make.text.name(),
      make.text.name(),
      make.text.name(),
      make.text.name(),
    ];
    const items = [
      { name: script, url: "javascript:alert(1)" },
      { name: elsewhere, url: make.text.url() },
      { name: clean, url: "https://store.steampowered.com//eula/3_eula_0" },
      { name: plain },
    ];
    const decoded = decodeVerdicts(withFields("eula", { items }));
    expect(decoded?.verdicts.eula).toStrictEqual({
      ...make.verdict.bare("eula"),
      items: [
        { name: script },
        { name: elsewhere },
        { name: clean, url: "https://store.steampowered.com/eula/3_eula_0" },
        { name: plain },
      ],
    });
  });

  it("drops unknown keys and kinds", () => {
    const name = make.text.name();
    const decoded = decodeVerdicts({
      time: T,
      extra: make.text.note(),
      kinds: {
        ...FULL,
        ai: { ...FULL.ai, extra: make.text.note() },
        eula: { ...FULL.eula, items: [{ name, extra: make.text.note() }] },
        other: { state: "unknown" },
      },
    });
    expect(decoded?.verdicts).toStrictEqual({
      ...FULL,
      eula: make.verdict.bare("eula", { items: [{ name }] }),
    });
  });
});
