import * as v from "valibot";
import type { SteamLanguage } from "./i18n/locale";

/** Steam app IDs are unsigned 32-bit integers; 0 is what GetItems reports for an invalid item. */
const MAX_APP_ID = 0xffff_ffff;

/**
 * A Steam app ID. The brand is applied only by this schema, so every `AppId` in core was checked
 * to be an integer in 1 to 2^32 - 1. Other schemas (GetItems `id`, stored verdicts) reuse it.
 */
export const AppIdSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(MAX_APP_ID),
  v.brand("AppId"),
);

export type AppId = v.InferOutput<typeof AppIdSchema>;

/** The value as an `AppId`, or undefined when it is not a valid app ID. */
export function toAppId(value: unknown): AppId | undefined {
  const result = v.safeParse(AppIdSchema, value);
  return result.success ? result.output : undefined;
}

/** Where a known verdict came from: the GetItems API or the English app page (HTML fallback). */
export type VerdictSource = "api" | "html";

/**
 * Why a verdict is unknown. `gated`: the app page hid the store content (age gate, sign-in,
 * redirect). `missing`: Steam returned no usable item. `error`: the request or its answer was
 * broken. `rate-limited`: a breaker held the request back. Unknown is never shown as not disclosed.
 */
export type UnknownReason = "gated" | "missing" | "error" | "rate-limited";

export interface DisclosedVerdict {
  readonly state: "disclosed";
  /** The developer's text, trimmed of outer whitespace and zero-width characters only. */
  readonly notes: string;
  /** The Steam language the notes were requested in; Steam answers in English when untranslated. */
  readonly language: SteamLanguage;
  /** `ai_generation_service.name`, when the developer named one. */
  readonly service?: string;
  /** The app's store name, for the allow-list. */
  readonly name?: string;
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
  "error": { state: "unknown", reason: "error" },
  "rate-limited": { state: "unknown", reason: "rate-limited" },
};

/** What core knows about one app's AI disclosure. Exactly three states (rule 4). */
export type Verdict = DisclosedVerdict | NotDisclosedVerdict | UnknownVerdict;

/**
 * One source of verdicts: GetItems, the HTML fallback, or a chain or decorator of them. Its
 * contract (tests/contracts/detector.contract.ts): it never rejects, and the result holds exactly
 * one verdict per distinct requested ID, with `unknown` for anything it could not settle.
 */
export interface Detector {
  detect(ids: readonly AppId[]): Promise<ReadonlyMap<AppId, Verdict>>;
}
