import { describe, expect, it } from "vitest";
import { appId } from "../../../tests/helpers/app-ids";
import { creatorsFor } from "../../../tests/helpers/creators";
import {
  aiVerdicts,
  disclosedVerdict,
  FULL_DISCLOSED,
  lent,
  NOT_DISCLOSED,
  uniformVerdicts,
} from "../../../tests/helpers/verdicts";
import type { AiVerdict } from "../kinds/ai";
import { KIND_IDS } from "../kinds/id";
import { perKind } from "../kinds/registry";
import { type KindVerdicts, UNKNOWN_KINDS, withRelations } from "../kinds/verdicts";
import { NOT_DISCLOSED as NOT_DISCLOSED_VERDICT, UNKNOWN } from "../types";
import { decodeVerdicts, encodeVerdicts } from "./stored";

const T = 1_000_000_000_000;

/** The stored form of `FULL_DISCLOSED`: a disclosed entry is the verdict itself. */
const STORED_KINDS = {
  ai: {
    state: "disclosed",
    kind: "ai",
    notes: "Concept art was generated.\nNo AI text in the game.",
    language: "english",
    service: "Midjourney",
    name: "Fixture Game",
    source: "api",
  },
  kernel: {
    state: "disclosed",
    kind: "kernel",
    source: "api",
    name: "Easy Anti-Cheat",
    nameToken: "#Store_AntiCheat_Type_easyac",
    uninstallsCompletely: true,
    bootProtection: { token: "secureboot_tpm2" },
  },
  anticheat: {
    state: "disclosed",
    kind: "anticheat",
    source: "api",
    name: "VAC (Valve Anti-Cheat)",
    nameToken: "#Store_AntiCheat_Type_vac",
  },
  drm: {
    state: "disclosed",
    kind: "drm",
    source: "api",
    text: "Denuvo Anti-tamper",
    activationLimit: "5 a day",
  },
  account: {
    state: "disclosed",
    kind: "account",
    source: "api",
    text: "Ubisoft Account",
    linksToSteam: true,
  },
  eula: {
    state: "disclosed",
    kind: "eula",
    source: "api",
    items: [
      { name: "Game EULA", url: "https://store.steampowered.com/eula/1_eula_0" },
      { name: "Publisher terms" },
    ],
  },
  pvp: { state: "disclosed", kind: "pvp", source: "api", categoryIds: [49, 36] },
  iap: { state: "disclosed", kind: "iap", source: "api" },
  deck: { state: "disclosed", kind: "deck", source: "api", facet: "unsupported" },
  machine: { state: "disclosed", kind: "machine", source: "api", facet: "unsupported" },
};

/** Round trips: the verdicts of one or two kinds, the rest unknown `missing`. */
const SAMPLES: readonly (readonly [string, Partial<KindVerdicts>])[] = [
  ["a kernel anti-cheat with nothing but the flag", {
    kernel: { state: "disclosed", kind: "kernel", source: "api", uninstallsCompletely: false },
  }],
  ["a kernel anti-cheat with boot protection and no token", {
    kernel: {
      state: "disclosed",
      kind: "kernel",
      source: "api",
      uninstallsCompletely: true,
      bootProtection: {},
    },
  }],
  ["an anti-cheat with no name", {
    anticheat: { state: "disclosed", kind: "anticheat", source: "api" },
  }],
  ["a DRM text with no activation limit", {
    drm: { state: "disclosed", kind: "drm", source: "api", text: "Denuvo" },
  }],
  ["an account that does not link to Steam", {
    account: {
      state: "disclosed",
      kind: "account",
      source: "api",
      text: "EA",
      linksToSteam: false,
    },
  }],
  ["one EULA with no link", {
    eula: { state: "disclosed", kind: "eula", source: "api", items: [{ name: "Game terms" }] },
  }],
  ["every PvP category", {
    pvp: { state: "disclosed", kind: "pvp", source: "api", categoryIds: [49, 36, 47, 37] },
  }],
  ["AI notes read from the page", {
    ai: disclosedVerdict({ source: "html", language: "english" }),
  }],
];

