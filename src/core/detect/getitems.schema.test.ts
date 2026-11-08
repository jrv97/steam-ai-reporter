import * as v from "valibot";
import { describe, expect, it } from "vitest";
import demoParent from "../../../tests/fixtures/getitems/demo-parent.json";
import dlc from "../../../tests/fixtures/getitems/dlc-parent.json";
import kinds from "../../../tests/fixtures/getitems/kinds.json";
import { make } from "../../../tests/helpers/factory";
import { parseJson } from "../json";
import {
  type ExtraDetails,
  MALFORMED,
  MAX_LIST_LENGTH,
  MAX_TEXT_LENGTH,
  type StoreItem,
  StoreItemSchema,
} from "./getitems.schema";

const { app } = make.fixture;

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

/** The parsed extra details of an item whose `extra_details` are `details`. */
function readDetails(details: unknown) {
  return detailsOf(make.item.details(details));
}

/** The category lists the kinds read. */
const CATEGORY_LISTS = ["supported_player_categoryids", "feature_categoryids"] as const;

describe("StoreItemSchema over the captured kinds", () => {
  const items = new Map<number, StoreItem>(
    make.fixture.items(kinds).map((raw): [number, StoreItem] => {
      const item = parse(raw);
      return [item.id, item];
    }),
  );

  it("reads the DRM, account and EULA fields", () => {
    const details = items.get(app.drmAccountEula)?.extra_details;
    expect(details?.drm_third_party_type).toBe("Denuvo Anti-tamper");
    expect(details?.user_account_third_party).toBe("Ubisoft Account");
    expect(details?.user_account_third_party_link_to_steam).toBe(true);
    expect(details?.eula).toStrictEqual([{
      name: "Assassin's Creed Black Flag Resynced EULA",
      url: `https://store.steampowered.com//eula/${String(app.drmAccountEula)}_eula_0`,
    }]);
  });

  it("reads the anti-cheat object, with and without a name", () => {
    expect(items.get(app.kernelBootProtection)?.extra_details?.anticheat).toStrictEqual({
      kernel_mode: true,
      uninstall_completely: true,
      boot_protection: true,
      boot_protection_name: "secureboot_tpm2",
    });
    expect(items.get(app.vac)?.extra_details?.anticheat).toStrictEqual({
      name: "VAC (Valve Anti-Cheat)",
      name_loc: "#Store_AntiCheat_Type_vac",
    });
  });

  it("reads the player and feature categories from the item, not from extra_details", () => {
    expect(items.get(app.pvp)?.categories).toStrictEqual({
      supported_player_categoryids: [2, 1, 49, 36, 9, 38],
      feature_categoryids: [22, 29, 30, 23, 41, 42, 43, 62],
    });
    expect(items.get(app.pvp)?.extra_details).not.toHaveProperty("categories");
  });

  it("leaves a key out when the fixture has none", () => {
    expect(items.get(app.noKind)?.extra_details).not.toHaveProperty("anticheat");
    expect(items.get(app.packageItem)?.extra_details).toBeUndefined();
    expect(items.get(app.packageItem)?.categories).toBeDefined();
    expect(items.get(app.bundle)?.categories).toBeUndefined();
  });
});

