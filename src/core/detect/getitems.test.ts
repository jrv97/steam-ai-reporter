import { describe, expect, it } from "vitest";
import { detectorContract } from "../../../tests/contracts/detector.contract";
import creatorsFixture from "../../../tests/fixtures/getitems/creators.json";
import dlc from "../../../tests/fixtures/getitems/dlc-parent.json";
import empty from "../../../tests/fixtures/getitems/empty-response.json";
import german from "../../../tests/fixtures/getitems/german-context.json";
import mixed from "../../../tests/fixtures/getitems/mixed-states.json";
import roguelike from "../../../tests/fixtures/getitems/search-roguelike-50.json";
import { appId, appIds } from "../../../tests/helpers/app-ids";
import { basicInfo, creatorsFor, type CreatorsSpec } from "../../../tests/helpers/creators";
import { fakeHttp, httpResult, type Reply } from "../../../tests/helpers/fake-http";
import {
  disclosedItem,
  fixtureItems,
  getItemsRequest,
  getItemsResponse,
  getItemsRoute,
  invalidItem,
  itemIds,
  storeItem,
} from "../../../tests/helpers/getitems";
import type { SteamLanguage } from "../i18n/locale";
import { KIND_IDS } from "../kinds/id";
import { type KindVerdicts, UNKNOWN_KINDS } from "../kinds/verdicts";
import type { Http } from "../ports";
import type { AppId } from "../types";
import {
  createGetItemsDetector,
  DEFAULT_BATCH_LIMITS,
  GETITEMS_URL,
  getItemsUrl,
  parseGetItems,
  planBatches,
} from "./getitems";

const URL_FOR_TESTS = `${GETITEMS_URL}?input_json=%7B%7D`;

function parse(
  ids: readonly AppId[],
  reply: Reply,
  language: SteamLanguage = "english",
): ReadonlyMap<AppId, KindVerdicts> {
  return parseGetItems(ids, httpResult(reply, URL_FOR_TESTS), language);
}

function fixtureReply(fixture: unknown): Reply {
  return getItemsResponse(fixtureItems(fixture));
}

/** The state of the AI kind's verdict, with the reason for unknown. */
function stateOf(verdicts: ReadonlyMap<AppId, KindVerdicts>, id: number): string | undefined {
  const verdict = verdicts.get(appId(id))?.ai;
  return verdict?.state === "unknown" ? `unknown:${verdict.reason}` : verdict?.state;
}

function notesOf(verdicts: ReadonlyMap<AppId, KindVerdicts>, id: number): string | undefined {
  const verdict = verdicts.get(appId(id))?.ai;
  return verdict?.state === "disclosed" ? verdict.notes : undefined;
}

/** Seven-digit IDs, like current Steam apps. */
function sequentialIds(count: number): readonly AppId[] {
  return appIds(...Array.from({ length: count }, (_, index) => 4_000_000 + index));
}

