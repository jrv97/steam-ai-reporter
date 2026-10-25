import * as v from "valibot";

/** Every tag kind the extension knows. A new kind gets an id here and an entry in `registry.ts`. */
export const KIND_IDS = ["ai"] as const;

export type KindId = (typeof KIND_IDS)[number];

export const KindIdSchema = v.picklist(KIND_IDS);
