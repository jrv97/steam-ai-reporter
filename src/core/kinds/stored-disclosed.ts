import * as v from "valibot";
import { VerdictSourceSchema } from "../types";

type StoredEntries<TKind extends string, TFields extends v.ObjectEntries> =
  & {
    readonly state: v.LiteralSchema<"disclosed", undefined>;
    readonly kind: v.LiteralSchema<TKind, undefined>;
    readonly source: typeof VerdictSourceSchema;
  }
  & TFields;

/**
 * The schema of a stored disclosed verdict of `kind`: the fields every disclosed verdict has,
 * then the kind's own `fields`. A kind lists only what its payload adds.
 */
export function storedDisclosed<
  const TKind extends string,
  const TFields extends v.ObjectEntries,
>(kind: TKind, fields: TFields): v.ObjectSchema<StoredEntries<TKind, TFields>, undefined> {
  return v.object({
    state: v.literal("disclosed"),
    kind: v.literal(kind),
    source: VerdictSourceSchema,
    ...fields,
  });
}
