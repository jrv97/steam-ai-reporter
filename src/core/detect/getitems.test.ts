import { describe, expect, it } from "vitest";
import { detectorContract } from "../../../tests/contracts/detector.contract";
import creatorsFixture from "../../../tests/fixtures/getitems/creators.json";
import demoParent from "../../../tests/fixtures/getitems/demo-parent.json";
import dlc from "../../../tests/fixtures/getitems/dlc-parent.json";
import empty from "../../../tests/fixtures/getitems/empty-response.json";
import german from "../../../tests/fixtures/getitems/german-context.json";
import mixed from "../../../tests/fixtures/getitems/mixed-states.json";
import roguelike from "../../../tests/fixtures/getitems/search-roguelike-50.json";
import type { CreatorsSpec } from "../../../tests/helpers/creators";
import { make } from "../../../tests/helpers/factory";
import type { Reply } from "../../../tests/helpers/fake-http";
import { fake } from "../../../tests/helpers/fakes";
import { getItemsRequest, itemIds, requestFlags } from "../../../tests/helpers/getitems";
import type { SteamLanguage } from "../i18n/locale";
import { KIND_IDS } from "../kinds/id";
import { SECTIONS } from "../kinds/sections";
import type { KindVerdicts } from "../kinds/verdicts";
import type { Http, HttpResult } from "../ports";
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
const { app } = make.fixture;
const { maxIds } = DEFAULT_BATCH_LIMITS;
const MISSING = make.verdicts.uniform("missing");
const ERROR = make.verdicts.uniform("error");
const RATE_LIMITED = make.verdicts.uniform("rate-limited");

function parse(
  ids: readonly AppId[],
  reply: Reply,
  language: SteamLanguage = "english",
): ReadonlyMap<AppId, KindVerdicts> {
  return parseGetItems(ids, make.http.result(reply, URL_FOR_TESTS), language);
}

/** What GetItems answers for `ids` when its answer holds `items`. */
function parseItems(ids: readonly AppId[], items: readonly unknown[]) {
  return parse(ids, make.item.response(items));
}

function fixtureReply(fixture: unknown): Reply {
  return make.item.response(make.fixture.items(fixture));
}

/** The state of the AI kind's verdict, with the reason for unknown. */
function stateOf(verdicts: ReadonlyMap<AppId, KindVerdicts>, id: AppId): string | undefined {
  const verdict = verdicts.get(id)?.ai;
  return verdict?.state === "unknown" ? `unknown:${verdict.reason}` : verdict?.state;
}

function notesOf(verdicts: ReadonlyMap<AppId, KindVerdicts>, id: AppId): string | undefined {
  const verdict = verdicts.get(id)?.ai;
  return verdict?.state === "disclosed" ? verdict.notes : undefined;
}