describe("parseGetItems over the captured fixtures", () => {
  it("maps every item state in mixed-states.json", () => {
    const ids = appIds(5072580, 1808500, 1938090, 413150, 339800, 99999999, 50300);
    const verdicts = parse(ids, fixtureReply(mixed));
    expect(notesOf(verdicts, 5072580)).toMatch(/^Generative AI is used in both pre-generated/);
    expect(verdicts.get(appId(5072580))?.ai).toStrictEqual({
      state: "disclosed",
      kind: "ai",
      notes: notesOf(verdicts, 5072580),
      language: "english",
      service: "OpenAI API",
      name: "Courage and Faith: Into the Dark Woods",
      source: "api",
    });
    expect(notesOf(verdicts, 1808500)).toMatch(/^During the development process/);
    expect(verdicts.get(appId(1808500))?.ai).toStrictEqual({
      state: "disclosed",
      kind: "ai",
      notes: notesOf(verdicts, 1808500),
      language: "english",
      name: "ARC Raiders",
      source: "api",
    });
    expect(stateOf(verdicts, 1938090)).toBe("disclosed");
    // Not disclosed: 413150 has no notes, 339800 has mature notes only, 50300 is delisted.
    for (const id of [413150, 339800, 50300]) {
      expect(verdicts.get(appId(id))?.ai).toStrictEqual({ state: "not-disclosed", source: "api" });
    }
    // Invalid ID: success 15, appid 0, no extra_details; keyed by the requested id.
    expect(verdicts.get(appId(99999999))).toBe(UNKNOWN_KINDS.missing);
    expect(verdicts.size).toBe(7);
  });

  it("keeps the requested language and the developer's translation (german-context.json)", () => {
    const verdicts = parse(appIds(1938090, 5072580), fixtureReply(german), "german");
    const cod = verdicts.get(appId(1938090))?.ai;
    expect(cod?.state === "disclosed" ? cod.language : undefined).toBe("german");
    expect(notesOf(verdicts, 1938090)).toMatch(/^Unser Team setzt generative KI-Tools ein/);
    // No German translation: Steam answers in English, still requested as german.
    const courage = verdicts.get(appId(5072580))?.ai;
    expect(courage?.state === "disclosed" ? courage.language : undefined).toBe("german");
    expect(notesOf(verdicts, 5072580)).toMatch(/^Generative AI is used/);
  });

  it("finds the 10 disclosures among 50 search rows (search-roguelike-50.json)", () => {
    const items = fixtureItems(roguelike);
    const ids = itemIds(items);
    const verdicts = parse(ids, fixtureReply(roguelike));
    const disclosed = [...verdicts].filter(([, verdict]) => verdict.ai.state === "disclosed");
    expect(disclosed.map(([id]) => id)).toStrictEqual([
      4461450,
      5269270,
      4829430,
      4431800,
      5245850,
      5000470,
      4529660,
      5383550,
      5271980,
      5081750,
    ]);
    expect([...verdicts.values()].filter((v) => v.ai.state === "not-disclosed")).toHaveLength(40);
    expect(notesOf(verdicts, 4431800)).toBe(
      "Partily AI Assets:\r\nWaifus\r\nBackgrounds\r\nMusics",
    );
    expect(notesOf(verdicts, 5269270)).toContain("\u200b\u200b");
    for (const [, verdict] of disclosed) {
      const notes = verdict.ai.state === "disclosed" ? verdict.ai.notes : "";
      expect(notes).toBe(notes.trim());
    }
  });

  it("treats the body without store_items as a batch error (empty-response.json)", () => {
    const reply: Reply = { body: JSON.stringify(empty), headers: { "x-eresult": "1" } };
    expect(parse(appIds(413150, 5072580), reply)).toStrictEqual(
      new Map([[appId(413150), UNKNOWN_KINDS.error], [appId(5072580), UNKNOWN_KINDS.error]]),
    );
    const contextless: Reply = { body: JSON.stringify(empty), headers: { "x-eresult": "8" } };
    expect(stateOf(parse(appIds(413150), contextless), 413150)).toBe("unknown:error");
  });
});

describe("parseGetItems and the base game of a DLC", () => {
  const dlcId = appId(5201760);

  it("keeps the parent of the captured DLC next to its verdicts (dlc-parent.json)", () => {
    const found = parse([dlcId], getItemsResponse(fixtureItems(dlc))).get(dlcId);
    expect(found?.parent).toBe(1808500);
    expect(found?.ai.state).toBe("disclosed");
  });

  it("gives an item with no parent, or a parent it cannot read, no parent key", () => {
    const items = [
      storeItem(1),
      storeItem(2, { related_items: { parent_appid: "x" } }),
      storeItem(3, { related_items: 7 }),
    ];
    const found = parse(appIds(1, 2, 3), getItemsResponse(items));
    for (const id of appIds(1, 2, 3)) {
      expect(found.get(id)).not.toHaveProperty("parent");
      expect(found.get(id)?.ai.state).toBe("not-disclosed");
    }
  });

  it("gives the unknown verdicts of an item without details no parent", () => {
    const item = storeItem(4, { extra_details: undefined, related_items: { parent_appid: 9 } });
    const found = parse(appIds(4), getItemsResponse([item])).get(appId(4));
    expect(found).toBe(UNKNOWN_KINDS.missing);
  });

  it("reads the parents of a mixed batch by their own ids", () => {
    const items = [storeItem(1, { related_items: { parent_appid: 9 } }), storeItem(2)];
    const found = parse(appIds(1, 2), getItemsResponse(items));
    expect(found.get(appId(1))?.parent).toBe(9);
    expect(found.get(appId(2))?.parent).toBeUndefined();
  });
});

