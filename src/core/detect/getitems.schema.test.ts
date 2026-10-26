import * as v from "valibot";
import { describe, expect, it } from "vitest";
import demoParent from "../../../tests/fixtures/getitems/demo-parent.json";
import dlc from "../../../tests/fixtures/getitems/dlc-parent.json";
import kinds from "../../../tests/fixtures/getitems/kinds.json";
import { fixtureItems, storeItem } from "../../../tests/helpers/getitems";
import { parseJson } from "../json";
import {
  type ExtraDetails,
  MALFORMED,
  MAX_LIST_LENGTH,
  MAX_TEXT_LENGTH,
  type StoreItem,
  StoreItemSchema,
} from "./getitems.schema";

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

describe("StoreItemSchema related_items", () => {
  const parentOf = (item: unknown) => parse(item).related_items?.parent_appid;

  it("reads the base game of the captured DLC as an app ID", () => {
    const [item] = fixtureItems(dlc);
    expect(parentOf(item)).toBe(1808500);
    expect(parse(item).extra_details?.content_survey_ai_notes).toContain("procedural-");
  });

  it("leaves the parent out when the item has none", () => {
    expect(parse(storeItem(1)).related_items).toBeUndefined();
    expect(parentOf(storeItem(1, { related_items: {} }))).toBeUndefined();
    expect(parentOf(storeItem(1, { related_items: [] }))).toBeUndefined();
    expect(parentOf(storeItem(1, { related_items: { demo_appid: 5 } }))).toBeUndefined();
  });

  it.each([
    ["a string", "1808500"],
    ["zero", 0],
    ["a negative number", -4],
    ["a fraction", 1.5],
    ["a number past 32 bits", 2 ** 32],
    ["null", null],
    ["a list", [1808500]],
  ])("reads %s as no parent and keeps the item", (_name, value) => {
    const item = parse(storeItem(1, { related_items: { parent_appid: value } }));
    expect(item.related_items?.parent_appid).toBeUndefined();
    expect(item.extra_details).toBeDefined();
  });

  it.each([
    ["a string", "x"],
    ["a number", 3],
    ["a list of entries", [1]],
    ["null", null],
  ])("reads related_items that is %s as absent and keeps the item", (_name, value) => {
    const item = parse(storeItem(1, { related_items: value }));
    expect(item.related_items).toBeUndefined();
    expect(item.id).toBe(1);
  });
});

describe("StoreItemSchema type", () => {
  it("reads the captured demo as type 1 and its full game as type 0 (demo-parent.json)", () => {
    const [game, demo] = fixtureItems(demoParent).map(parse);
    expect([game?.type, demo?.type]).toStrictEqual([0, 1]);
    expect(demo?.related_items?.parent_appid).toBe(3489340);
  });

  it.each([["a string", "1"], ["a fraction", 1.5], ["null", null], ["a list", [1]]])(
    "reads a type that is %s as absent and keeps the item",
    (_name, value) => {
      const item = parse(storeItem(1, { type: value }));
      expect(item.type).toBeUndefined();
      expect(item.extra_details).toBeDefined();
    },
  );
});