describe("parseGetItems over the captured fixtures", () => {
  it("maps every item state in mixed-states.json", () => {
    const { aiWithService, arcRaiders, germanNotes, noBlock, adultOnly, invalid, delisted } = app;
    const ids = [aiWithService, arcRaiders, germanNotes, noBlock, adultOnly, invalid, delisted];
    const verdicts = parse(ids, fixtureReply(mixed));
    expect(notesOf(verdicts, aiWithService)).toMatch(
      /^Generative AI is used in both pre-generated/,
    );
    expect(verdicts.get(aiWithService)?.ai).toStrictEqual({
      state: "disclosed",
      kind: "ai",
      notes: notesOf(verdicts, aiWithService),
      language: "english",
      service: "OpenAI API",
      name: "Courage and Faith: Into the Dark Woods",
      source: "api",
    });
    expect(notesOf(verdicts, arcRaiders)).toMatch(/^During the development process/);
    expect(verdicts.get(arcRaiders)?.ai).toStrictEqual({
      state: "disclosed",
      kind: "ai",
      notes: notesOf(verdicts, arcRaiders),
      language: "english",
      name: "ARC Raiders",
      source: "api",
    });
    expect(stateOf(verdicts, germanNotes)).toBe("disclosed");
    // Not disclosed: no notes, mature notes only, delisted.
    for (const id of [noBlock, adultOnly, delisted]) {
      expect(verdicts.get(id)?.ai).toStrictEqual(make.verdict.notDisclosed("api"));
    }
    // Invalid ID: success 15, appid 0, no extra_details; keyed by the requested id.
    expect(verdicts.get(invalid)).toBe(MISSING);
    expect(verdicts.size).toBe(ids.length);
  });

  it("keeps the requested language and the developer's translation (german-context.json)", () => {
    const { germanNotes, aiWithService } = app;
    const verdicts = parse([germanNotes, aiWithService], fixtureReply(german), "german");
    expect(verdicts.get(germanNotes)?.ai).toMatchObject({ language: "german" });
    expect(notesOf(verdicts, germanNotes)).toMatch(/^Unser Team setzt generative KI-Tools ein/);
    // No German translation: Steam answers in English, still requested as german.
    expect(verdicts.get(aiWithService)?.ai).toMatchObject({ language: "german" });
    expect(notesOf(verdicts, aiWithService)).toMatch(/^Generative AI is used/);
  });

  it("finds the 10 disclosures among 50 search rows (search-roguelike-50.json)", () => {
    const items = make.fixture.items(roguelike);
    const verdicts = parse(itemIds(items), fixtureReply(roguelike));
    const disclosed = [...verdicts].filter(([, verdict]) => verdict.ai.state === "disclosed");
    expect(disclosed.map(([id]) => id)).toStrictEqual(make.fixture.roguelikeDisclosed);
    expect([...verdicts.values()].filter((v) => v.ai.state === "not-disclosed")).toHaveLength(
      items.length - disclosed.length,
    );
    expect(notesOf(verdicts, app.roguelikeLineBreaks)).toBe(
      "Partily AI Assets:\r\nWaifus\r\nBackgrounds\r\nMusics",
    );
    expect(notesOf(verdicts, app.roguelikeZeroWidth)).toContain("\u200b\u200b");
    for (const [id] of disclosed) {
      const notes = notesOf(verdicts, id);
      expect(notes).toBe(notes?.trim());
    }
  });

  it("treats the body without store_items as a batch error (empty-response.json)", () => {
    const reply: Reply = { body: JSON.stringify(empty), headers: { "x-eresult": "1" } };
    expect(parse([app.noBlock, app.aiWithService], reply)).toStrictEqual(
      new Map([[app.noBlock, ERROR], [app.aiWithService, ERROR]]),
    );
  });
});

describe("parseGetItems and the base game of a DLC", () => {
  const dlcItem = () => parseItems([app.dlc], make.fixture.items(dlc)).get(app.dlc);

  it("keeps the parent of the captured DLC next to its verdicts (dlc-parent.json)", () => {
    const found = dlcItem();
    expect(found?.parent).toBe(make.fixture.dlcBase);
    expect(found?.ai.state).toBe("disclosed");
  });

  it("gives an item with no parent, or a parent it cannot read, no parent key", () => {
    const ids = [make.appId(), make.appId(), make.appId()] as const;
    const [plain, textParent, numberRelated] = ids;
    const found = parseItems(ids, [
      make.item.store(plain),
      make.item.store(textParent, { related_items: { parent_appid: make.text.note() } }),
      make.item.store(numberRelated, { related_items: 7 }),
    ]);
    for (const id of ids) {
      expect(found.get(id)).not.toHaveProperty("parent");
      expect(found.get(id)?.ai.state).toBe("not-disclosed");
    }
  });

  it("marks the captured demo, and not its full game or a DLC (demo-parent.json)", () => {
    const found = parseItems([app.demoParent, app.demo], make.fixture.items(demoParent));
    expect(found.get(app.demo)).toMatchObject({ parent: app.demoParent, demo: true });
    expect(found.get(app.demoParent)).not.toHaveProperty("demo");
    expect(dlcItem()).not.toHaveProperty("demo");
  });

  it("reads the parents of a mixed batch by their own ids", () => {
    const [child, plain, parent] = [make.appId(), make.appId(), make.appId()];
    const found = parseItems([child, plain], [
      make.item.store(child, { related_items: { parent_appid: parent } }),
      make.item.store(plain),
    ]);
    expect(found.get(child)?.parent).toBe(parent);
    expect(found.get(plain)?.parent).toBeUndefined();
  });
});