describe("parseGetItems and the developers and publishers", () => {
  const one = appIds(1);

  function creatorsOfItem(overrides: Readonly<Record<string, unknown>>) {
    return parse(one, getItemsResponse([storeItem(1, overrides)])).get(appId(1));
  }

  it.each<[string, number, CreatorsSpec]>([
    ["with a clan ID (730)", 730, { developers: [["Valve", 4]], publishers: [["Valve", 4]] }],
    [
      "with a long clan ID (1091500)",
      1091500,
      { developers: [["CD PROJEKT RED", 32989758]], publishers: [["CD PROJEKT RED", 32989758]] },
    ],
    [
      "without a clan ID (1808500)",
      1808500,
      { developers: ["Embark Studios"], publishers: ["Embark Studios"] },
    ],
  ])("reads the creators of the captured app %s", (_name, id, expected) => {
    const found = parse(appIds(id), fixtureReply(creatorsFixture)).get(appId(id));
    expect(found?.creators).toStrictEqual(creatorsFor(expected));
  });

  it.each<[string, CreatorsSpec]>([
    ["a developer that is not the publisher", { developers: ["Dev"], publishers: [["Pub", 7]] }],
    ["two developers", { developers: [["One", 1], "Two"], publishers: ["Pub"] }],
    ["a company in both roles", { developers: [["Both", 9]], publishers: [["Both", 9]] }],
    ["a repeated entry once", { developers: ["Dev", "Dev", ["Dev", 5], ["Dev", 5]] }],
  ])("keeps %s", (_name, spec) => {
    expect(creatorsOfItem(basicInfo(spec))?.creators).toStrictEqual(creatorsFor(spec));
  });

  it("keeps at most eight creators of a role, in Steam's order", () => {
    const names = Array.from({ length: 12 }, (_, index) => `Studio ${String(index)}`);
    const found = creatorsOfItem(basicInfo({ developers: names }));
    expect(found?.creators?.developer.map((creator) => creator.name)).toStrictEqual(
      names.slice(0, 8),
    );
  });

  const MANY = Array.from({ length: 51 }, () => ({ name: "A" }));

  it.each<[string, unknown, CreatorsSpec | undefined]>([
    ["basic_info as a list", [], undefined],
    ["basic_info as text", "Valve", undefined],
    ["basic_info as null", null, undefined],
    ["basic_info without the lists", { short_description: "x" }, undefined],
    ["a list as an object", { developers: { name: "A" }, publishers: [{ name: "P" }] }, {
      publishers: ["P"],
    }],
    ["a list that is too long", { developers: MANY }, undefined],
    ["entries that are no objects", { developers: ["A", 7, null, { name: "B" }] }, {
      developers: ["B"],
    }],
    ["entries without a usable name", {
      developers: [{}, { name: 3 }, { name: "" }, { name: "C" }],
    }, {
      developers: ["C"],
    }],
    ["a name too long to keep", { developers: [{ name: "x".repeat(201) }, { name: "D" }] }, {
      developers: ["D"],
    }],
  ])("reads %s as the creators it can", (_name, info, expected) => {
    const found = creatorsOfItem({ basic_info: info });
    expect(found?.creators).toStrictEqual(
      expected === undefined ? undefined : creatorsFor(expected),
    );
    expect(found?.ai.state).toBe("not-disclosed");
  });

  it.each([["a string", "4"], ["zero", 0], ["a fraction", 1.5], ["too large", 2 ** 32]])(
    "reads a clan ID that is %s as no clan ID",
    (_name, clan) => {
      const found = creatorsOfItem({
        basic_info: { developers: [{ name: "E", creator_clan_account_id: clan }] },
      });
      expect(found?.creators).toStrictEqual(creatorsFor({ developers: ["E"] }));
    },
  );

  it("gives an item without details no creators", () => {
    const item = storeItem(1, { extra_details: undefined, ...basicInfo({ developers: ["A"] }) });
    expect(parse(one, getItemsResponse([item])).get(appId(1))).toBe(UNKNOWN_KINDS.missing);
  });
});

