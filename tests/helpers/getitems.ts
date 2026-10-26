import * as v from "valibot";
import { GETITEMS_URL } from "../../src/core/detect/getitems";
import {
  type ExtraDetails,
  type StoreItem,
  StoreItemSchema,
} from "../../src/core/detect/getitems.schema";
import type { SteamLanguage } from "../../src/core/i18n/locale";
import { parseJson } from "../../src/core/json";
import type { KindDefinition } from "../../src/core/kinds/kind";
import { type AppId, AppIdSchema, type DisclosedBase, type Verdict } from "../../src/core/types";
import type { Reply, Route } from "./fake-http";

/** A plain store item as GetItems returns it: listed, `success: 1`, no AI notes. */
export function storeItem(
  id: number,
  overrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return {
    item_type: 0,
    id,
    success: 1,
    visible: true,
    name: `App ${String(id)}`,
    appid: id,
    type: 0,
    extra_details: { vetted: true },
    ...overrides,
  };
}

/** A store item whose developer disclosed AI use with these notes. */
export function disclosedItem(
  id: number,
  notes: string,
  service?: string,
): Readonly<Record<string, unknown>> {
  return storeItem(id, {
    extra_details: {
      vetted: true,
      content_survey_ai_notes: notes,
      ...(service === undefined ? {} : { ai_generation_service: { name: service, url: "" } }),
    },
  });
}

/** A demo of the game `game` that declares nothing itself, as demo-parent.json captured one. */
export function demoItem(id: number, game: number): Readonly<Record<string, unknown>> {
  return storeItem(id, { type: 1, related_items: { parent_appid: game } });
}

/** What GetItems answers for an invalid ID (rq6, S2). */
export function invalidItem(id: number): Readonly<Record<string, unknown>> {
  return { item_type: 0, id, success: 15, visible: false, name: "", appid: 0 };
}

export interface ResponseOptions {
  readonly status?: number;
  /** The `x-eresult` header; `null` leaves it out. Default `1`. */
  readonly eresult?: string | null;
}

/**
 * A GetItems reply holding `items`, or a body without `store_items` when `items` is undefined
 * (what Steam sends for an empty or context-less request).
 */
export function getItemsResponse(
  items: readonly unknown[] | undefined,
  options: ResponseOptions = {},
): Reply {
  const { status = 200, eresult = "1" } = options;
  const response = items === undefined ? {} : { store_items: items };
  return {
    status,
    body: JSON.stringify({ response }),
    headers: eresult === null ? {} : { "x-eresult": eresult },
  };
}

const RequestSchema = v.object({
  ids: v.array(v.object({ appid: v.number() })),
  context: v.object({ language: v.string() }),
});

export interface GetItemsRequest {
  readonly ids: readonly number[];
  readonly language: string;
}

/** The IDs and language a GetItems URL asks for. Throws when the URL is not one. */
export function getItemsRequest(url: URL | string): GetItemsRequest {
  const input = new URL(url).searchParams.get("input_json") ?? "";
  const request = v.parse(RequestSchema, parseJson(input));
  return { ids: request.ids.map(({ appid }) => appid), language: request.context.language };
}

const ItemIdSchema = v.looseObject({ id: AppIdSchema });

/** The `id` of each item. Throws on an item without a valid one. */
export function itemIds(items: readonly unknown[]): readonly AppId[] {
  return items.map((item) => v.parse(ItemIdSchema, item).id);
}

/**
 * A route that answers GetItems from a pool of items, in request order, the way Steam does.
 * Requested IDs absent from the pool get no item. `items` may be fixture JSON.
 */
export function getItemsRoute(items: readonly unknown[], options: ResponseOptions = {}): Route {
  const pool = new Map<number, unknown>();
  for (const item of items) {
    pool.set(v.parse(ItemIdSchema, item).id, item);
  }
  return [GETITEMS_URL, (url) => {
    const found = getItemsRequest(url).ids.flatMap((id) => {
      const item = pool.get(id);
      return item === undefined ? [] : [item];
    });
    return getItemsResponse(found, options);
  }];
}

const FixtureSchema = v.object({
  response: v.object({ store_items: v.exactOptional(v.array(v.unknown())) }),
});

/** The `store_items` of a GetItems fixture. */
export function fixtureItems(fixture: unknown): readonly unknown[] {
  return v.parse(FixtureSchema, fixture).response.store_items ?? [];
}

/** A store item and its extra details, as the schema parses them. */
export interface ParsedItem {
  readonly item: StoreItem;
  readonly details: ExtraDetails;
}

/**
 * Parses a plain store item with these extra details through the real schema, after a JSON round
 * trip like a response body, so a kind sees what it sees in production. `overrides` replace item
 * keys such as `name` or `categories`; an undefined value leaves the key out.
 */
export function parsedItem(
  details: Readonly<Record<string, unknown>> = {},
  overrides: Readonly<Record<string, unknown>> = {},
): ParsedItem {
  const body = JSON.stringify(storeItem(1, { extra_details: details, ...overrides }));
  const item = v.parse(StoreItemSchema, parseJson(body));
  if (item.extra_details === undefined) {
    throw new TypeError();
  }
  return { item, details: item.extra_details };
}

/** What a kind answers for a store item with these extra details (see `parsedItem`). */
export function verdictOf<Disclosed extends DisclosedBase>(
  kind: KindDefinition<Disclosed>,
  details: Readonly<Record<string, unknown>> = {},
  overrides: Readonly<Record<string, unknown>> = {},
  language: SteamLanguage = "english",
): Verdict<Disclosed> {
  const parsed = parsedItem(details, overrides);
  return kind.fromGetItems(parsed.item, parsed.details, language);
}

const ItemRecordSchema = v.record(v.string(), v.unknown());

/**
 * The item of a GetItems fixture for the app `from`, as another app: the same name, categories
 * and extra details under the ID `to`. Throws when the fixture has no such item.
 */
export function itemAs(
  fixture: unknown,
  from: number,
  to: number,
): Readonly<Record<string, unknown>> {
  const found = fixtureItems(fixture).find((item) => v.parse(ItemIdSchema, item).id === from);
  return { ...v.parse(ItemRecordSchema, found), id: to, appid: to };
}