describe("StoreItemSchema related_items", () => {
  const parentOf = (item: unknown) => parse(item).related_items?.parent_appid;

  it("reads the base game of the captured DLC as an app ID", () => {
    const [item] = make.fixture.items(dlc);
    expect(parentOf(item)).toBe(make.fixture.dlcBase);
    expect(parse(item).extra_details?.content_survey_ai_notes).toContain("procedural-");
  });

  it("leaves the parent out when the item has none", () => {
    const withRelated = (related: unknown) =>
      make.item.store(make.appId(), { related_items: related });
    expect(parse(make.item.store()).related_items).toBeUndefined();
    expect(parentOf(withRelated({}))).toBeUndefined();
    expect(parentOf(withRelated([]))).toBeUndefined();
    expect(parentOf(withRelated({ demo_appid: make.appId() }))).toBeUndefined();
  });

  it.each([
    ["a string", String(make.appId())],
    ["zero", 0],
    ["a negative number", -4],
    ["a fraction", 1.5],
    ["a number past 32 bits", 2 ** 32],
    ["null", null],
    ["a list", [make.appId()]],
  ])("reads %s as no parent and keeps the item", (_name, value) => {
    const item = parse(make.item.store(make.appId(), { related_items: { parent_appid: value } }));
    expect(item.related_items?.parent_appid).toBeUndefined();
    expect(item.extra_details).toBeDefined();
  });

  it.each([
    ["a string", "x"],
    ["a number", 3],
    ["a list of entries", [1]],
    ["null", null],
  ])("reads related_items that is %s as absent and keeps the item", (_name, value) => {
    const id = make.appId();
    const item = parse(make.item.store(id, { related_items: value }));
    expect(item.related_items).toBeUndefined();
    expect(item.id).toBe(id);
  });
});

describe("StoreItemSchema type", () => {
  it("reads the captured demo as type 1 and its full game as type 0 (demo-parent.json)", () => {
    const [game, demo] = make.fixture.items(demoParent).map(parse);
    expect([game?.type, demo?.type]).toStrictEqual([0, 1]);
    expect(demo?.related_items?.parent_appid).toBe(app.demoParent);
  });

  it.each([["a string", "1"], ["a fraction", 1.5], ["null", null], ["a list", [1]]])(
    "reads a type that is %s as absent and keeps the item",
    (_name, value) => {
      const item = parse(make.item.store(make.appId(), { type: value }));
      expect(item.type).toBeUndefined();
      expect(item.extra_details).toBeDefined();
    },
  );
});

describe("StoreItemSchema early access fields", () => {
  const captured = (id: number) => {
    const item = make.fixture.items(kinds).map(parse).find((each) => each.id === id);
    if (item === undefined) {
      throw new TypeError(String(id));
    }
    return item;
  };
  const noteOf = (item: StoreItem) => item.extra_details?.early_access?.why_bbcode;

  it("reads the flag, the release date and the note of a game in early access (2514910)", () => {
    const item = captured(app.earlyAccess);
    expect(item.is_early_access).toBe(true);
    expect(item.release?.steam_release_date).toBe(make.fixture.released);
    expect(noteOf(item)).toMatch(/^You can also experience the special systems/);
  });

  it("reads the note and the date of a game that left early access, with no flag (646570)", () => {
    const item = captured(app.leftEarlyAccess);
    expect(item.is_early_access).toBeUndefined();
    expect(item.release?.steam_release_date).toBe(1548258674);
    expect(noteOf(item)).toMatch(/^\[b\]TL;DR:/);
  });

  it.each<readonly [string, unknown, unknown]>([
    ["true", true, true],
    ["false", false, false],
    ["text", "yes", MALFORMED],
    ["a number", 1, MALFORMED],
    ["null", null, MALFORMED],
    ["a list", [true], MALFORMED],
  ])("reads a flag that is %s as %s, and keeps the item", (_name, value, expected) => {
    const item = parse(make.item.store(make.appId(), { is_early_access: value }));
    expect(item.is_early_access).toBe(expected);
    expect(item.extra_details).toBeDefined();
  });

  it("leaves the flag out when the item has none", () => {
    expect(parse(make.item.store())).not.toHaveProperty("is_early_access");
  });

  it.each<readonly [string, unknown]>([
    ["a negative time", -1],
    ["a fraction", 1.5],
    ["a time no date format can show", 9_000_000_000_000],
    ["text", String(make.fixture.released)],
    ["null", null],
  ])("reads a release date that is %s as absent, and keeps the item", (_name, value) => {
    const item = parse(make.item.store(make.appId(), { release: { steam_release_date: value } }));
    expect(item.release?.steam_release_date).toBeUndefined();
    expect(item.extra_details).toBeDefined();
  });

  it.each<readonly [string, unknown]>([
    ["text", "2024"],
    ["a list with entries", [1]],
    ["null", null],
  ])("reads a release section that is %s as absent, and keeps the item", (_name, value) => {
    const id = make.appId();
    const item = parse(make.item.store(id, { release: value }));
    expect(item.release).toBeUndefined();
    expect(item.id).toBe(id);
  });

  it.each<readonly [string, unknown]>([
    ["a number", { why_bbcode: 5 }],
    ["null", { why_bbcode: null }],
    ["over the text limit", { why_bbcode: make.text.ofLength(MAX_TEXT_LENGTH + 1) }],
  ])("reads a note that is %s as absent, and keeps the item", (_name, early_access) => {
    expect(readDetails({ early_access }).early_access?.why_bbcode).toBeUndefined();
  });

  it.each<readonly [string, unknown]>([
    ["text", "yes"],
    ["a list with entries", [1]],
    ["null", null],
  ])("reads an early_access value that is %s as absent, and keeps the item", (_name, value) => {
    expect(readDetails({ early_access: value }).early_access).toBeUndefined();
  });

  it("allows a note of 4,000 characters", () => {
    const why_bbcode = make.text.ofLength(MAX_TEXT_LENGTH);
    expect(readDetails({ early_access: { why_bbcode } }).early_access?.why_bbcode).toBe(
      why_bbcode,
    );
  });

  it("drops the sibling fields of the note, which no kind reads", () => {
    const why_bbcode = make.text.note();
    const early_access = { why_bbcode, what_is_planned_bbcode: make.text.note() };
    expect(readDetails({ early_access }).early_access).toStrictEqual({ why_bbcode });
  });
});