describe("StoreItemSchema leniency", () => {
  type Read = (details: ExtraDetails) => unknown;
  const bad: readonly (readonly [string, unknown, Read])[] = [
    ["content_survey_ai_notes", 42, (d) => d.content_survey_ai_notes],
    ["ai_generation_service", "OpenAI", (d) => d.ai_generation_service],
    ["anticheat", true, (d) => d.anticheat],
    ["drm_third_party_type", ["Denuvo"], (d) => d.drm_third_party_type],
    ["user_account_third_party", null, (d) => d.user_account_third_party],
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

  it("marks an anticheat object whose kernel flag has the wrong type as malformed", () => {
    for (const anticheat of [{ kernel_mode: "true" }, { kernel_mode: 1 }]) {
      expect(detailsOf(storeItem(1, { extra_details: { anticheat } })).anticheat).toBe(MALFORMED);
    }
  });

  it("reads a field that only enriches a verdict as absent when it is malformed", () => {
    const anticheat = {
      kernel_mode: true,
      uninstall_completely: "yes",
      boot_protection: 1,
      name: 3,
      name_loc: [],
      boot_protection_name: false,
    };
    const details = detailsOf(storeItem(1, {
      extra_details: {
        anticheat,
        drm_activation_limit: 5,
        user_account_third_party_link_to_steam: "yes",
      },
    }));
    expect(details.anticheat).toStrictEqual({
      kernel_mode: true,
      uninstall_completely: undefined,
      boot_protection: undefined,
      name: undefined,
      name_loc: undefined,
      boot_protection_name: undefined,
    });
    expect(details.drm_activation_limit).toBeUndefined();
    expect(details.user_account_third_party_link_to_steam).toBeUndefined();
  });

  it("marks a list with entries in the place of an object as malformed", () => {
    const details = detailsOf(
      storeItem(1, { extra_details: { anticheat: [1], ai_generation_service: [{}] } }),
    );
    expect(details.anticheat).toBe(MALFORMED);
    expect(details.ai_generation_service).toBe(MALFORMED);
    expect(parse(storeItem(1, { categories: [49] })).categories).toBe(MALFORMED);
  });

  it("reads an empty list in the place of an object as an empty object", () => {
    const item = parse(storeItem(1, {
      categories: [],
      extra_details: { anticheat: [], ai_generation_service: [] },
    }));
    expect(item.categories).toStrictEqual({});
    expect(item.extra_details?.anticheat).toStrictEqual({});
    expect(item.extra_details?.ai_generation_service).toStrictEqual({});
    expect(parse(storeItem(1, { extra_details: [] })).extra_details).toStrictEqual({});
  });

  it("marks an eula list with an entry that has no name string as malformed", () => {
    const wrong = [[{ url: "https://store.steampowered.com//eula/1" }], [3], [{ name: 4 }]];
    for (const eula of wrong) {
      expect(detailsOf(storeItem(1, { extra_details: { eula } })).eula).toBe(MALFORMED);
    }
  });

  it("reads an eula entry with a name and no link", () => {
    const eula = [{ name: "Game terms" }];
    expect(detailsOf(storeItem(1, { extra_details: { eula } })).eula).toStrictEqual(eula);
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
        storeItem(1, { extra_details: [1] }),
        { ...storeItem(1), id: "1" },
      ]
    ) {
      expect(v.safeParse(StoreItemSchema, parseJson(JSON.stringify(item))).success).toBe(false);
    }
  });

  describe("size caps", () => {
    const text = (length: number) => "x".repeat(length);
    const list = (length: number) => Array.from({ length }, () => ({ name: "Agreement" }));

    it("allows a developer string of 4,000 characters and marks a longer one malformed", () => {
      expect(MAX_TEXT_LENGTH).toBe(4000);
      const read = (value: string) =>
        detailsOf(storeItem(1, {
          extra_details: { drm_third_party_type: value, user_account_third_party: value },
        }));
      expect(read(text(4000)).drm_third_party_type).toBe(text(4000));
      expect(read(text(4000)).user_account_third_party).toBe(text(4000));
      expect(read(text(4001)).drm_third_party_type).toBe(MALFORMED);
      expect(read(text(4001)).user_account_third_party).toBe(MALFORMED);
    });

    it("applies the cap to the AI notes, the store name and the EULA names", () => {
      expect(
        detailsOf(storeItem(1, { extra_details: { content_survey_ai_notes: text(4001) } }))
          .content_survey_ai_notes,
      ).toBe(MALFORMED);
      expect(parse(storeItem(1, { name: text(4001) })).name).toBe(MALFORMED);
      expect(parse(storeItem(1, { name: text(4000) })).name).toBe(text(4000));
      const eula = [{ name: text(4001) }];
      expect(detailsOf(storeItem(1, { extra_details: { eula } })).eula).toBe(MALFORMED);
    });

    it("reads an over-long enrichment string as absent", () => {
      const details = detailsOf(storeItem(1, {
        extra_details: { drm_activation_limit: text(4001), anticheat: { name: text(4001) } },
      }));
      expect(details.drm_activation_limit).toBeUndefined();
      expect(details.anticheat).toStrictEqual({ name: undefined });
    });

    it("allows 50 EULA entries and marks 51 malformed", () => {
      expect(MAX_LIST_LENGTH).toBe(50);
      const read = (eula: unknown) => detailsOf(storeItem(1, { extra_details: { eula } })).eula;
      expect(read(list(50))).toHaveLength(50);
      expect(read(list(51))).toBe(MALFORMED);
    });

    it("allows 50 category IDs and marks 51 malformed", () => {
      const read = (ids: readonly number[]) =>
        parse(storeItem(1, { categories: { supported_player_categoryids: ids } })).categories;
      expect(read(Array.from({ length: 50 }, (_, i) => i))).toMatchObject({
        supported_player_categoryids: { length: 50 },
      });
      expect(read(Array.from({ length: 51 }, (_, i) => i))).toBe(MALFORMED);
    });
  });

  it("drops the keys it does not read", () => {
    const details = detailsOf(storeItem(1, { extra_details: { has_community_hub: true } }));
    expect(details).not.toHaveProperty("has_community_hub");
  });
});
