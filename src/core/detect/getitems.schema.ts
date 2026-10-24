import * as v from "valibot";
import { AppIdSchema } from "../types";

// Schemas for the IStoreBrowseService/GetItems answer (ADR 0001, rq6 S2). They name only the
// fields the kinds read; valibot drops every other key. Each nested object is readonly, so the
// parsed data is deep readonly.

/**
 * The envelope. `store_items` entries stay `unknown` here and are validated one by one with
 * `StoreItemSchema`, so one malformed item does not discard the batch (rq7, S8).
 */
export const GetItemsEnvelopeSchema = v.pipe(
  v.object({
    response: v.pipe(
      v.object({
        store_items: v.exactOptional(v.pipe(v.array(v.unknown()), v.readonly())),
      }),
      v.readonly(),
    ),
  }),
  v.readonly(),
);

/** What a field holds when Steam sent it in the wrong shape. */
export const MALFORMED: unique symbol = Symbol("malformed");

/** The longest developer string a kind reads; a longer one is malformed. */
export const MAX_TEXT_LENGTH = 4000;
/** The most entries a list a kind reads may have; a longer one is malformed. */
export const MAX_LIST_LENGTH = 50;

const MalformedSchema = v.pipe(v.unknown(), v.transform((): typeof MALFORMED => MALFORMED));
const DroppedSchema = v.pipe(v.unknown(), v.transform((): undefined => undefined));

const TextSchema = v.pipe(v.string(), v.maxLength(MAX_TEXT_LENGTH));

/** A list of at most `MAX_LIST_LENGTH` entries. */
function list<const TItem extends v.GenericSchema>(item: TItem) {
  return v.pipe(v.array(item), v.maxLength(MAX_LIST_LENGTH), v.readonly());
}

/**
 * A field that parses to its own value, or to `MALFORMED`. A kind answers unknown when a field it
 * reads is malformed. One bad field costs only the kinds that read it.
 */
function lenient<const TSchema extends v.GenericSchema>(schema: TSchema) {
  return v.exactOptional(v.union([schema, MalformedSchema]));
}

/** A field that only adds detail to a verdict. When malformed it reads as absent. */
function droppable<const TSchema extends v.GenericSchema>(schema: TSchema) {
  return v.exactOptional(v.union([schema, DroppedSchema]));
}

/** Steam's JSON has shown `[]` for an empty object, so an empty array stands for `{}`. */
function emptyArrayAsObject(input: unknown): unknown {
  return Array.isArray(input) && input.length === 0 ? {} : input;
}

/**
 * A readonly object schema. Unlike valibot's `object`, it takes no array as an object.
 * A list with entries in an object's place is malformed.
 */
function record<const TEntries extends v.ObjectEntries>(entries: TEntries) {
  return v.pipe(
    v.unknown(),
    v.transform(emptyArrayAsObject),
    v.check((input) => !Array.isArray(input)),
    v.object(entries),
    v.readonly(),
  );
}

const AnticheatSchema = record({
  kernel_mode: v.exactOptional(v.boolean()),
  uninstall_completely: droppable(v.boolean()),
  boot_protection: droppable(v.boolean()),
  name: droppable(TextSchema),
  name_loc: droppable(TextSchema),
  boot_protection_name: droppable(TextSchema),
});

const EulaEntrySchema = record({ name: TextSchema, url: v.exactOptional(TextSchema) });

const ExtraDetailsSchema = record({
  content_survey_ai_notes: lenient(TextSchema),
  ai_generation_service: lenient(record({ name: v.exactOptional(TextSchema) })),
  anticheat: lenient(AnticheatSchema),
  drm_third_party_type: lenient(TextSchema),
  drm_activation_limit: droppable(TextSchema),
  user_account_third_party: lenient(TextSchema),
  user_account_third_party_link_to_steam: droppable(v.boolean()),
  eula: lenient(list(EulaEntrySchema)),
});

const CategoriesSchema = record({
  supported_player_categoryids: v.exactOptional(list(v.number())),
});

/**
 * One store item. `id` echoes the requested ID; `appid` is 0 for invalid items and unused.
 * The name and the categories are lenient. An item without a valid `id`, `success` or
 * `extra_details` says nothing about any kind.
 */
export const StoreItemSchema = v.pipe(
  v.object({
    id: AppIdSchema,
    success: v.number(),
    name: lenient(TextSchema),
    categories: lenient(CategoriesSchema),
    extra_details: v.exactOptional(ExtraDetailsSchema),
  }),
  v.readonly(),
);

/**
 * Only the `id` of an item, to attribute an item that fails `StoreItemSchema` to its app, so that
 * app gets unknown `error` rather than `missing`.
 */
export const StoreItemIdSchema = v.object({ id: AppIdSchema });

export type GetItemsEnvelope = v.InferOutput<typeof GetItemsEnvelopeSchema>;
export type StoreItem = v.InferOutput<typeof StoreItemSchema>;
export type ExtraDetails = v.InferOutput<typeof ExtraDetailsSchema>;