describe("StoreItemSchema leniency", () => {
  it.each<readonly [keyof ExtraDetails, unknown]>([
    ["content_survey_ai_notes", 42],
    ["ai_generation_service", make.text.service()],
    ["ai_generation_service", [{}]],
    ["anticheat", true],
    ["anticheat", { kernel_mode: "true" }],
    ["anticheat", { kernel_mode: 1 }],
    ["anticheat", [1]],
    ["drm_third_party_type", [make.text.service()]],
    ["user_account_third_party", null],
    ["eula", "none"],
    ["eula", [{ url: make.text.url() }]],
    ["eula", [3]],
    ["eula", [{ name: 4 }]],
  ])("marks %s that is %j as malformed and keeps the item", (key, value) => {
    expect(readDetails({ vetted: true, [key]: value })[key]).toBe(MALFORMED);
  });

  it("marks only the malformed field, not its neighbours", () => {
    const drm = make.text.service();
    const details = readDetails({ anticheat: 3, drm_third_party_type: drm });
    expect(details.anticheat).toBe(MALFORMED);
    expect(details.drm_third_party_type).toBe(drm);
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
    const details = readDetails({
      anticheat,
      drm_activation_limit: 5,
      user_account_third_party_link_to_steam: "yes",
    });
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

  it("reads an empty list in the place of an object as an empty object", () => {
    const item = parse(make.item.details({ anticheat: [], ai_generation_service: [] }, {
      categories: [],
    }));
    expect(item.categories).toStrictEqual({});
    expect(item.extra_details?.anticheat).toStrictEqual({});
    expect(item.extra_details?.ai_generation_service).toStrictEqual({});
    expect(readDetails([])).toStrictEqual({});
  });

  it("reads an eula entry with a name and no link", () => {
    const eula = [{ name: make.text.name() }];
    expect(readDetails({ eula }).eula).toStrictEqual(eula);
  });

  it.each<readonly [keyof StoreItem, unknown]>([
    ["categories", "co-op"],
    ["categories", [49]],
    ["name", 9],
  ])("marks %s that is %j as malformed without dropping the item", (key, value) => {
    const id = make.appId();
    const item = parse(make.item.store(id, { [key]: value }));
    expect(item[key]).toBe(MALFORMED);
    expect(item.id).toBe(id);
  });

  it.each(CATEGORY_LISTS.flatMap((list) => [[list, "49"], [list, [49, "36"]]] as const))(
    "marks %s that is %j as malformed and keeps the other list",
    (list, bad) => {
      const lists = { supported_player_categoryids: [2], feature_categoryids: [35] };
      const raw = make.item.store(make.appId(), { categories: { ...lists, [list]: bad } });
      expect(parse(raw).categories).toStrictEqual({ ...lists, [list]: MALFORMED });
    },
  );

  it.each<readonly [string, unknown]>([
    ["a success that is text", make.item.store(make.appId(), { success: "1" })],
    ["extra_details that is text", make.item.details("none")],
    ["extra_details that is null", make.item.details(null)],
    ["extra_details that is a list with entries", make.item.details([1])],
    ["an id that is text", make.item.store(make.appId(), { id: String(make.appId()) })],
  ])("still rejects an item with %s", (_name, item) => {
    expect(v.safeParse(StoreItemSchema, parseJson(JSON.stringify(item))).success).toBe(false);
  });

  describe("size caps", () => {
    const list = (length: number) => Array.from({ length }, () => ({ name: make.text.name() }));

    it("allows a developer string of 4,000 characters and marks a longer one malformed", () => {
      expect(MAX_TEXT_LENGTH).toBe(4000);
      const [fits, over] = [make.text.ofLength(4000), make.text.ofLength(4001)];
      const read = (value: string) =>
        readDetails({ drm_third_party_type: value, user_account_third_party: value });
      expect(read(fits).drm_third_party_type).toBe(fits);
      expect(read(fits).user_account_third_party).toBe(fits);
      expect(read(over).drm_third_party_type).toBe(MALFORMED);
      expect(read(over).user_account_third_party).toBe(MALFORMED);
    });

    it("applies the cap to the AI notes, the store name and the EULA names", () => {
      const [fits, over] = [make.text.ofLength(4000), make.text.ofLength(4001)];
      expect(readDetails({ content_survey_ai_notes: over }).content_survey_ai_notes).toBe(
        MALFORMED,
      );
      expect(parse(make.item.store(make.appId(), { name: over })).name).toBe(MALFORMED);
      expect(parse(make.item.store(make.appId(), { name: fits })).name).toBe(fits);
      expect(readDetails({ eula: [{ name: over }] }).eula).toBe(MALFORMED);
    });

    it("reads an over-long enrichment string as absent", () => {
      const details = readDetails({
        drm_activation_limit: make.text.ofLength(4001),
        anticheat: { name: make.text.ofLength(4001) },
      });
      expect(details.drm_activation_limit).toBeUndefined();
      expect(details.anticheat).toStrictEqual({ name: undefined });
    });

    it("allows 50 EULA entries and marks 51 malformed", () => {
      expect(MAX_LIST_LENGTH).toBe(50);
      expect(readDetails({ eula: list(50) }).eula).toHaveLength(50);
      expect(readDetails({ eula: list(51) }).eula).toBe(MALFORMED);
    });

    it.each(CATEGORY_LISTS)("allows 50 IDs in %s and marks 51 malformed", (list) => {
      const read = (length: number) =>
        parse(make.item.store(make.appId(), {
          categories: { [list]: Array.from({ length }, (_, i) => i) },
        })).categories;
      expect(read(50)).toMatchObject({ [list]: { length: 50 } });
      expect(read(51)).toStrictEqual({ [list]: MALFORMED });
    });
  });

  it("drops the keys it does not read", () => {
    expect(readDetails({ has_community_hub: true })).not.toHaveProperty("has_community_hub");
  });
});