describe("encodeVerdicts and decodeVerdicts", () => {
  it("round trip every state of every kind", () => {
    const all: readonly KindVerdicts[] = [
      uniformVerdicts("disclosed"),
      uniformVerdicts("not-disclosed"),
      uniformVerdicts("gated"),
      uniformVerdicts("missing"),
      uniformVerdicts("malformed"),
      { ...FULL_DISCLOSED, drm: UNKNOWN.malformed, pvp: UNKNOWN.malformed },
      { ...uniformVerdicts("not-disclosed"), ai: { state: "not-disclosed", source: "html" } },
      { ...FULL_DISCLOSED, drm: NOT_DISCLOSED, pvp: UNKNOWN.missing },
      { ...uniformVerdicts("not-disclosed"), pvp: UNKNOWN.unrequested },
    ];
    for (const verdicts of all) {
      expect(decodeVerdicts(encodeVerdicts(verdicts, T))).toStrictEqual({ verdicts, time: T });
    }
  });

  it.each(SAMPLES)("round trip %s", (_name, patch) => {
    const verdicts: KindVerdicts = { ...UNKNOWN_KINDS.missing, ...patch };
    expect(decodeVerdicts(encodeVerdicts(verdicts, T))).toStrictEqual({ verdicts, time: T });
  });

  it("stores the fetch time once and one entry for each kind", () => {
    const encoded = encodeVerdicts(uniformVerdicts("not-disclosed"), T);
    expect(encoded).toStrictEqual({
      time: T,
      kinds: perKind(() => ({ state: "not-disclosed", source: "api" })),
    });
    expect(Object.keys(perKind(() => 0))).toStrictEqual([...KIND_IDS]);
  });

  it("stores a disclosed verdict as itself, and the unknown ones as their reason", () => {
    expect(encodeVerdicts(FULL_DISCLOSED, T)).toStrictEqual({ time: T, kinds: STORED_KINDS });
    expect(encodeVerdicts(uniformVerdicts("gated"), T)).toStrictEqual({
      time: T,
      kinds: perKind(() => ({ state: "unknown", reason: "gated" })),
    });
  });

  it("leaves out the fields a payload does not have instead of storing them empty", () => {
    const bare: AiVerdict = {
      state: "disclosed",
      kind: "ai",
      notes: "x",
      language: "english",
      source: "api",
    };
    const stored = encodeVerdicts({
      ...aiVerdicts(bare),
      kernel: { state: "disclosed", kind: "kernel", source: "api", uninstallsCompletely: false },
      eula: { state: "disclosed", kind: "eula", source: "api", items: [{ name: "Game terms" }] },
    }, T);
    expect(stored).toMatchObject({
      kinds: {
        ai: { state: "disclosed", kind: "ai", notes: "x", language: "english", source: "api" },
        kernel: { state: "disclosed", kind: "kernel", source: "api", uninstallsCompletely: false },
        eula: { state: "disclosed", kind: "eula", source: "api", items: [{ name: "Game terms" }] },
      },
    });
    expect(JSON.stringify(stored)).not.toMatch(/undefined|null|nameToken|service|bootProtection/);
  });

  it("stores a kind whose field is malformed as such and keeps the other kinds", () => {
    const verdicts = { ...FULL_DISCLOSED, eula: UNKNOWN.malformed };
    expect(encodeVerdicts(verdicts, T)).toStrictEqual({
      time: T,
      kinds: { ...STORED_KINDS, eula: { state: "unknown", reason: "malformed" } },
    });
  });

  it("does not encode an app that has a verdict living in memory only", () => {
    expect(encodeVerdicts(UNKNOWN_KINDS.error, T)).toBeUndefined();
    expect(encodeVerdicts(UNKNOWN_KINDS["rate-limited"], T)).toBeUndefined();
    expect(encodeVerdicts(aiVerdicts(UNKNOWN.error), T)).toBeUndefined();
    expect(encodeVerdicts({ ...FULL_DISCLOSED, pvp: UNKNOWN.error }, T)).toBeUndefined();
    expect(encodeVerdicts({ ...FULL_DISCLOSED, drm: UNKNOWN["rate-limited"] }, T)).toBeUndefined();
  });

  it("shares the not disclosed verdict objects", () => {
    const html = {
      ...uniformVerdicts("not-disclosed"),
      ai: NOT_DISCLOSED_VERDICT.html,
    };
    const decoded = decodeVerdicts(encodeVerdicts(html, T));
    expect(decoded?.verdicts.ai).toBe(NOT_DISCLOSED_VERDICT.html);
    for (const id of KIND_IDS) {
      if (id !== "ai") {
        expect(decoded?.verdicts[id]).toBe(NOT_DISCLOSED_VERDICT.api);
      }
    }
  });

  it("shares the unknown verdict objects", () => {
    const decoded = decodeVerdicts(encodeVerdicts(UNKNOWN_KINDS.gated, T));
    for (const id of KIND_IDS) {
      expect(decoded?.verdicts[id]).toBe(UNKNOWN.gated);
    }
  });
});

