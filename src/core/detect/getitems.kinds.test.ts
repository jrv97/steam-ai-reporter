import { describe, expect, it } from "vitest";
import kinds from "../../../tests/fixtures/getitems/kinds.json";
import platforms from "../../../tests/fixtures/getitems/platforms.json";
import { appId, appIds } from "../../../tests/helpers/app-ids";
import { httpResult } from "../../../tests/helpers/fake-http";
import {
  fixtureItems,
  getItemsResponse,
  itemIds,
  storeItem,
} from "../../../tests/helpers/getitems";
import { KIND_IDS } from "../kinds/id";
import { KINDS, perKind } from "../kinds/registry";
import { SECTIONS } from "../kinds/sections";
import { type KindVerdict, type KindVerdicts, UNKNOWN_KINDS } from "../kinds/verdicts";
import { GETITEMS_URL, parseGetItems } from "./getitems";

// Every kind derived from the batch captured for the tag kinds (tests/fixtures/README.md).
const DECLARING = [3751950, 2807960, 1808500, 730, 570, 105600, 1245620, 1172470, 271590];
// Games from 2004 to 2024 that declare nothing, and have no PvP or In-App Purchases category.
const NOTHING = [813230, 1145360, 413150, 504230, 367520, 2379780, 620];
const IDS = [...DECLARING, ...NOTHING];
const OTHER_ITEMS = [320795, 1, 99999999];

const verdicts = parseGetItems(
  appIds(...IDS, ...OTHER_ITEMS),
  httpResult(getItemsResponse(fixtureItems(kinds)), GETITEMS_URL),
  "english",
);

function of(id: number): KindVerdicts {
  const found = verdicts.get(appId(id));
  if (found === undefined) {
    throw new TypeError();
  }
  return found;
}

/** The state of each kind, with the reason for unknown. */
function states(id: number): Readonly<Record<string, string>> {
  const found = of(id);
  return perKind((kind) => {
    const verdict = found[kind.id];
    return verdict.state === "unknown" ? `unknown:${verdict.reason}` : verdict.state;
  });
}

const NONE = {
  ai: "not-disclosed",
  kernel: "not-disclosed",
  anticheat: "not-disclosed",
  drm: "not-disclosed",
  account: "not-disclosed",
  eula: "not-disclosed",
  pvp: "not-disclosed",
  iap: "not-disclosed",
  // The batch was parsed as asked without platforms, which Valve's ratings read.
  deck: "unknown:unrequested",
  machine: "unknown:unrequested",
};