describe("parseGetItems and the developers and publishers", () => {
  const { clan } = make.fixture;

  function creatorsOfItem(overrides: Readonly<Record<string, unknown>>) {
    const id = make.appId();
    return parseItems([id], [make.item.store(id, overrides)]).get(id);
  }

  it.each<[string, AppId, CreatorsSpec]>([
    [
      "with a clan ID (730)",
      app.vac,
      { developers: [["Valve", clan.valve]], publishers: [["Valve", clan.valve]] },
    ],
    [
      "with a long clan ID (1091500)",
      app.verified,
      {
        developers: [["CD PROJEKT RED", clan.cdProjektRed]],
        publishers: [["CD PROJEKT RED", clan.cdProjektRed]],
      },
    ],
    [
      "without a clan ID (1808500)",
      app.arcRaiders,
      { developers: ["Embark Studios"], publishers: ["Embark Studios"] },
    ],
  ])("reads the creators of the captured app %s", (_name, id, expected) => {
    const found = parse([id], fixtureReply(creatorsFixture)).get(id);
    expect(found?.creators).toStrictEqual(make.creator.forItem(expected));
  });

  const company = [make.text.creator(), make.creator.clan()] as const;
  const repeated = make.text.creator();
  const repeatedClan = make.creator.clan();

  it.each<[string, CreatorsSpec]>([
    ["a developer that is not the publisher", {
      developers: [make.text.creator()],
      publishers: [[make.text.creator(), make.creator.clan()]],
    }],
    ["two developers", {
      developers: [[make.text.creator(), make.creator.clan()], make.text.creator()],
      publishers: [make.text.creator()],
    }],
    ["a company in both roles", { developers: [company], publishers: [company] }],
    ["a repeated entry once", {
      developers: [repeated, repeated, [repeated, repeatedClan], [repeated, repeatedClan]],
    }],
  ])("keeps %s", (_name, spec) => {
    expect(creatorsOfItem(make.item.creators(spec))?.creators).toStrictEqual(
      make.creator.forItem(spec),
    );
  });

  it("keeps at most eight creators of a role, in Steam's order", () => {
    const names = Array.from({ length: 12 }, () => make.text.creator());
    const found = creatorsOfItem(make.item.creators({ developers: names }));
    expect(found?.creators?.developer.map((creator) => creator.name)).toStrictEqual(
      names.slice(0, 8),
    );
  });

  const [listed, publisher, kept, named, short] = [
    make.text.creator(),
    make.text.creator(),
    make.text.creator(),
    make.text.creator(),
    make.text.creator(),
  ];
  const many = Array.from({ length: 51 }, () => ({ name: make.text.creator() }));

  it.each<[string, unknown, ReturnType<typeof make.creator.forItem> | undefined]>([
    ["basic_info as a list", [], undefined],
    ["basic_info as text", make.text.creator(), undefined],
    ["basic_info as null", null, undefined],
    ["basic_info without the lists", { short_description: make.text.note() }, undefined],
    [
      "a list as an object",
      { developers: { name: listed }, publishers: [{ name: publisher }] },
      make.creator.forItem({ publishers: [publisher] }),
    ],
    ["a list that is too long", { developers: many }, undefined],
    [
      "entries that are no objects",
      { developers: [make.text.creator(), 7, null, { name: kept }] },
      make.creator.forItem({ developers: [kept] }),
    ],
    [
      "entries without a usable name",
      { developers: [{}, { name: 3 }, { name: "" }, { name: named }] },
      make.creator.forItem({ developers: [named] }),
    ],
    [
      "a name too long to keep",
      { developers: [{ name: make.text.ofLength(201) }, { name: short }] },
      make.creator.forItem({ developers: [short] }),
    ],
  ])("reads %s as the creators it can", (_name, info, expected) => {
    const found = creatorsOfItem({ basic_info: info });
    expect(found?.creators).toStrictEqual(expected);
    expect(found?.ai.state).toBe("not-disclosed");
  });

  it.each([["a string", "4"], ["zero", 0], ["a fraction", 1.5], ["too large", 2 ** 32]])(
    "reads a clan ID that is %s as no clan ID",
    (_name, clanId) => {
      const name = make.text.creator();
      const found = creatorsOfItem({
        basic_info: { developers: [{ name, creator_clan_account_id: clanId }] },
      });
      expect(found?.creators).toStrictEqual(make.creator.forItem({ developers: [name] }));
    },
  );
});

