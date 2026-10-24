import { describe, expect, it } from "vitest";
import kinds from "../../../tests/fixtures/getitems/kinds.json";
import { appId, appIds } from "../../../tests/helpers/app-ids";
import { httpResult } from "../../../tests/helpers/fake-http";
import { fixtureItems, getItemsResponse, storeItem } from "../../../tests/helpers/getitems";
import { KIND_IDS } from "../kinds/id";
import { perKind } from "../kinds/registry";
import { type KindVerdicts, UNKNOWN_KINDS } from "../kinds/verdicts";
import { GETITEMS_URL, parseGetItems } from "./getitems";

// Every kind derived from the batch captured for the tag kinds (tests/fixtures/README.md).
const IDS = [3751950, 2807960, 1808500, 813230, 730, 570, 105600, 1245620, 1172470, 271590];
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
};

describe("parseGetItems over the tag kind fixture", () => {
  it("answers every requested ID with a verdict for every kind", () => {
    expect(verdicts.size).toBe(IDS.length + OTHER_ITEMS.length);
    for (const found of verdicts.values()) {
      expect(Object.keys(found)).toStrictEqual([...KIND_IDS]);
    }
  });

  it("reads DRM, account, EULA and a plain category list (3751950)", () => {
    expect(states(3751950)).toStrictEqual({
      ...NONE,
      drm: "disclosed",
      account: "disclosed",
      eula: "disclosed",
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
    });
    expect(of(1808500).kernel).toMatchObject({
      name: "Denuvo",
      nameToken: "#Store_AntiCheat_Type_denuvo",
      uninstallsCompletely: false,
    });
  });

  it("reads a game that declares nothing as not disclosed for every kind (813230)", () => {
    expect(states(813230)).toStrictEqual(NONE);
  });

  it("reads the VAC anti-cheat of Counter-Strike 2 and Dota 2 as non-kernel (730, 570)", () => {
    for (const id of [730, 570]) {
      expect(states(id)).toStrictEqual({ ...NONE, anticheat: "disclosed" });
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
    for (const id of [1172470, 271590]) {
      expect(states(id)).toStrictEqual({
        ...NONE,
        kernel: "disclosed",
        account: "disclosed",
        eula: "disclosed",
        pvp: "disclosed",
      });
    }
    expect(of(1172470).kernel).toMatchObject({ name: "Easy Anti-Cheat" });
    expect(of(271590).kernel).toMatchObject({ name: "BattlEye" });
  });

  it("is unknown missing for a package, a bundle and an ID that does not exist", () => {
    // The package has categories but no extra_details, so even PvP stays unknown.
    for (const id of OTHER_ITEMS) {
      expect(of(id)).toBe(UNKNOWN_KINDS.missing);
    }
  });
});

describe("parseGetItems with one malformed field", () => {
  function parse(item: unknown): KindVerdicts {
    const id = appId(1);
    const found = parseGetItems([id], httpResult(getItemsResponse([item]), GETITEMS_URL), "english")
      .get(id);
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

  function disclosedKinds(found: KindVerdicts): readonly string[] {
    return KIND_IDS.filter((id) => found[id].state === "disclosed");
  }

  it("costs only the kinds that read the field", () => {
    const cases: readonly (readonly [string, unknown, readonly string[]])[] = [
      ["content_survey_ai_notes", 5, ["ai"]],
      ["anticheat", "kernel", ["kernel", "anticheat"]],
      ["drm_third_party_type", 5, ["drm"]],
      ["user_account_third_party", 5, ["account"]],
      ["eula", "none", ["eula"]],
    ];
    for (const [field, value, lost] of cases) {
      const found = parse(storeItem(1, {
        categories: { supported_player_categoryids: [49] },
        extra_details: { ...FULL, [field]: value },
      }));
      const broken = KIND_IDS.filter((id) => {
        const verdict = found[id];
        return verdict.state === "unknown" && verdict.reason === "malformed";
      });
      expect(broken).toStrictEqual(KIND_IDS.filter((id) => lost.includes(id)));
      expect(disclosedKinds(found)).toStrictEqual(
        ["ai", "kernel", "drm", "account", "eula", "pvp"].filter((id) => !lost.includes(id)),
      );
    }
  });

  it("costs only PvP when the categories are malformed", () => {
    const found = parse(storeItem(1, { categories: "co-op", extra_details: FULL }));
    expect(found.pvp).toStrictEqual({ state: "unknown", reason: "malformed" });
    expect(disclosedKinds(found)).toStrictEqual(["ai", "kernel", "drm", "account", "eula"]);
  });

  it("reads an empty list for extra_details as an object that declares nothing", () => {
    const categories = { supported_player_categoryids: [2] };
    const found = parse(storeItem(1, { extra_details: [], categories }));
    expect(disclosedKinds(found)).toStrictEqual([]);
    for (const id of KIND_IDS) {
      expect(found[id].state).toBe("not-disclosed");
    }
  });

  it("keeps the item-level rule: no extra_details is unknown for every kind", () => {
    const categories = { supported_player_categoryids: [49] };
    expect(parse(storeItem(1, { extra_details: undefined, categories }))).toBe(
      UNKNOWN_KINDS.missing,
    );
  });
});
