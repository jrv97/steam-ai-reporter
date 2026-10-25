import * as v from "valibot";
import type { SteamLanguage } from "../i18n/locale";
import { parseJson } from "../json";
import { kindsFromGetItems, type KindVerdicts, UNKNOWN_KINDS } from "../kinds/verdicts";
import type { Detector, Http, HttpResponse, HttpResult } from "../ports";
import type { AppId, UnknownReason } from "../types";
import {
  type GetItemsEnvelope,
  GetItemsEnvelopeSchema,
  type StoreItem,
  StoreItemIdSchema,
  StoreItemSchema,
} from "./getitems.schema";

// Detection through IStoreBrowseService/GetItems (ADR 0001). Rules from rq6: S1 for batch sizes,
// S2 for item states and batch errors.

export const GETITEMS_URL = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1";

/** GetItems needs a country; it only affects prices, which are not read. */
const COUNTRY_CODE = "US";
const HTTP_OK = 200;
const HTTP_TOO_MANY_REQUESTS = 429;
/** Steam's EResult for success, in the `x-eresult` header and each item's `success`. */
const ERESULT_OK = 1;
const SEPARATOR_LENGTH = encodeURIComponent(",").length;

export interface BatchLimits {
  /** IDs per request. */
  readonly maxIds: number;
  /** Encoded URL length per request; S1 saw the server fail between 6,886 and 8,236. */
  readonly maxUrlLength: number;
}

export const DEFAULT_BATCH_LIMITS: BatchLimits = { maxIds: 50, maxUrlLength: 4000 };

/** One GetItems request: its distinct IDs and its URL. */
export interface GetItemsBatch {
  readonly ids: readonly AppId[];
  readonly url: string;
}

/** The GetItems URL for these IDs, with `context.language` set to the page's Steam language. */
export function getItemsUrl(ids: readonly AppId[], language: SteamLanguage): string {
  const input = {
    ids: ids.map((appid) => ({ appid })),
    context: { language, country_code: COUNTRY_CODE },
    data_request: { include_extra_details: true },
  };
  return `${GETITEMS_URL}?input_json=${encodeURIComponent(JSON.stringify(input))}`;
}

/**
 * Splits IDs into requests: duplicates removed (GetItems does not merge them), at most
 * `maxIds` per request, and fewer when the encoded URL would exceed `maxUrlLength`. The length is
 * summed per ID, so planning is linear; one ID alone always gets a request.
 */
export function planBatches(
  ids: Iterable<AppId>,
  language: SteamLanguage,
  limits: BatchLimits = DEFAULT_BATCH_LIMITS,
): readonly GetItemsBatch[] {
  const overhead = getItemsUrl([], language).length;
  const batches: GetItemsBatch[] = [];
  let current: AppId[] = [];
  let length = overhead;
  for (const id of new Set(ids)) {
    const cost = encodeURIComponent(JSON.stringify({ appid: id })).length;
    const full = current.length >= limits.maxIds
      || length + SEPARATOR_LENGTH + cost > limits.maxUrlLength;
    if (current.length > 0 && full) {
      batches.push({ ids: current, url: getItemsUrl(current, language) });
      current = [];
      length = overhead;
    }
    length += current.length === 0 ? cost : SEPARATOR_LENGTH + cost;
    current.push(id);
  }
  if (current.length > 0) {
    batches.push({ ids: current, url: getItemsUrl(current, language) });
  }
  return batches;
}

/** The parsed envelope, or undefined when the body is not JSON or not a GetItems answer. */
function envelopeOf(body: string): GetItemsEnvelope | undefined {
  try {
    const result = v.safeParse(GetItemsEnvelopeSchema, parseJson(body));
    return result.success ? result.output : undefined;
  } catch {
    // parseJson throws SyntaxError on malformed text.
    return undefined;
  }
}

type BatchItems =
  | { readonly ok: true; readonly items: readonly unknown[]; }
  | { readonly ok: false; readonly reason: UnknownReason; };

