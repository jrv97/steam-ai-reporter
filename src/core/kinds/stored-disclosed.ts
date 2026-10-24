import * as v from "valibot";
import { VerdictSourceSchema } from "../types";

type StoredEntries<TKind extends string, TFields extends v.ObjectEntries> =
  & {
    readonly state: v.LiteralSchema<"disclosed", undefined>;
    readonly kind: v.LiteralSchema<TKind, undefined>;
    readonly source: typeof VerdictSourceSchema;
  }
  & TFields;

type StoredObject<TKind extends string, TFields extends v.ObjectEntries> = v.ObjectSchema<
  StoredEntries<TKind, TFields>,
  undefined
>;

type StoredSchema<TKind extends string, TFields extends v.ObjectEntries> = v.SchemaWithPipe<
  readonly [
    StoredObject<TKind, TFields>,
    v.ReadonlyAction<v.InferOutput<StoredObject<TKind, TFields>>>,
  ]
>;

/**
 * The schema of a stored disclosed verdict of `kind`: the fields every disclosed verdict has,
 * then the kind's own `fields`. A kind lists only what its payload adds, and takes the type of
 * its disclosed verdict from the output, so a field cannot be added without being stored.
 */
export function storedDisclosed<
  const TKind extends string,
  const TFields extends v.ObjectEntries,
>(kind: TKind, fields: TFields): StoredSchema<TKind, TFields> {
  return v.pipe(
    v.object({
      state: v.literal("disclosed"),
      kind: v.literal(kind),
      source: VerdictSourceSchema,
      ...fields,
    }),
    v.readonly(),
  );
}