describe("the sections in storage", () => {
  const asked = { ...FULL_DISCLOSED, sections: ["basic_info", "platforms"] } as const;

  it("round trips the sections an answer came with, and stores none without a record", () => {
    expect(encodeVerdicts(asked, T)).toMatchObject({ sections: ["basic_info", "platforms"] });
    expect(decodeVerdicts(encodeVerdicts(asked, T))).toStrictEqual({ verdicts: asked, time: T });
    expect(encodeVerdicts(FULL_DISCLOSED, T)).not.toHaveProperty("sections");
  });

  it.each([["a section it does not know", ["reviews"]], ["no list", "platforms"]])(
    "discards an entry with %s, so the app is fetched again",
    (_name, sections) => {
      expect(decodeVerdicts({ time: T, kinds: STORED_KINDS, sections })).toBeUndefined();
    },
  );
});

describe("the demo mark in storage", () => {
  const demo = withRelations(FULL_DISCLOSED, { parent: appId(3489340), demo: true });
  const stored = { time: T, kinds: STORED_KINDS, parent: 3489340 };

  it("round trips the mark beside the full game, and stores nothing for a DLC", () => {
    expect(encodeVerdicts(demo, T)).toMatchObject({ parent: 3489340, demo: true });
    expect(decodeVerdicts(encodeVerdicts(demo, T))).toStrictEqual({ verdicts: demo, time: T });
    const dlc = withRelations(FULL_DISCLOSED, { parent: appId(3489340) });
    expect(encodeVerdicts(dlc, T)).not.toHaveProperty("demo");
  });

  it.each([["false", false], ["a number", 1], ["a string", "true"]])(
    "discards an entry whose mark is %s, so the app is fetched again",
    (_name, value) => {
      expect(decodeVerdicts({ ...stored, demo: value })).toBeUndefined();
    },
  );

  it("stores the demo's own verdicts, never a lent one's mark", () => {
    const shown = { ...demo, ai: lent(FULL_DISCLOSED.ai) };
    expect(decodeVerdicts(encodeVerdicts(shown, T))?.verdicts.ai).toStrictEqual(FULL_DISCLOSED.ai);
  });
});

describe("the base game of a DLC in storage", () => {
  const parent = appId(1808500);
  const dlc = withRelations(FULL_DISCLOSED, { parent });
  const stored = { time: T, kinds: STORED_KINDS };

  it("round trips the parent with the verdicts", () => {
    expect(decodeVerdicts(encodeVerdicts(dlc, T))).toStrictEqual({ verdicts: dlc, time: T });
    expect(
      decodeVerdicts(
        encodeVerdicts(withRelations(uniformVerdicts("not-disclosed"), { parent }), T),
      ),
    )
      .toMatchObject({ verdicts: { parent } });
  });

  it("stores the parent as a number beside the kinds, and nothing for an app without one", () => {
    expect(encodeVerdicts(dlc, T)).toMatchObject({ time: T, parent: 1808500 });
    expect(encodeVerdicts(FULL_DISCLOSED, T)).not.toHaveProperty("parent");
    expect(encodeVerdicts(uniformVerdicts("missing"), T)).not.toHaveProperty("parent");
  });

  it("reads an entry stored before the field existed as an app with no parent", () => {
    const decoded = decodeVerdicts(stored);
    expect(decoded?.verdicts).toStrictEqual(FULL_DISCLOSED);
    expect(decoded?.verdicts).not.toHaveProperty("parent");
  });

  it("reads the parent of a stored entry", () => {
    expect(decodeVerdicts({ ...stored, parent: 1808500 })?.verdicts.parent).toBe(1808500);
  });

  it.each([
    ["a string", "1808500"],
    ["zero", 0],
    ["a negative number", -1],
    ["a fraction", 2.5],
    ["null", null],
    ["a list", [1808500]],
  ])("discards an entry whose parent is %s, so the app is fetched again", (_name, value) => {
    expect(decodeVerdicts({ ...stored, parent: value })).toBeUndefined();
  });
});