describe("parseGetItems edge cases", () => {
  const ID = make.appId();

  it.each(["   ", "\u200b", "\r\n\u200b \t"])(
    "reads the blank notes %j as not disclosed",
    (notes) => {
      const verdicts = parseItems([ID], [make.item.disclosed(ID, notes)]);
      expect(stateOf(verdicts, ID)).toBe("not-disclosed");
    },
  );

  it("keeps \\r\\n inside notes and trims the edges", () => {
    const [first, second] = [make.text.note(), make.text.note()];
    const notes = `\u200b ${first}\r\n\r\n${second} \n`;
    const verdicts = parseItems([ID], [make.item.disclosed(ID, notes)]);
    expect(notesOf(verdicts, ID)).toBe(`${first}\r\n\r\n${second}`);
  });

  it("names the service and the app only when they are not blank", () => {
    const [named, unnamed] = [make.appId(), make.appId()];
    const [service, notes] = [make.text.service(), make.text.note()];
    const verdicts = parseItems([named, unnamed], [
      make.item.disclosed(named, make.text.note(), ` ${service} `),
      make.item.details({ content_survey_ai_notes: notes, ai_generation_service: {} }, {
        name: " ",
      }, unnamed),
    ]);
    expect(verdicts.get(named)?.ai).toMatchObject({ service });
    expect(verdicts.get(unnamed)?.ai).toStrictEqual({
      state: "disclosed",
      kind: "ai",
      notes,
      language: "english",
      source: "api",
    });
  });

  it("gives every registered kind a verdict for each requested ID", () => {
    const ids = [make.appId(), make.appId(), make.appId()] as const;
    const [disclosed, plain] = ids;
    const verdicts = parseItems(ids, [make.item.disclosed(disclosed), make.item.store(plain)]);
    expect(verdicts.size).toBe(ids.length);
    for (const found of verdicts.values()) {
      expect(Object.keys(found)).toStrictEqual(expect.arrayContaining([...KIND_IDS]));
    }
  });

  it.each<readonly [string, (id: AppId) => Readonly<Record<string, unknown>>]>([
    ["an item without extra_details", (id) => make.item.details(undefined, {}, id)],
    [
      "an item without details that names a parent",
      (id) => make.item.details(undefined, { related_items: { parent_appid: make.appId() } }, id),
    ],
    [
      "an item without details that names creators",
      (id) =>
        make.item.details(
          undefined,
          make.item.creators({ developers: [make.text.creator()] }),
          id,
        ),
    ],
    ["an invalid item (success 15, appid 0), keyed by its id", (id) => make.item.invalid(id)],
  ])("reads %s as unknown missing, with no relations", (_name, item) => {
    expect([...parseItems([ID], [item(ID)])]).toStrictEqual([[ID, MISSING]]);
  });

  it("reads a requested ID without an item as unknown missing", () => {
    const [answered, left] = [make.appId(), make.appId()];
    const verdicts = parseItems([answered, left], [make.item.disclosed(answered)]);
    expect(stateOf(verdicts, left)).toBe("unknown:missing");
  });

  it("gives unknown to an item with wrong field types, and keeps the rest", () => {
    const ids = [make.appId(), make.appId(), make.appId(), make.appId()] as const;
    const [textSuccess, numberNotes, textDetails, good] = ids;
    const verdicts = parseItems(ids, [
      make.item.store(textSuccess, { success: "1" }),
      make.item.details({ content_survey_ai_notes: 42 }, {}, numberNotes),
      make.item.details("none", {}, textDetails),
      make.item.disclosed(good),
    ]);
    expect(ids.map((id) => stateOf(verdicts, id))).toStrictEqual([
      "unknown:error",
      "unknown:malformed",
      "unknown:error",
      "disclosed",
    ]);
  });

  it("reads unmatched IDs as unknown error when an item's id is unreadable", () => {
    const ids = [make.appId(), make.appId(), make.appId()] as const;
    const [good, textId] = ids;
    const verdicts = parseItems(ids, [
      make.item.disclosed(good),
      make.item.store(textId, { id: String(textId) }),
      null,
    ]);
    expect(ids.map((id) => stateOf(verdicts, id))).toStrictEqual([
      "disclosed",
      "unknown:error",
      "unknown:error",
    ]);
  });

  it("ignores items for IDs that were not requested, and repeated items", () => {
    const first = make.text.note();
    const verdicts = parseItems([ID], [
      make.item.store(),
      make.item.disclosed(ID, first),
      make.item.disclosed(ID, make.text.note()),
    ]);
    expect([...verdicts.keys()]).toStrictEqual([ID]);
    expect(notesOf(verdicts, ID)).toBe(first);
  });

  it.each<readonly [string | null, string]>([
    ["8", "unknown:error"],
    [null, "disclosed"],
  ])("reads an answer whose x-eresult is %j as %s", (eresult, state) => {
    const reply = make.item.response([make.item.disclosed(ID)], { eresult });
    expect(stateOf(parse([ID], reply), ID)).toBe(state);
  });

  it.each<readonly [string, Reply]>([
    ["bad JSON", { body: "{" }],
    ["a null body", { body: "null" }],
    ["store_items as an object", { body: JSON.stringify({ response: { store_items: {} } }) }],
    ["no response envelope", {
      body: JSON.stringify({ store_items: [make.item.disclosed(ID)] }),
    }],
  ])("treats %s as a batch error", (_name, reply) => {
    const ids = [ID, make.appId()];
    expect([...parse(ids, reply).values()]).toStrictEqual(ids.map(() => ERROR));
  });

  /** The result of a request with `status` whose answer carries a disclosed item for `ID`. */
  function answer(status: number): HttpResult {
    return make.http.result(
      make.item.response([make.item.disclosed(ID)], { status }),
      URL_FOR_TESTS,
    );
  }

  it.each<readonly [string, HttpResult, KindVerdicts]>([
    ["a 429", answer(429), RATE_LIMITED],
    ...[400, 404, 414, 500, 503].map((status): readonly [string, HttpResult, KindVerdicts] => [
      `a ${String(status)}`,
      answer(status),
      ERROR,
    ]),
    ["a failed request", make.http.result("network-error", URL_FOR_TESTS), ERROR],
    ["a withheld request", { kind: "withheld" }, RATE_LIMITED],
  ])("maps %s to its unknown reason", (_name, result, expected) => {
    expect(parseGetItems([ID], result, "english")).toStrictEqual(new Map([[ID, expected]]));
  });
});