describe("parseGetItems edge cases", () => {
  it("reads blank notes, U+200B included, as not disclosed", () => {
    const ids = appIds(1, 2, 3);
    const verdicts = parse(
      ids,
      getItemsResponse([
        disclosedItem(1, "   "),
        disclosedItem(2, "\u200b"),
        disclosedItem(3, "\r\n\u200b \t"),
      ]),
    );
    for (const id of [1, 2, 3]) {
      expect(stateOf(verdicts, id)).toBe("not-disclosed");
    }
  });

  it("keeps \\r\\n inside notes and trims the edges", () => {
    const verdicts = parse(appIds(1), getItemsResponse([disclosedItem(1, "\u200b A\r\n\r\nB \n")]));
    expect(notesOf(verdicts, 1)).toBe("A\r\n\r\nB");
  });

  it("names the service and the app only when they are not blank", () => {
    const verdicts = parse(
      appIds(1, 2),
      getItemsResponse([
        disclosedItem(1, "notes", " Midjourney "),
        storeItem(2, {
          name: " ",
          extra_details: { content_survey_ai_notes: "notes", ai_generation_service: {} },
        }),
      ]),
    );
    const named = verdicts.get(appId(1))?.ai;
    expect(named?.state === "disclosed" ? named.service : undefined).toBe("Midjourney");
    expect(verdicts.get(appId(2))?.ai).toStrictEqual({
      state: "disclosed",
      kind: "ai",
      notes: "notes",
      language: "english",
      source: "api",
    });
  });

  it("gives every registered kind a verdict for each requested ID", () => {
    const verdicts = parse(
      appIds(1, 2, 3),
      getItemsResponse([disclosedItem(1, "notes"), storeItem(2)]),
    );
    expect(verdicts.size).toBe(3);
    for (const found of verdicts.values()) {
      expect(Object.keys(found)).toStrictEqual([...KIND_IDS]);
    }
  });

  it("reads an item without extra_details as unknown missing", () => {
    const item = storeItem(1, { extra_details: undefined });
    expect(stateOf(parse(appIds(1), getItemsResponse([item])), 1)).toBe("unknown:missing");
  });

  it("keys an invalid item (success 15, appid 0) by its id", () => {
    const verdicts = parse(appIds(99999999), getItemsResponse([invalidItem(99999999)]));
    expect([...verdicts]).toStrictEqual([[99999999, UNKNOWN_KINDS.missing]]);
  });

  it("reads a requested ID without an item as unknown missing", () => {
    const verdicts = parse(appIds(1, 2), getItemsResponse([disclosedItem(1, "notes")]));
    expect(stateOf(verdicts, 2)).toBe("unknown:missing");
  });

  it("gives unknown to an item with wrong field types, and keeps the rest", () => {
    const verdicts = parse(
      appIds(1, 2, 3, 4),
      getItemsResponse([
        storeItem(1, { success: "1" }),
        storeItem(2, { extra_details: { content_survey_ai_notes: 42 } }),
        storeItem(3, { extra_details: "none" }),
        disclosedItem(4, "notes"),
      ]),
    );
    expect(stateOf(verdicts, 1)).toBe("unknown:error");
    expect(stateOf(verdicts, 2)).toBe("unknown:malformed");
    expect(stateOf(verdicts, 3)).toBe("unknown:error");
    expect(stateOf(verdicts, 4)).toBe("disclosed");
  });

  it("reads unmatched IDs as unknown error when an item's id is unreadable", () => {
    const verdicts = parse(
      appIds(1, 2, 3),
      getItemsResponse([disclosedItem(1, "notes"), storeItem(2, { id: "2" }), null]),
    );
    expect(stateOf(verdicts, 1)).toBe("disclosed");
    expect(stateOf(verdicts, 2)).toBe("unknown:error");
    expect(stateOf(verdicts, 3)).toBe("unknown:error");
  });

  it("ignores items for IDs that were not requested, and repeated items", () => {
    const verdicts = parse(
      appIds(1),
      getItemsResponse([storeItem(7), disclosedItem(1, "first"), disclosedItem(1, "second")]),
    );
    expect([...verdicts.keys()]).toStrictEqual([1]);
    expect(notesOf(verdicts, 1)).toBe("first");
  });

  it("treats x-eresult other than 1 as a batch error", () => {
    const reply = getItemsResponse([disclosedItem(1, "notes")], { eresult: "8" });
    expect(stateOf(parse(appIds(1), reply), 1)).toBe("unknown:error");
  });

  it("accepts an answer whose x-eresult header is not exposed", () => {
    const reply = getItemsResponse([disclosedItem(1, "notes")], { eresult: null });
    expect(stateOf(parse(appIds(1), reply), 1)).toBe("disclosed");
  });

  it("treats a missing store_items, bad JSON or a wrong envelope as a batch error", () => {
    const ids = appIds(1, 2);
    for (
      const reply of [
        getItemsResponse(undefined),
        { body: "{" },
        { body: "null" },
        { body: JSON.stringify({ response: { store_items: {} } }) },
        { body: JSON.stringify({ store_items: [disclosedItem(1, "notes")] }) },
      ]
    ) {
      const verdicts = parse(ids, reply);
      expect([...verdicts.values()]).toStrictEqual([UNKNOWN_KINDS.error, UNKNOWN_KINDS.error]);
    }
  });

  it("maps statuses: 429 to rate-limited, any other non-200 to error", () => {
    const ok = [disclosedItem(1, "notes")];
    expect(stateOf(parse(appIds(1), getItemsResponse(ok, { status: 429 })), 1)).toBe(
      "unknown:rate-limited",
    );
    for (const status of [400, 404, 414, 500, 503]) {
      expect(stateOf(parse(appIds(1), getItemsResponse(ok, { status })), 1)).toBe("unknown:error");
    }
  });

  it("maps a failed request to error and a withheld one to rate-limited", () => {
    const ids = appIds(1);
    expect(parseGetItems(ids, { kind: "failed", cause: new TypeError() }, "english")).toStrictEqual(
      new Map([[appId(1), UNKNOWN_KINDS.error]]),
    );
    expect(parseGetItems(ids, { kind: "withheld" }, "english")).toStrictEqual(
      new Map([[appId(1), UNKNOWN_KINDS["rate-limited"]]]),
    );
  });
});