describe("the developers and publishers in storage", () => {
  const stored = { time: T, kinds: STORED_KINDS };
  const creators = creatorsFor({
    developers: [["Valve", 4], "Embark Studios"],
    publishers: [["Valve", 4]],
  });
  const known = withRelations(FULL_DISCLOSED, { creators });

  it("round trips the creators with the verdicts, clan IDs included", () => {
    expect(decodeVerdicts(encodeVerdicts(known, T))).toStrictEqual({ verdicts: known, time: T });
  });

  it("stores each creator as its name and clan ID, and nothing for an app without creators", () => {
    expect(encodeVerdicts(known, T)).toMatchObject({
      developers: [{ name: "Valve", clan: 4 }, { name: "Embark Studios" }],
      publishers: [{ name: "Valve", clan: 4 }],
    });
    for (const verdicts of [FULL_DISCLOSED, uniformVerdicts("missing")]) {
      const entry = encodeVerdicts(verdicts, T);
      expect(entry).not.toHaveProperty("developers");
      expect(entry).not.toHaveProperty("publishers");
    }
  });

  it("reads an entry stored before the fields existed as an app with no creators", () => {
    expect(decodeVerdicts(stored)?.verdicts).not.toHaveProperty("creators");
  });

  it("reads a role the entry lacks as having none", () => {
    const decoded = decodeVerdicts({ ...stored, publishers: [{ name: "Valve" }] });
    expect(decoded?.verdicts.creators).toStrictEqual(creatorsFor({ publishers: ["Valve"] }));
  });

  it.each([
    ["a string", "Valve"],
    ["an object", { name: "Valve" }],
    ["null", null],
    ["entries without a name", [{ clan: 4 }]],
    ["entries with a name that is no text", [{ name: 4 }]],
    ["entries with a clan ID that is no ID", [{ name: "Valve", clan: "4" }]],
    ["entries with a clan ID of zero", [{ name: "Valve", clan: 0 }]],
  ])("discards an entry whose developers are %s, so the app is fetched again", (_name, value) => {
    expect(decodeVerdicts({ ...stored, developers: value })).toBeUndefined();
  });
});

