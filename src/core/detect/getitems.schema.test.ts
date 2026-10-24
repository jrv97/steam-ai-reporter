import * as v from "valibot";
import { describe, expect, it } from "vitest";
import kinds from "../../../tests/fixtures/getitems/kinds.json";
import { fixtureItems, storeItem } from "../../../tests/helpers/getitems";
import { parseJson } from "../json";
import { type ExtraDetails, MALFORMED, type StoreItem, StoreItemSchema } from "./getitems.schema";

/** The item as a response body carries it, after a JSON round trip. */
function parse(item: unknown) {
  return v.parse(StoreItemSchema, parseJson(JSON.stringify(item)));
}

function detailsOf(item: unknown) {
  const details = parse(item).extra_details;
  if (details === undefined) {
    throw new TypeError();
  }
  return details;
}

describe("StoreItemSchema over the captured kinds", () => {
  const items = new Map<number, StoreItem>(
    fixtureItems(kinds).map((raw): [number, StoreItem] => {
      const item = parse(raw);
      return [item.id, item];
    }),
  );

  it("reads the DRM, account and EULA fields", () => {
    const details = items.get(3751950)?.extra_details;
    expect(details?.drm_third_party_type).toBe("Denuvo Anti-tamper");
    expect(details?.user_account_third_party).toBe("Ubisoft Account");
    expect(details?.user_account_third_party_link_to_steam).toBe(true);
    expect(details?.eula).toStrictEqual([{
      name: "Assassin's Creed Black Flag Resynced EULA",
      url: "https://store.steampowered.com//eula/3751950_eula_0",
    }]);
  });

  it("reads the anti-cheat object, with and without a name", () => {
    expect(items.get(2807960)?.extra_details?.anticheat).toStrictEqual({
      kernel_mode: true,
      uninstall_completely: true,
      boot_protection: true,
      boot_protection_name: "secureboot_tpm2",
    });
    expect(items.get(730)?.extra_details?.anticheat).toStrictEqual({
      name: "VAC (Valve Anti-Cheat)",
      name_loc: "#Store_AntiCheat_Type_vac",
    });
  });

  it("reads the player categories from the item, not from extra_details", () => {
    expect(items.get(105600)?.categories).toMatchObject({
      supported_player_categoryids: [2, 1, 49, 36, 9, 38],
    });
    expect(items.get(105600)?.extra_details).not.toHaveProperty("categories");
  });

  it("leaves a key out when the fixture has none", () => {
    expect(items.get(813230)?.extra_details).not.toHaveProperty("anticheat");
    expect(items.get(320795)?.extra_details).toBeUndefined();
    expect(items.get(320795)?.categories).toBeDefined();
    expect(items.get(1)?.categories).toBeUndefined();
  });
});

describe("StoreItemSchema leniency", () => {
  type Read = (details: ExtraDetails) => unknown;
  const bad: readonly (readonly [string, unknown, Read])[] = [
    ["content_survey_ai_notes", 42, (d) => d.content_survey_ai_notes],
    ["ai_generation_service", "OpenAI", (d) => d.ai_generation_service],
    ["anticheat", true, (d) => d.anticheat],
    ["drm_third_party_type", ["Denuvo"], (d) => d.drm_third_party_type],
    ["drm_activation_limit", 5, (d) => d.drm_activation_limit],
    ["user_account_third_party", null, (d) => d.user_account_third_party],
    [
      "user_account_third_party_link_to_steam",
      "yes",
      (d) => d.user_account_third_party_link_to_steam,
    ],
    ["eula", "none", (d) => d.eula],
  ];

  it.each(bad)("marks %s as malformed and keeps the item", (key, value, read) => {
    const details = detailsOf(storeItem(1, { extra_details: { vetted: true, [key]: value } }));
    expect(read(details)).toBe(MALFORMED);
  });

  it("marks only the malformed field, not its neighbours", () => {
    const details = detailsOf(storeItem(1, {
      extra_details: { anticheat: 3, drm_third_party_type: "Denuvo" },
    }));
    expect(details.anticheat).toBe(MALFORMED);
    expect(details.drm_third_party_type).toBe("Denuvo");
  });

  it("marks an anticheat object with a field of the wrong type as malformed", () => {
    const wrong = [{ kernel_mode: "true" }, { name: 3 }, { boot_protection_name: false }];
    for (const anticheat of wrong) {
      expect(detailsOf(storeItem(1, { extra_details: { anticheat } })).anticheat).toBe(MALFORMED);
    }
  });

  it("marks an array in the place of an object as malformed, not as an empty object", () => {
    const details = detailsOf(
      storeItem(1, { extra_details: { anticheat: [], ai_generation_service: [] } }),
    );
    expect(details.anticheat).toBe(MALFORMED);
    expect(details.ai_generation_service).toBe(MALFORMED);
    expect(parse(storeItem(1, { categories: [49] })).categories).toBe(MALFORMED);
  });

  it("marks an eula list with an entry that is not name and url strings as malformed", () => {
    const wrong = [[{ name: "EULA" }], [{ url: "https://store.steampowered.com//eula/1" }], [3]];
    for (const eula of wrong) {
      expect(detailsOf(storeItem(1, { extra_details: { eula } })).eula).toBe(MALFORMED);
    }
  });

  it("marks malformed categories and names without dropping the item", () => {
    const item = parse(storeItem(1, { categories: "co-op", name: 9 }));
    expect(item.categories).toBe(MALFORMED);
    expect(item.name).toBe(MALFORMED);
    expect(parse(storeItem(1, { categories: { supported_player_categoryids: "49" } })).categories)
      .toBe(MALFORMED);
    expect(
      parse(storeItem(1, { categories: { supported_player_categoryids: [49, "36"] } }))
        .categories,
    ).toBe(MALFORMED);
  });

  it("still rejects an item whose id, success or extra_details is unusable", () => {
    for (
      const item of [
        storeItem(1, { success: "1" }),
        storeItem(1, { extra_details: "none" }),
        storeItem(1, { extra_details: null }),
        storeItem(1, { extra_details: [] }),
        { ...storeItem(1), id: "1" },
      ]
    ) {
      expect(v.safeParse(StoreItemSchema, parseJson(JSON.stringify(item))).success).toBe(false);
    }
  });

  it("drops the keys it does not read", () => {
    const details = detailsOf(storeItem(1, { extra_details: { has_community_hub: true } }));
    expect(details).not.toHaveProperty("has_community_hub");
  });
});
