import * as v from "valibot";
import { AppIdSchema } from "../types";

// Schemas for the IStoreBrowseService/GetItems answer (ADR 0001, rq6 S2). They name only the
// fields the parser reads; valibot drops every other key. Each nested object is readonly, so the
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

const ExtraDetailsSchema = v.pipe(
  v.object({
    content_survey_ai_notes: v.exactOptional(v.string()),
    ai_generation_service: v.exactOptional(
      v.pipe(v.object({ name: v.exactOptional(v.string()) }), v.readonly()),
    ),
  }),
  v.readonly(),
);

/** One store item. `id` echoes the requested ID; `appid` is 0 for invalid items and unused. */
export const StoreItemSchema = v.pipe(
  v.object({
    id: AppIdSchema,
    success: v.number(),
    name: v.exactOptional(v.string()),
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
