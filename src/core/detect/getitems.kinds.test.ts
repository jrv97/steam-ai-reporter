import { describe, expect, it } from "vitest";
import kinds from "../../../tests/fixtures/getitems/kinds.json";
import platforms from "../../../tests/fixtures/getitems/platforms.json";
import { make } from "../../../tests/helpers/factory";
import { itemIds } from "../../../tests/helpers/getitems";
import { KIND_IDS } from "../kinds/id";
import { KINDS, perKind } from "../kinds/registry";
import { SECTIONS } from "../kinds/sections";
import type { KindVerdicts } from "../kinds/verdicts";
import type { AppId } from "../types";
import { GETITEMS_URL, parseGetItems } from "./getitems";

const { app } = make.fixture;

/** The result of a GetItems request whose answer holds `items`. */
function answer(items: readonly unknown[]) {
  return make.http.result(make.item.response(items), GETITEMS_URL);
}

// Every item of the batch captured for the tag kinds (tests/fixtures/README.md).
const verdicts = parseGetItems(
  itemIds(make.fixture.items(kinds)),
  answer(make.fixture.items(kinds)),
  "english",
);

function of(id: AppId, from: ReadonlyMap<AppId, KindVerdicts> = verdicts): KindVerdicts {
  const found = from.get(id);
  if (found === undefined) {
    throw new TypeError();
  }
  return found;
}