describe("planBatches", () => {
  it("removes duplicate IDs and keeps the first-seen order", () => {
    const batches = planBatches(appIds(3, 1, 3, 2, 1), "english");
    expect(batches.map(({ ids }) => ids)).toStrictEqual([[3, 1, 2]]);
  });

  it("sends at most 50 IDs per request", () => {
    const batches = planBatches(sequentialIds(120), "english");
    expect(batches.map(({ ids }) => ids.length)).toStrictEqual([50, 50, 20]);
    expect(Math.max(...batches.map(({ url }) => url.length))).toBeLessThan(
      DEFAULT_BATCH_LIMITS.maxUrlLength,
    );
  });

  it("splits a batch whose URL would pass the length guard", () => {
    const ids = sequentialIds(10);
    const maxUrlLength = getItemsUrl(ids.slice(0, 3), "english").length;
    const batches = planBatches(ids, "english", { maxIds: 50, maxUrlLength });
    expect(batches.map((batch) => batch.ids.length)).toStrictEqual([3, 3, 3, 1]);
    for (const batch of batches) {
      expect(batch.url).toBe(getItemsUrl(batch.ids, "english"));
      expect(batch.url.length).toBeLessThanOrEqual(maxUrlLength);
    }
  });

  it("still sends a single ID whose URL is over the guard", () => {
    const batches = planBatches(appIds(5072580), "english", { maxIds: 50, maxUrlLength: 10 });
    expect(batches.map(({ ids }) => ids)).toStrictEqual([[5072580]]);
  });

  it("plans nothing for no IDs", () => {
    expect(planBatches([], "english")).toStrictEqual([]);
  });

  it("asks for extra details and basic info in the caller's language", () => {
    const [batch] = planBatches(appIds(5072580), "latam");
    const input = new URL(batch?.url ?? GETITEMS_URL).searchParams.get("input_json");
    expect(input).toBe(
      JSON.stringify({
        ids: [{ appid: 5072580 }],
        context: { language: "latam", country_code: "US" },
        data_request: { include_extra_details: true, include_basic_info: true },
      }),
    );
  });
});

