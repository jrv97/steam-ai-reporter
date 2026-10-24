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

const MalformedSchema = v.pipe(v.unknown(), v.transform((): typeof MALFORMED => MALFORMED));

/**
 * A field that parses to its own value, or to `MALFORMED`. Each kind reads the fields it needs
 * and answers unknown when one is malformed, so one bad field costs only the kinds that read it.
 */
function lenient<const TSchema extends v.GenericSchema>(schema: TSchema) {
  return v.union([schema, MalformedSchema]);
}

/**
 * A readonly object schema that, unlike valibot's `object`, does not take an array for an object
 * whose keys are all missing: an array in an object's place is malformed, not an empty object.
 */
function record<const TEntries extends v.ObjectEntries>(entries: TEntries) {
  return v.pipe(
    v.unknown(),
    v.check((input) => !Array.isArray(input)),
    v.object(entries),
    v.readonly(),
  );
}

const AnticheatSchema = record({
  kernel_mode: v.exactOptional(v.boolean()),
  uninstall_completely: v.exactOptional(v.boolean()),
  boot_protection: v.exactOptional(v.boolean()),
  name: v.exactOptional(v.string()),
  name_loc: v.exactOptional(v.string()),
  boot_protection_name: v.exactOptional(v.string()),
});

const EulaEntrySchema = record({ name: v.string(), url: v.string() });

const ExtraDetailsSchema = record({
  content_survey_ai_notes: v.exactOptional(lenient(v.string())),
  ai_generation_service: v.exactOptional(lenient(record({ name: v.exactOptional(v.string()) }))),
  anticheat: v.exactOptional(lenient(AnticheatSchema)),
  drm_third_party_type: v.exactOptional(lenient(v.string())),
  drm_activation_limit: v.exactOptional(lenient(v.string())),
  user_account_third_party: v.exactOptional(lenient(v.string())),
  user_account_third_party_link_to_steam: v.exactOptional(lenient(v.boolean())),
  eula: v.exactOptional(lenient(v.pipe(v.array(EulaEntrySchema), v.readonly()))),
});

const CategoriesSchema = record({
  supported_player_categoryids: v.exactOptional(v.pipe(v.array(v.number()), v.readonly())),
});

/**
 * One store item. `id` echoes the requested ID; `appid` is 0 for invalid items and unused. The
 * name and the categories are lenient like the details; `success`, `id` and `extra_details` are
 * not, because an item without them says nothing about any kind.
 */
export const StoreItemSchema = v.pipe(
  v.object({
    id: AppIdSchema,
    success: v.number(),
    name: v.exactOptional(lenient(v.string())),
    categories: v.exactOptional(lenient(CategoriesSchema)),
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