describe("parseGetItems over the tag kind fixture", () => {
  it("answers every requested ID with a verdict for every kind", () => {
    expect(verdicts.size).toBe(IDS.length + OTHER_ITEMS.length);
    for (const found of verdicts.values()) {
      expect(Object.keys(found)).toStrictEqual(expect.arrayContaining([...KIND_IDS]));
    }
  });

  it("reads DRM, account, EULA and a plain category list (3751950)", () => {
    expect(states(3751950)).toStrictEqual({
      ...NONE,
      drm: "disclosed",
      account: "disclosed",
      eula: "disclosed",
      iap: "disclosed",
    });
    const found = of(3751950);
    expect(found.drm).toMatchObject({ text: "Denuvo Anti-tamper" });
    expect(found.drm).not.toHaveProperty("activationLimit");
    expect(found.account).toMatchObject({ text: "Ubisoft Account", linksToSteam: true });
    expect(found.eula).toMatchObject({
      items: [{
        name: "Assassin's Creed Black Flag Resynced EULA",
        url: "https://store.steampowered.com/eula/3751950_eula_0",
      }],
    });
  });

  it("reads a kernel anti-cheat with boot protection and no vendor name (2807960)", () => {
    expect(states(2807960)).toStrictEqual({
      ...NONE,
      kernel: "disclosed",
      account: "disclosed",
      eula: "disclosed",
      pvp: "disclosed",
      iap: "disclosed",
    });
    const found = of(2807960);
    expect(found.kernel).toStrictEqual({
      state: "disclosed",
      kind: "kernel",
      source: "api",
      uninstallsCompletely: true,
      bootProtection: { token: "secureboot_tpm2" },
    });
    expect(found.account).toMatchObject({ text: "EA Account linking required" });
    expect(found.pvp).toMatchObject({ categoryIds: [49, 36] });
  });

  it("reads a kernel anti-cheat from Denuvo next to AI notes (1808500)", () => {
    expect(states(1808500)).toStrictEqual({
      ...NONE,
      ai: "disclosed",
      kernel: "disclosed",
      eula: "disclosed",
      pvp: "disclosed",
      iap: "disclosed",
    });
    expect(of(1808500).kernel).toMatchObject({
      name: "Denuvo",
      nameToken: "#Store_AntiCheat_Type_denuvo",
      uninstallsCompletely: false,
    });
  });

  it("reads a game that declares nothing as not disclosed for every kind", () => {
    for (const id of NOTHING) {
      expect(states(id)).toStrictEqual(NONE);
    }
  });

  it("reads the VAC anti-cheat of Counter-Strike 2 and Dota 2 as non-kernel (730, 570)", () => {
    for (const id of [730, 570]) {
      expect(states(id)).toStrictEqual({ ...NONE, anticheat: "disclosed", iap: "disclosed" });
      expect(of(id).anticheat).toMatchObject({
        name: "VAC (Valve Anti-Cheat)",
        nameToken: "#Store_AntiCheat_Type_vac",
      });
    }
  });

  it("reads PvP from the categories and nothing else (105600, 1245620)", () => {
    expect(states(105600)).toStrictEqual({ ...NONE, pvp: "disclosed" });
    expect(of(105600).pvp).toMatchObject({ categoryIds: [49, 36] });
    expect(states(1245620)).toStrictEqual({ ...NONE, eula: "disclosed", pvp: "disclosed" });
    expect(of(1245620).eula).toMatchObject({
      items: [{ name: "ELDEN RING EULA" }, { name: "ELDEN RING EULA (JP)" }],
    });
  });

  it("reads Apex Legends and a delisted game like any other (1172470, 271590)", () => {
    const delisted = {
      ...NONE,
      kernel: "disclosed",
      account: "disclosed",
      eula: "disclosed",
      pvp: "disclosed",
    };
    expect(states(271590)).toStrictEqual(delisted);
    expect(states(1172470)).toStrictEqual({ ...delisted, iap: "disclosed" });
    expect(of(1172470).kernel).toMatchObject({ name: "Easy Anti-Cheat" });
    expect(of(271590).kernel).toMatchObject({ name: "BattlEye" });
  });

  it("is unknown missing for a package, a bundle and an ID that does not exist", () => {
    // The package has categories but no extra_details, so even PvP and IAP stay unknown.
    for (const id of OTHER_ITEMS) {
      expect(of(id)).toBe(UNKNOWN_KINDS.missing);
    }
  });
});

describe("parseGetItems over the platforms fixture, asked with every section", () => {
  const ids = itemIds(fixtureItems(platforms));
  const found = parseGetItems(
    ids,
    httpResult(getItemsResponse(fixtureItems(platforms)), GETITEMS_URL),
    "english",
    SECTIONS,
  );

  it.each(
    [
      ["Cyberpunk 2077", 1091500, "verified", "verified"],
      ["Counter-Strike 2", 730, "playable", "playable"],
      ["Red Dead Redemption 2", 1174180, "playable", "playable"],
      ["ARC Raiders, rated apart per device", 1808500, "playable", "verified"],
      ["Assassin's Creed Black Flag Resynced", 3751950, "verified", "verified"],
      ["Hades", 1145360, "verified", "verified"],
      ["the unreleased ReBlade, all zeros", 3489340, undefined, undefined],
      ["a large DLC with its own Deck rating", 2778580, "playable", undefined],
      ["a cosmetic DLC, all zeros, with nothing from its base game", 5201760, undefined, undefined],
    ] as const,
  )("reads %s (%s)", (_name, id, deck, machine) => {
    const verdicts = found.get(appId(id));
    const facet = (verdict: KindVerdict | undefined) =>
      verdict?.state === "disclosed" && "facet" in verdict ? verdict.facet : verdict?.state;
    expect([facet(verdicts?.deck), facet(verdicts?.machine)]).toStrictEqual([
      deck ?? "not-disclosed",
      machine ?? "not-disclosed",
    ]);
  });
});