/** The state of each kind, with the reason for unknown and the value for a disclosed facet. */
function states(id: AppId, from = verdicts): Readonly<Record<string, string>> {
  const found = of(id, from);
  return perKind((kind) => {
    const verdict = found[kind.id];
    if (verdict.state === "unknown") {
      return `unknown:${verdict.reason}`;
    }
    return "facet" in verdict ? `disclosed:${verdict.facet}` : verdict.state;
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
  // Valve lists Family Sharing for most paid games; the tests name the ones it leaves out.
  family: "disclosed:supported",
  // Nor was the release section, which Early Access reads.
  earlyaccess: "unknown:unrequested",
};

describe("parseGetItems over the tag kind fixture", () => {
  it("reads DRM, account, EULA and a plain category list (3751950)", () => {
    expect(states(app.drmAccountEula)).toStrictEqual({
      ...NONE,
      drm: "disclosed",
      account: "disclosed",
      eula: "disclosed",
      iap: "disclosed",
      family: "disclosed:unsupported",
    });
    const found = of(app.drmAccountEula);
    expect(found.drm).toMatchObject({ text: "Denuvo Anti-tamper" });
    expect(found.drm).not.toHaveProperty("activationLimit");
    expect(found.account).toMatchObject({ text: "Ubisoft Account", linksToSteam: true });
    expect(found.eula).toMatchObject({
      items: [{
        name: "Assassin's Creed Black Flag Resynced EULA",
        url: `https://store.steampowered.com/eula/${String(app.drmAccountEula)}_eula_0`,
      }],
    });
  });

  it("reads a kernel anti-cheat with boot protection and no vendor name (2807960)", () => {
    expect(states(app.kernelBootProtection)).toStrictEqual({
      ...NONE,
      kernel: "disclosed",
      account: "disclosed",
      eula: "disclosed",
      pvp: "disclosed",
      iap: "disclosed",
      family: "disclosed:unsupported",
    });
    const found = of(app.kernelBootProtection);
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
    expect(states(app.arcRaiders)).toStrictEqual({
      ...NONE,
      ai: "disclosed",
      kernel: "disclosed",
      eula: "disclosed",
      pvp: "disclosed",
      iap: "disclosed",
    });
    expect(of(app.arcRaiders).kernel).toMatchObject({
      name: "Denuvo",
      nameToken: "#Store_AntiCheat_Type_denuvo",
      uninstallsCompletely: false,
    });
  });

  it.each(make.fixture.kindsDeclaringNothing)(
    "reads %i, which declares nothing, as not disclosed for every kind",
    (id) => {
      expect(states(id)).toStrictEqual(NONE);
    },
  );

  it.each([app.vac, app.vacOther])("reads the VAC anti-cheat of %i as non-kernel", (id) => {
    expect(states(id)).toStrictEqual({
      ...NONE,
      anticheat: "disclosed",
      iap: "disclosed",
      // Free games are never tagged for Family Sharing.
      family: "not-disclosed",
    });
    expect(of(id).anticheat).toMatchObject({
      name: "VAC (Valve Anti-Cheat)",
      nameToken: "#Store_AntiCheat_Type_vac",
    });
  });

  it("reads PvP from the categories and nothing else (105600, 1245620)", () => {
    expect(states(app.pvp)).toStrictEqual({ ...NONE, pvp: "disclosed" });
    expect(of(app.pvp).pvp).toMatchObject({ categoryIds: [49, 36] });
    expect(states(app.pvpOther)).toStrictEqual({ ...NONE, eula: "disclosed", pvp: "disclosed" });
    expect(of(app.pvpOther).eula).toMatchObject({
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
    expect(states(app.battlEye)).toStrictEqual({ ...delisted, family: "disclosed:unsupported" });
    expect(states(app.easyAntiCheat)).toStrictEqual({
      ...delisted,
      iap: "disclosed",
      family: "not-disclosed",
    });
    expect(of(app.easyAntiCheat).kernel).toMatchObject({ name: "Easy Anti-Cheat" });
    expect(of(app.battlEye).kernel).toMatchObject({ name: "BattlEye" });
  });

  // The package has categories but no extra_details, so even PvP and IAP stay unknown.
  it.each(make.fixture.kindsWithoutDetails)(
    "is unknown missing for %i, a package, a bundle or no app",
    (id) => {
      expect(of(id)).toBe(make.verdicts.uniform("missing"));
    },
  );
});

describe("parseGetItems over the early access captures, asked with the release section", () => {
  const found = parseGetItems(
    [app.earlyAccess, app.leftEarlyAccess],
    answer(make.fixture.items(kinds)),
    "english",
    ["basic_info", "release"],
  );

  it("reads a flagged game with the developer's note and the Steam release date (2514910)", () => {
    const verdict = found.get(app.earlyAccess)?.earlyaccess;
    if (verdict?.state !== "disclosed") {
      throw new TypeError();
    }
    const { note, ...rest } = verdict;
    expect(rest).toStrictEqual({
      state: "disclosed",
      kind: "earlyaccess",
      source: "api",
      released: make.fixture.released,
    });
    expect(note).toMatch(/^You can also experience the special systems/);
  });

  it("reads a game that left early access as not disclosed, whatever its note (646570)", () => {
    // The capture still holds the developer's note, which the schema test reads.
    expect(found.get(app.leftEarlyAccess)?.earlyaccess).toStrictEqual(
      make.verdict.notDisclosed("api"),
    );
  });
});

describe("parseGetItems over the platforms fixture, asked with every section", () => {
  const items = make.fixture.items(platforms);
  const found = parseGetItems(itemIds(items), answer(items), "english", SECTIONS);
  const [VERIFIED, PLAYABLE] = ["disclosed:verified", "disclosed:playable"] as const;

  it.each(
    [
      ["Cyberpunk 2077", app.verified, VERIFIED, VERIFIED],
      ["Counter-Strike 2", app.vac, PLAYABLE, PLAYABLE],
      ["Red Dead Redemption 2", app.familyLeftOut, PLAYABLE, PLAYABLE],
      ["ARC Raiders, rated apart per device", app.arcRaiders, PLAYABLE, VERIFIED],
      ["Assassin's Creed Black Flag Resynced", app.drmAccountEula, VERIFIED, VERIFIED],
      ["Hades", app.verifiedOther, VERIFIED, VERIFIED],
      ["the unreleased ReBlade, all zeros", app.demoParent, "not-disclosed", "not-disclosed"],
      ["a large DLC with its own Deck rating", app.largeDlc, PLAYABLE, "not-disclosed"],
      [
        "a cosmetic DLC, all zeros, with nothing from its base game",
        app.dlc,
        "not-disclosed",
        "not-disclosed",
      ],
    ] as const,
  )("reads %s (%s)", (_name, id, deck, machine) => {
    expect(states(id, found)).toMatchObject({ deck, machine });
  });
});

describe("parseGetItems with one malformed field", () => {
  const ID = make.appId();
  const CATEGORIES = make.item.declaringCategories;
  const PLATFORMS = make.item.declaringPlatforms;

  function parse(item: unknown): KindVerdicts {
    const found = parseGetItems([ID], answer([item]), "english", SECTIONS).get(ID);
    if (found === undefined) {
      throw new TypeError();
    }
    return found;
  }

  // What a declaring item discloses: a kernel anti-cheat is not the other anti-cheat, and a paid
  // game whose features lack 62 is not available for Family Sharing.
  const DISCLOSING = [
    "ai",
    "kernel",
    "drm",
    "account",
    "eula",
    "pvp",
    "iap",
    "deck",
    "machine",
    "family",
  ];

  function disclosedKinds(found: KindVerdicts): readonly string[] {
    return KIND_IDS.filter((id) => found[id].state === "disclosed");
  }

  function declaring(parts: Parameters<typeof make.item.declaring>[1]) {
    return make.item.declaring(ID, parts);
  }

  it.each<readonly [string, Readonly<Record<string, unknown>>, readonly string[]]>([
    ["content_survey_ai_notes", declaring({ details: { content_survey_ai_notes: 5 } }), ["ai"]],
    ["anticheat", declaring({ details: { anticheat: "kernel" } }), ["kernel", "anticheat"]],
    ["drm_third_party_type", declaring({ details: { drm_third_party_type: 5 } }), ["drm"]],
    [
      "user_account_third_party",
      declaring({ details: { user_account_third_party: 5 } }),
      ["account"],
    ],
    ["eula", declaring({ details: { eula: "none" } }), ["eula"]],
    ["categories", declaring({ categories: "co-op" }), ["pvp", "iap", "family"]],
    [
      "supported_player_categoryids",
      declaring({ categories: { ...CATEGORIES, supported_player_categoryids: "49" } }),
      ["pvp"],
    ],
    [
      "feature_categoryids",
      declaring({ categories: { ...CATEGORIES, feature_categoryids: [35, "1"] } }),
      ["iap", "family"],
    ],
    ["is_free", make.item.declaring(ID, {}, { is_free: "no" }), ["family"]],
    ["platforms", declaring({ platforms: "Steam Deck Verified" }), ["deck", "machine"]],
    [
      "steam_machine_compat_category",
      declaring({ platforms: { ...PLATFORMS, steam_machine_compat_category: 9 } }),
      ["machine"],
    ],
  ])("costs only the kinds that read %s when it is malformed", (_field, raw, lost) => {
    const found = parse(raw);
    const broken = KIND_IDS.filter((id) => {
      const verdict = found[id];
      return verdict.state === "unknown" && verdict.reason === "malformed";
    });
    expect(broken).toStrictEqual(KIND_IDS.filter((id) => lost.includes(id)));
    expect(disclosedKinds(found)).toStrictEqual(
      KIND_IDS.filter((id) => DISCLOSING.includes(id) && !lost.includes(id)),
    );
  });

  it("reads an empty list for extra_details as an object that declares nothing", () => {
    const categories = { supported_player_categoryids: [2], feature_categoryids: [22] };
    // A free game, which Family Sharing never tags from its features.
    const found = parse(make.item.details([], { categories, is_free: true }, ID));
    expect(disclosedKinds(found)).toStrictEqual([]);
    for (const kind of KINDS.filter(({ sections }) => sections === undefined)) {
      expect(found[kind.id].state).toBe("not-disclosed");
    }
  });
});