describe("planBatches", () => {
  it("removes duplicate IDs and keeps the first-seen order", () => {
    const [a, b, c] = [make.appId(), make.appId(), make.appId()];
    const batches = planBatches([c, a, c, b, a], "english");
    expect(batches.map(({ ids }) => ids)).toStrictEqual([[c, a, b]]);
  });

  it("sends at most 50 IDs per request", () => {
    const batches = planBatches(make.appIds(2 * maxIds + 20), "english");
    expect(batches.map(({ ids }) => ids.length)).toStrictEqual([maxIds, maxIds, 20]);
    expect(Math.max(...batches.map(({ url }) => url.length))).toBeLessThan(
      DEFAULT_BATCH_LIMITS.maxUrlLength,
    );
  });

  it("splits a batch whose URL would pass the length guard", () => {
    const ids = make.appIds(10);
    const maxUrlLength = getItemsUrl(ids.slice(0, 3), "english").length;
    const batches = planBatches(ids, "english", { maxIds, maxUrlLength });
    expect(batches.map((batch) => batch.ids.length)).toStrictEqual([3, 3, 3, 1]);
    for (const batch of batches) {
      expect(batch.url).toBe(getItemsUrl(batch.ids, "english"));
      expect(batch.url.length).toBeLessThanOrEqual(maxUrlLength);
    }
  });

  it("still sends a single ID whose URL is over the guard", () => {
    const ids = make.appIds(1);
    const batches = planBatches(ids, "english", { maxIds, maxUrlLength: 10 });
    expect(batches.map((batch) => batch.ids)).toStrictEqual([ids]);
  });

  it("keeps a batch of 50 of the longest IDs under the URL guard with every section", () => {
    const longest = make.largestAppIds(maxIds);
    const batches = planBatches(longest, "english", DEFAULT_BATCH_LIMITS, SECTIONS);
    expect(batches.map(({ ids }) => ids.length)).toStrictEqual([maxIds]);
    expect(batches[0]?.url.length).toBeLessThan(DEFAULT_BATCH_LIMITS.maxUrlLength / 2);
  });

  it.each(
    [
      ["platforms", ["basic_info", "platforms"], [
        "include_extra_details",
        "include_basic_info",
        "include_platforms",
      ]],
      ["the release dates", ["basic_info", "release"], [
        "include_extra_details",
        "include_basic_info",
        "include_release",
      ]],
      ["every section", SECTIONS, [
        "include_extra_details",
        "include_basic_info",
        "include_platforms",
        "include_release",
      ]],
    ] as const,
  )("asks for extra details and %s", (_name, sections, flags) => {
    const [batch] = planBatches(make.appIds(1), "english", DEFAULT_BATCH_LIMITS, sections);
    expect(requestFlags(batch?.url ?? GETITEMS_URL)).toStrictEqual(flags);
  });

  it("plans nothing for no IDs", () => {
    expect(planBatches([], "english")).toStrictEqual([]);
  });

  it("asks for extra details and basic info in the caller's language", () => {
    const id = make.appId();
    const [batch] = planBatches([id], "latam");
    const input = new URL(batch?.url ?? GETITEMS_URL).searchParams.get("input_json");
    expect(input).toBe(
      JSON.stringify({
        ids: [{ appid: id }],
        context: { language: "latam", country_code: "US" },
        data_request: { include_extra_details: true, include_basic_info: true },
      }),
    );
  });
});