function batchFailure(reason: UnknownReason): BatchItems {
  return { ok: false, reason };
}

/** The raw items of a 200 answer, or why the whole batch is unknown. */
function responseItems(response: HttpResponse): BatchItems {
  if (response.status === HTTP_TOO_MANY_REQUESTS) {
    return batchFailure("rate-limited");
  }
  if (response.status !== HTTP_OK) {
    return batchFailure("error");
  }
  const eresult = response.headers.get("x-eresult");
  if (eresult !== undefined && eresult.trim() !== String(ERESULT_OK)) {
    return batchFailure("error");
  }
  const items = envelopeOf(response.body)?.response.store_items;
  return items === undefined ? batchFailure("error") : { ok: true, items };
}

function batchItems(result: HttpResult): BatchItems {
  switch (result.kind) {
    case "response":
      return responseItems(result);
    case "failed":
      return batchFailure("error");
    case "withheld":
      return batchFailure("rate-limited");
  }
}

/** Every kind's verdict for one item; unknown `missing` when the item has no usable details. */
function itemVerdicts(item: StoreItem, language: SteamLanguage): KindVerdicts {
  const details = item.extra_details;
  if (item.success !== ERESULT_OK || details === undefined) {
    return UNKNOWN_KINDS.missing;
  }
  return kindsFromGetItems(item, details, language);
}

/**
 * Maps one GetItems result to the verdicts of every requested ID, keyed by the item's `id` (never
 * by `appid`, which is 0 for invalid items). An item that fails its schema gets unknown `error`; a
 * requested ID with no item gets unknown `missing`, or `error` when the batch also held an item
 * whose ID could not be read. A broken answer makes the whole batch unknown.
 */
export function parseGetItems(
  ids: readonly AppId[],
  result: HttpResult,
  language: SteamLanguage,
): ReadonlyMap<AppId, KindVerdicts> {
  const read = batchItems(result);
  if (!read.ok) {
    const unknown = UNKNOWN_KINDS[read.reason];
    return new Map(ids.map((id): [AppId, KindVerdicts] => [id, unknown]));
  }
  const found = new Map<AppId, KindVerdicts>();
  let unattributed = false;
  for (const entry of read.items) {
    const item = v.safeParse(StoreItemSchema, entry);
    if (item.success) {
      if (!found.has(item.output.id)) {
        found.set(item.output.id, itemVerdicts(item.output, language));
      }
      continue;
    }
    const idOnly = v.safeParse(StoreItemIdSchema, entry);
    if (idOnly.success) {
      if (!found.has(idOnly.output.id)) {
        found.set(idOnly.output.id, UNKNOWN_KINDS.error);
      }
    } else {
      unattributed = true;
    }
  }
  const rest = unattributed ? UNKNOWN_KINDS.error : UNKNOWN_KINDS.missing;
  return new Map(ids.map((id): [AppId, KindVerdicts] => [id, found.get(id) ?? rest]));
}

export interface GetItemsOptions {
  readonly http: Http;
  /** The page's Steam language (`steamLanguage(<html lang>)`, else `english`). */
  readonly language: SteamLanguage;
  readonly limits?: BatchLimits;
}

/**
 * The GetItems detector. Batches run one after another, so at most one request is in flight;
 * spacing and backoff come from the `Http` it is given (a throttling decorator).
 */
export function createGetItemsDetector(options: GetItemsOptions): Detector {
  const { http, language } = options;
  const limits = options.limits ?? DEFAULT_BATCH_LIMITS;
  return {
    async detect(ids: readonly AppId[]): Promise<ReadonlyMap<AppId, KindVerdicts>> {
      const verdicts = new Map<AppId, KindVerdicts>();
      for (const batch of planBatches(ids, language, limits)) {
        // Sequential on purpose: one request in flight (rule 13).
        const result = await http.get(batch.url);
        for (const [id, verdict] of parseGetItems(batch.ids, result, language)) {
          verdicts.set(id, verdict);
        }
      }
      return verdicts;
    },
  };
}
