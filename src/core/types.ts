import * as v from "valibot";

/** Steam app IDs are unsigned 32-bit integers; 0 is what GetItems reports for an invalid item. */
const MAX_APP_ID = 0xffff_ffff;

/** An integer in 1 to 2^32 - 1, the range of Steam's unsigned 32-bit IDs. */
export const Uint32IdSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(MAX_APP_ID),
);

/**
 * A Steam app ID. The brand is applied only by this schema, so every `AppId` in core was checked
 * to be an integer in 1 to 2^32 - 1. Other schemas (GetItems `id`, stored verdicts) reuse it.
 */
export const AppIdSchema = v.pipe(Uint32IdSchema, v.brand("AppId"));

export type AppId = v.InferOutput<typeof AppIdSchema>;

/** The value as an `AppId`, or undefined when it is not a valid app ID. */
export function toAppId(value: unknown): AppId | undefined {
  const result = v.safeParse(AppIdSchema, value);
  return result.success ? result.output : undefined;
}

/** Where a known verdict came from: the GetItems API or the English app page (HTML fallback). */
export const VerdictSourceSchema = v.picklist(["api", "html"]);

export type VerdictSource = v.InferOutput<typeof VerdictSourceSchema>;

/**
 * Why a verdict is unknown. `gated`: the app page hid the store content (age gate, sign-in,
 * redirect). `missing`: Steam returned no usable item. `malformed`: a field the kind reads came in
 * the wrong shape. `error`: the request or its answer was broken. `rate-limited`: a breaker held
 * the request back. Unknown is never shown as not disclosed.
 */
export type UnknownReason = "gated" | "missing" | "malformed" | "error" | "rate-limited";

/**
 * What every disclosed verdict carries. A tag kind adds its own fields (see `kinds/`): the
 * developer's text, the named product, the matching categories.
 */
export interface DisclosedBase<Kind extends string = string> {
  readonly state: "disclosed";
  /** The id of the tag kind the developer disclosed. */
  readonly kind: Kind;
  readonly source: VerdictSource;
}

export interface NotDisclosedVerdict {
  readonly state: "not-disclosed";
  readonly source: VerdictSource;
}

export interface UnknownVerdict {
  readonly state: "unknown";
  readonly reason: UnknownReason;
}

/** One shared object per unknown reason, so unknown verdicts cost no allocation. */
export const UNKNOWN: Readonly<Record<UnknownReason, UnknownVerdict>> = {
  "gated": { state: "unknown", reason: "gated" },
  "missing": { state: "unknown", reason: "missing" },
  "malformed": { state: "unknown", reason: "malformed" },
  "error": { state: "unknown", reason: "error" },
  "rate-limited": { state: "unknown", reason: "rate-limited" },
};

/** One shared object per source, so a not disclosed verdict costs no allocation. */
export const NOT_DISCLOSED: Readonly<Record<VerdictSource, NotDisclosedVerdict>> = {
  api: { state: "not-disclosed", source: "api" },
  html: { state: "not-disclosed", source: "html" },
};

/**
 * What core knows about one app for one tag kind. Exactly three states (rule 4). `Disclosed` is
 * the disclosed shape of one kind; without it the verdict is the shape every kind shares.
 */
export type Verdict<Disclosed extends DisclosedBase = DisclosedBase> =
  | Disclosed
  | NotDisclosedVerdict
  | UnknownVerdict;