const POOL = [...make.fixture.items(mixed), ...make.fixture.items(roguelike)];

function detectorOver(http: Http, language: SteamLanguage = "english") {
  return createGetItemsDetector({ http, language });
}

detectorContract(
  "GetItems over the fixtures",
  () => detectorOver(fake.http([make.item.route(POOL)])),
);
detectorContract(
  "GetItems with no answer",
  () => detectorOver(fake.http([[GETITEMS_URL, "network-error"]])),
);
detectorContract("GetItems withheld", () => detectorOver(fake.withheldHttp()));

describe("createGetItemsDetector", () => {
  it("sends duplicate IDs once, in the page language", async () => {
    const { aiWithService, noBlock } = app;
    const http = fake.http([make.item.route(POOL)]);
    const verdicts = await detectorOver(http, "german").detect([
      aiWithService,
      noBlock,
      aiWithService,
    ]);
    expect(http.calls.map((url) => getItemsRequest(url))).toStrictEqual([
      { ids: [aiWithService, noBlock], language: "german" },
    ]);
    expect(stateOf(verdicts, aiWithService)).toBe("disclosed");
    expect(stateOf(verdicts, noBlock)).toBe("not-disclosed");
  });

  it("sends 120 IDs as 50, 50 and 20, one request at a time", async () => {
    const ids = make.appIds(2 * maxIds + 20);
    const http = fake.http([make.item.route([])]);
    const verdicts = await detectorOver(http).detect(ids);
    expect(http.calls.map((url) => getItemsRequest(url).ids.length)).toStrictEqual([
      maxIds,
      maxIds,
      20,
    ]);
    expect(http.maxInFlight).toBe(1);
    expect(verdicts.size).toBe(ids.length);
  });

  it("keeps the verdicts of good batches when another batch fails", async () => {
    const ids = make.appIds(maxIds + 10);
    const [good, failing] = [ids.slice(0, maxIds), ids.slice(maxIds)];
    const http = fake.http([
      [new RegExp(String(failing[0])), "network-error"],
      make.item.route(good.map((id) => make.item.disclosed(id))),
    ]);
    const verdicts = await detectorOver(http).detect(ids);
    expect(good.map((id) => stateOf(verdicts, id))).toStrictEqual(good.map(() => "disclosed"));
    expect(failing.map((id) => stateOf(verdicts, id))).toStrictEqual(
      failing.map(() => "unknown:error"),
    );
  });

  it("asks for the sections the getter names at call time, and records them", async () => {
    const id = make.appId();
    const http = fake.http([make.item.route([make.item.store(id)])]);
    let sections: readonly (typeof SECTIONS)[number][] = ["basic_info"];
    const detector = createGetItemsDetector({
      http,
      language: "english",
      sections: () => sections,
    });
    expect((await detector.detect([id])).get(id)?.sections).toStrictEqual(["basic_info"]);
    sections = SECTIONS;
    expect((await detector.detect([id])).get(id)?.sections).toBe(SECTIONS);
    expect(http.calls.map((url) => requestFlags(url).includes("include_platforms"))).toStrictEqual(
      [false, true],
    );
  });

  it("sends nothing for no IDs", async () => {
    const http = fake.http([]);
    expect(await detectorOver(http).detect([])).toStrictEqual(new Map());
    expect(http.calls).toStrictEqual([]);
  });
});
