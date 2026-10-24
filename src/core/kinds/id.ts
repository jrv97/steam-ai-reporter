import * as v from "valibot";
import type { TagKind } from "./kind";
import { KINDS } from "./registry";

/** The id of every registered kind, derived from the registry. */
export type KindId = TagKind["id"];

/** Every kind id, in registry order. */
export const KIND_IDS: readonly KindId[] = KINDS.map((kind) => kind.id);

export const KindIdSchema = v.picklist(KIND_IDS);
