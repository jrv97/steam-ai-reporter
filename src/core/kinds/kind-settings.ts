import * as v from "valibot";
import { type JsonValue, parseWithDefaults, toJsonValue } from "../json";
import { CHIP_TEXT_SCHEMAS, type ChipText } from "./chip-text";
import { type HexColor, HexColorSchema } from "./color";
import type { KindId } from "./id";
import type { FacetDefinition, FacetId } from "./kind";

/** What the list filter does to hosts whose app carries a kind's tag. */
export const LIST_FILTERS = ["off", "dim", "hide"] as const;

export type ListFilter = (typeof LIST_FILTERS)[number];

/**
 * The values a kind with facets tags. `one` holds a single value of an exclusive status, such as a
 * device rating. `many` holds any set of values in the kind's order, and an empty set tags nothing.
 */
export type TaggedFacets =
  | { readonly pick: "one"; readonly facet: FacetId; }
  | { readonly pick: "many"; readonly facets: readonly FacetId[]; };

/** The user's settings for one tag kind. */
export interface KindSettings {
  /** Master switch: a disabled kind draws no badge, banner or filter. */
  readonly enabled: boolean;
  /** Show the badge on capsules. */
  readonly badge: boolean;
  /** Show the banner on app pages. */
  readonly banner: boolean;
  readonly filter: ListFilter;
  /** The tag's own color on every surface that carries it; absent, the default violet. */
  readonly color?: HexColor | undefined;
  /** For a kind with facets only: the values chips, the banner and the list filter act on. */
  readonly tagged?: TaggedFacets;
  /** The person's own text for every chip of the kind; absent, the catalog's (ADR 0017). */
  readonly chip?: ChipText | undefined;
  /** The person's own text for the chips of small game images; absent, `chip`'s. */
  readonly chipCompact?: ChipText | undefined;
}

/** Each kind's chip text fields, which every surface that draws a chip reads. */
export type ChipWords = Readonly<
  Partial<Record<KindId, Pick<KindSettings, "chip" | "chipCompact">>>
>;

/** What parsing a kind's settings needs from its definition. */
export interface KindSettingsSpec {
  readonly defaults: KindSettings;
  readonly facets?: readonly FacetDefinition<FacetId>[];
}

/**
 * What a kind starts with: switched on, badge and banner shown, the list left alone, and no custom
 * color.
 */
export const DEFAULT_KIND_SETTINGS: KindSettings = {
  enabled: true,
  badge: true,
  banner: true,
  filter: "off",
};

/** What a kind that most games would carry starts with: the defaults, switched off. */
export const OFF_KIND_SETTINGS: KindSettings = { ...DEFAULT_KIND_SETTINGS, enabled: false };

/**
 * The known facet ids among stored values, each once, in the kind's order; an unknown or repeated
 * value is dropped.
 */
function knownFacets(facets: readonly FacetDefinition<FacetId>[], values: readonly unknown[]) {
  return facets.filter((facet) => values.includes(facet.id)).map((facet) => facet.id);
}

/** The values `tagged` holds, in the kind's order; none without it. */
export function taggedFacets(tagged: TaggedFacets | undefined): readonly FacetId[] {
  if (tagged === undefined) {
    return [];
  }
  switch (tagged.pick) {
    case "one":
      return [tagged.facet];
    case "many":
      return tagged.facets;
    default:
      return tagged satisfies never;
  }
}

/** The stored fields a kind's tagged values come from: `facet` for one, `facets` for many. */
export interface StoredTagged {
  readonly facet?: unknown;
  readonly facets?: readonly unknown[] | undefined;
}

/**
 * What a kind with facets tags, from its stored fields; none for a kind without facets. A kind
 * that tags one value takes `facet`, else the first known value of a stored `facets` list, the
 * shape it had before, else its default. A kind that tags many takes the known values of `facets`.
 */