describe("parseGetItems with one malformed field", () => {
  function parse(item: unknown): KindVerdicts {
    const id = appId(1);
    const result = httpResult(getItemsResponse([item]), GETITEMS_URL);
    const found = parseGetItems([id], result, "english", SECTIONS).get(id);
    if (found === undefined) {
      throw new TypeError();
    }
    return found;
  }

  const FULL = {
    content_survey_ai_notes: "Art.",
    anticheat: { kernel_mode: true },
    drm_third_party_type: "Denuvo",
    user_account_third_party: "EA",
    eula: [{ name: "Game terms", url: "https://store.steampowered.com//eula/1_eula_0" }],
  };

  const CATEGORIES = { supported_player_categoryids: [49], feature_categoryids: [35] };
  const PLATFORMS = { steam_deck_compat_category: 1, steam_machine_compat_category: 1 };
  // What FULL, CATEGORIES and PLATFORMS disclose: a kernel anti-cheat is not the other anti-cheat.
  const DISCLOSING = ["ai", "kernel", "drm", "account", "eula", "pvp", "iap", "deck", "machine"];

  function disclosedKinds(found: KindVerdicts): readonly string[] {
    return KIND_IDS.filter((id) => found[id].state === "disclosed");
  }

  /** A store item with FULL, CATEGORIES and PLATFORMS, and `details` over FULL. */
  function item(
    details: Readonly<Record<string, unknown>>,
    categories: unknown = CATEGORIES,
    platforms: unknown = PLATFORMS,
  ) {
    return storeItem(1, { categories, platforms, extra_details: { ...FULL, ...details } });
  }

  it.each<readonly [string, Readonly<Record<string, unknown>>, readonly string[]]>([
    ["content_survey_ai_notes", item({ content_survey_ai_notes: 5 }), ["ai"]],
    ["anticheat", item({ anticheat: "kernel" }), ["kernel", "anticheat"]],
    ["drm_third_party_type", item({ drm_third_party_type: 5 }), ["drm"]],
    ["user_account_third_party", item({ user_account_third_party: 5 }), ["account"]],
    ["eula", item({ eula: "none" }), ["eula"]],
    ["categories", item({}, "co-op"), ["pvp", "iap"]],
    [
      "supported_player_categoryids",
      item({}, { ...CATEGORIES, supported_player_categoryids: "49" }),
      ["pvp"],
    ],
    ["feature_categoryids", item({}, { ...CATEGORIES, feature_categoryids: [35, "1"] }), ["iap"]],
    ["platforms", item({}, CATEGORIES, "Steam Deck Verified"), ["deck", "machine"]],
    [
      "steam_machine_compat_category",
      item({}, CATEGORIES, { ...PLATFORMS, steam_machine_compat_category: 9 }),
      ["machine"],
    ],
  ])("costs only the kinds that read %s when it is malformed", (_field, raw, lost) => {
    const found = parse(raw);
    const broken = KIND_IDS.filter((id) => {
      const verdict = found[id];
      return verdict.state === "unknown" && verdict.reason === "malformed";
    });
    expect(broken).toStrictEqual(KIND_IDS.filter((id) => lost.includes(id)));
    expect(disclosedKinds(found)).toStrictEqual(DISCLOSING.filter((id) => !lost.includes(id)));
  });

  it("reads an empty list for extra_details as an object that declares nothing", () => {
    const categories = { supported_player_categoryids: [2], feature_categoryids: [22] };
    const found = parse(storeItem(1, { extra_details: [], categories }));
    expect(disclosedKinds(found)).toStrictEqual([]);
    for (const kind of KINDS.filter(({ sections }) => sections === undefined)) {
      expect(found[kind.id].state).toBe("not-disclosed");
    }
  });

  it("keeps the item-level rule: no extra_details is unknown for every kind", () => {
    const categories = { supported_player_categoryids: [49] };
    expect(parse(storeItem(1, { extra_details: undefined, categories }))).toBe(
      UNKNOWN_KINDS.missing,
    );
  });
});