const POOL = [...fixtureItems(mixed), ...fixtureItems(roguelike)];

function detectorOver(http: Http, language: SteamLanguage = "english") {
  return createGetItemsDetector({ http, language });
}

detectorContract("GetItems over the fixtures", () => detectorOver(fakeHttp([getItemsRoute(POOL)])));
detectorContract(
  "GetItems with no answer",
  () => detectorOver(fakeHttp([[GETITEMS_URL, "network-error"]])),
);
detectorContract(
  "GetItems withheld",
  () => detectorOver({ get: () => Promise.resolve({ kind: "withheld" }) }),
);

describe("createGetItemsDetector", () => {
  it("sends duplicate IDs once, in the page language", async () => {
    const http = fakeHttp([getItemsRoute(POOL)]);
    const verdicts = await detectorOver(http, "german").detect(appIds(5072580, 413150, 5072580));
    expect(http.calls.map((url) => getItemsRequest(url))).toStrictEqual([
      { ids: [5072580, 413150], language: "german" },
    ]);
    expect(stateOf(verdicts, 5072580)).toBe("disclosed");
    expect(stateOf(verdicts, 413150)).toBe("not-disclosed");
  });

  it("sends 120 IDs as 50, 50 and 20, one request at a time", async () => {
    const http = fakeHttp([getItemsRoute([])]);
    const verdicts = await detectorOver(http).detect(sequentialIds(120));
    expect(http.calls.map((url) => getItemsRequest(url).ids.length)).toStrictEqual([50, 50, 20]);
    expect(http.maxInFlight).toBe(1);
    expect(verdicts.size).toBe(120);
  });

  it("keeps the verdicts of good batches when another batch fails", async () => {
    const ids = sequentialIds(60);
    const failing = appId(4_000_055);
    const http = fakeHttp([[GETITEMS_URL, (url) => {
      const requested = getItemsRequest(url).ids;
      return requested.includes(failing)
        ? "network-error"
        : getItemsResponse(requested.map((id) => disclosedItem(id, "notes")));
    }]]);
    const verdicts = await detectorOver(http).detect(ids);
    expect(stateOf(verdicts, 4_000_000)).toBe("disclosed");
    expect(stateOf(verdicts, 4_000_049)).toBe("disclosed");
    expect(stateOf(verdicts, 4_000_050)).toBe("unknown:error");
    expect(stateOf(verdicts, 4_000_059)).toBe("unknown:error");
  });

  it("sends nothing for no IDs", async () => {
    const http = fakeHttp([]);
    expect(await detectorOver(http).detect([])).toStrictEqual(new Map());
    expect(http.calls).toStrictEqual([]);
  });
});
