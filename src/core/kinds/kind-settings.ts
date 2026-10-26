import * as v from "valibot";
import { type JsonValue, parseWithDefaults } from "../json";
import { type HexColor, HexColorSchema } from "./color";

/** What the list filter does to hosts whose app carries a kind's tag. */
export const LIST_FILTERS = ["off", "dim", "hide"] as const;

export type ListFilter = (typeof LIST_FILTERS)[number];

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

function kindSettingsSchema(defaults: KindSettings) {
  return v.object({
    enabled: v.fallback(v.boolean(), defaults.enabled),
    badge: v.fallback(v.boolean(), defaults.badge),
    banner: v.fallback(v.boolean(), defaults.banner),
    filter: v.fallback(v.picklist(LIST_FILTERS), defaults.filter),
    color: v.fallback(v.optional(HexColorSchema), defaults.color),
  });
}

const schemas = new WeakMap<KindSettings, ReturnType<typeof kindSettingsSchema>>();

/** The stored settings: each valid field, and the default for every other one. */
export function parseKindSettings(defaults: KindSettings, stored: unknown): KindSettings {
  let schema = schemas.get(defaults);
  if (schema === undefined) {
    schema = kindSettingsSchema(defaults);
    schemas.set(defaults, schema);
  }
  const { color, ...rest } = parseWithDefaults(schema, stored);
  // No `color` key at all while none is set, so a kind with no color reads back as its defaults.
  return color === undefined ? rest : { ...rest, color };
}

/**
 * One kind's settings with the fields of `patch` replaced. A `color` of `undefined` clears the
 * color, and leaves no key behind, so settings with no color are equal however they got there.
 */
export function mergeKindSettings(
  settings: KindSettings,
  patch: Readonly<Partial<KindSettings>> | undefined,
): KindSettings {
  const { color, ...rest } = { ...settings, ...patch };
  return color === undefined ? rest : { ...rest, color };
}

/** The stored value of one kind's settings; a field added to `KindSettings` must be added here. */
export function encodeKindSettings(settings: KindSettings): JsonValue {
  const stored: Readonly<Record<Exclude<keyof KindSettings, "color">, JsonValue>> = {
    enabled: settings.enabled,
    badge: settings.badge,
    banner: settings.banner,
    filter: settings.filter,
  };
  // An unset color is left out, so what is stored stays what it was before colors existed.
  return settings.color === undefined ? stored : { ...stored, color: settings.color };
}

/** The settings that take effect: a disabled kind shows no badge or banner and filters nothing. */
export function effectiveSettings(settings: KindSettings): KindSettings {
  return settings.enabled ? settings : { ...settings, badge: false, banner: false, filter: "off" };
}