export function readTagged(
  { defaults, facets }: KindSettingsSpec,
  stored: StoredTagged,
): TaggedFacets | undefined {
  if (facets === undefined) {
    return undefined;
  }
  const fallback = defaults.tagged ?? { pick: "many", facets: [] };
  switch (fallback.pick) {
    case "one": {
      const [facet] = [
        ...knownFacets(facets, [stored.facet]),
        ...knownFacets(facets, stored.facets ?? []),
      ];
      return facet === undefined ? fallback : { pick: "one", facet };
    }
    case "many":
      return stored.facets === undefined
        ? fallback
        : { pick: "many", facets: knownFacets(facets, stored.facets) };
    default:
      return fallback satisfies never;
  }
}

/** The stored fields of a kind's tagged values, as `readTagged` reads them back. */
function encodeTagged(tagged: TaggedFacets | undefined): StoredTagged {
  if (tagged === undefined) {
    return {};
  }
  switch (tagged.pick) {
    case "one":
      return { facet: tagged.facet };
    case "many":
      return { facets: tagged.facets };
    default:
      return tagged satisfies never;
  }
}

function kindSettingsSchema({ defaults }: KindSettingsSpec) {
  return v.object({
    enabled: v.fallback(v.boolean(), defaults.enabled),
    badge: v.fallback(v.boolean(), defaults.badge),
    banner: v.fallback(v.boolean(), defaults.banner),
    filter: v.fallback(v.picklist(LIST_FILTERS), defaults.filter),
    color: v.fallback(v.optional(HexColorSchema), defaults.color),
    facet: v.optional(v.unknown()),
    facets: v.fallback(v.optional(v.array(v.unknown())), undefined),
    chip: v.fallback(v.optional(CHIP_TEXT_SCHEMAS.chip), defaults.chip),
    chipCompact: v.fallback(v.optional(CHIP_TEXT_SCHEMAS.chipCompact), defaults.chipCompact),
  });
}

const schemas = new WeakMap<KindSettingsSpec, ReturnType<typeof kindSettingsSchema>>();

/**
 * The settings without a key for an unset color or chip text, so settings are equal however they
 * got there.
 */
function trimmed(settings: KindSettings): KindSettings {
  const copy: { -readonly [Field in keyof KindSettings]: KindSettings[Field]; } = { ...settings };
  if (copy.color === undefined) {
    delete copy.color;
  }
  if (copy.chip === undefined) {
    delete copy.chip;
  }
  if (copy.chipCompact === undefined) {
    delete copy.chipCompact;
  }
  return copy;
}

/**
 * The stored settings: each valid field, and the default for every other one. A kind with facets
 * reads its tagged values through `readTagged`.
 */
export function parseKindSettings(kind: KindSettingsSpec, stored: unknown): KindSettings {
  let schema = schemas.get(kind);
  if (schema === undefined) {
    schema = kindSettingsSchema(kind);
    schemas.set(kind, schema);
  }
  const { facet, facets, ...rest } = parseWithDefaults(schema, stored);
  const tagged = readTagged(kind, { facet, facets });
  // Only the keys that apply, so settings read back equal the defaults they came from.
  return trimmed(tagged === undefined ? rest : { ...rest, tagged });
}

/**
 * One kind's settings with the fields of `patch` replaced. A color or chip text of `undefined`
 * clears it and leaves no key behind.
 */
export function mergeKindSettings(
  settings: KindSettings,
  patch: Readonly<Partial<KindSettings>> | undefined,
): KindSettings {
  return trimmed({ ...settings, ...patch });
}

/**
 * The stored value of one kind's settings; a field added to `KindSettings` must be added here. An
 * unset field is left out, so what is stored stays what it was before the field existed.
 */
export function encodeKindSettings(settings: KindSettings): JsonValue {
  const fields: Readonly<Record<Exclude<keyof KindSettings, "tagged">, unknown>> = {
    enabled: settings.enabled,
    badge: settings.badge,
    banner: settings.banner,
    filter: settings.filter,
    color: settings.color,
    chip: settings.chip,
    chipCompact: settings.chipCompact,
  };
  return toJsonValue({ ...fields, ...encodeTagged(settings.tagged) }) ?? {};
}

/** The settings that take effect: a disabled kind shows no badge or banner and filters nothing. */
export function effectiveSettings(settings: KindSettings): KindSettings {
  return settings.enabled ? settings : { ...settings, badge: false, banner: false, filter: "off" };
}