describe("decodeVerdicts", () => {
  const valid = { time: T, kinds: STORED_KINDS };

  /** The valid entry with the stored value of one kind replaced. */
  function withEntry(id: string, entry: unknown, time: unknown = T): unknown {
    return { time, kinds: { ...STORED_KINDS, [id]: entry } };
  }

  it("accepts the valid shape", () => {
    expect(decodeVerdicts(valid)).toStrictEqual({ verdicts: FULL_DISCLOSED, time: T });
  });

  it("discards values of the wrong type", () => {
    for (const stored of [undefined, null, 7, "disclosed", true, [], [valid]]) {
      expect(decodeVerdicts(stored)).toBeUndefined();
    }
  });

  it("discards an entry that lacks a registered kind", () => {
    expect(decodeVerdicts({ time: T, kinds: {} })).toBeUndefined();
    expect(decodeVerdicts({ time: T })).toBeUndefined();
    expect(decodeVerdicts({ time: T, kinds: { other: STORED_KINDS.ai } })).toBeUndefined();
    for (const id of KIND_IDS) {
      const kinds = Object.fromEntries(Object.entries(STORED_KINDS).filter(([key]) => key !== id));
      expect(decodeVerdicts({ time: T, kinds })).toBeUndefined();
    }
  });

  it("discards the v1 shape, which kept one verdict flat under the key", () => {
    const v1 = { state: "disclosed", time: T, notes: "text", language: "english", source: "api" };
    expect(decodeVerdicts(v1)).toBeUndefined();
    expect(decodeVerdicts({ state: "not-disclosed", time: T, source: "api" })).toBeUndefined();
  });

  it("discards an AI entry that carries no kind", () => {
    const { kind: _kind, ...legacy } = STORED_KINDS.ai;
    expect(decodeVerdicts(withEntry("ai", legacy))).toBeUndefined();
  });

  it("discards malformed entries instead of casting them", () => {
    const { ai, kernel, anticheat, drm, account, eula, pvp, iap, deck, machine } = STORED_KINDS;
    const bad: readonly unknown[] = [
      withEntry("ai", { ...ai, state: "maybe" }),
      withEntry("ai", { ...ai, state: undefined }),
      withEntry("ai", { ...ai, kind: "drm" }),
      withEntry("ai", { ...ai, kind: undefined }),
      withEntry("ai", ai, "yesterday"),
      withEntry("ai", ai, Number.NaN),
      { kinds: STORED_KINDS },
      withEntry("ai", { ...ai, notes: "" }),
      withEntry("ai", { ...ai, notes: 5 }),
      withEntry("ai", { ...ai, language: "klingon" }),
      withEntry("ai", { ...ai, language: undefined }),
      withEntry("ai", { ...ai, source: "guess" }),
      withEntry("ai", { ...ai, service: 3 }),
      withEntry("ai", { ...ai, name: null }),
      withEntry("ai", { state: "not-disclosed" }),
      withEntry("ai", { state: "unknown", reason: "error" }),
      withEntry("ai", { state: "unknown", reason: "rate-limited" }),
      withEntry("ai", { state: "unknown" }),
      withEntry("ai", null),
      withEntry("kernel", { ...kernel, uninstallsCompletely: undefined }),
      withEntry("kernel", { ...kernel, uninstallsCompletely: "yes" }),
      withEntry("kernel", { ...kernel, name: 7 }),
      withEntry("kernel", { ...kernel, nameToken: [] }),
      withEntry("kernel", { ...kernel, bootProtection: true }),
      withEntry("kernel", { ...kernel, bootProtection: { token: 1 } }),
      withEntry("kernel", { ...anticheat }),
      withEntry("anticheat", { ...anticheat, name: false }),
      withEntry("anticheat", { ...anticheat, kind: "kernel" }),
      withEntry("drm", { ...drm, text: "" }),
      withEntry("drm", { ...drm, text: undefined }),
      withEntry("drm", { ...drm, activationLimit: 5 }),
      withEntry("account", { ...account, text: "" }),
      withEntry("account", { ...account, linksToSteam: undefined }),
      withEntry("account", { ...account, linksToSteam: "true" }),
      withEntry("eula", { ...eula, items: [] }),
      withEntry("eula", { ...eula, items: "Game terms" }),
      withEntry("eula", { ...eula, items: [{ url: "https://store.steampowered.com/eula/1" }] }),
      withEntry("eula", { ...eula, items: [{ name: "Game terms", url: 5 }] }),
      withEntry("pvp", { ...pvp, categoryIds: [] }),
      withEntry("pvp", { ...pvp, categoryIds: ["49"] }),
      withEntry("pvp", { ...pvp, categoryIds: [49.5] }),
      withEntry("pvp", { ...pvp, categoryIds: undefined }),
      withEntry("iap", { ...iap, kind: "pvp" }),
      withEntry("deck", { ...deck, facet: "unknown" }),
      withEntry("machine", { ...machine, facet: undefined }),
    ];
    for (const stored of bad) {
      expect(decodeVerdicts(stored)).toBeUndefined();
    }
  });

  it("drops a stored link that is not an EULA link and keeps the name", () => {
    const items = [
      { name: "Script", url: "javascript:alert(1)" },
      { name: "Elsewhere", url: "https://example.com/eula/1" },
      { name: "Clean", url: "https://store.steampowered.com//eula/3_eula_0" },
      { name: "Plain" },
    ];
    const decoded = decodeVerdicts(withEntry("eula", { ...STORED_KINDS.eula, items }));
    expect(decoded?.verdicts.eula).toStrictEqual({
      state: "disclosed",
      kind: "eula",
      source: "api",
      items: [
        { name: "Script" },
        { name: "Elsewhere" },
        { name: "Clean", url: "https://store.steampowered.com/eula/3_eula_0" },
        { name: "Plain" },
      ],
    });
  });

  it("drops unknown keys and kinds", () => {
    const decoded = decodeVerdicts({
      time: T,
      extra: "x",
      kinds: {
        ...STORED_KINDS,
        ai: { ...STORED_KINDS.ai, extra: "x" },
        eula: { ...STORED_KINDS.eula, items: [{ name: "Game terms", extra: 1 }] },
        other: { state: "unknown" },
      },
    });
    expect(decoded?.verdicts).toStrictEqual({
      ...FULL_DISCLOSED,
      eula: { state: "disclosed", kind: "eula", source: "api", items: [{ name: "Game terms" }] },
    });
  });
});
