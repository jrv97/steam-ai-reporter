import * as v from "valibot";
import { type JsonValue, parseWithDefaults } from "../json";

/** What the list filter does to hosts whose app carries a kind's tag. */
export const LIST_FILTERS = ["off", "dim", "hide"] as const;

export type ListFilter = (typeof LIST_FILTERS)[number];

/**
 * The mode that wins when several kinds match one host: hide over dim over off. `LIST_FILTERS`
 * runs from the weakest mode to the strongest. The style rules reach the same result, because a
 * hidden host ignores a dim and a host that cannot hide dims for both.
 */
export function strongestFilter(modes: Iterable<ListFilter>): ListFilter {
  let strongest: ListFilter = "off";
  for (const mode of modes) {
    if (LIST_FILTERS.indexOf(mode) > LIST_FILTERS.indexOf(strongest)) {
      strongest = mode;
    }
  }
  return strongest;
}

/** The user's settings for one tag kind. */
export interface KindSettings {
  /** Master switch: a disabled kind draws no badge, banner or filter. */
  readonly enabled: boolean;
  /** Show the badge on capsules. */
  readonly badge: boolean;
  /** Show the banner on app pages. */
  readonly banner: boolean;
  readonly filter: ListFilter;
}

/** What a kind starts with: switched on, badge and banner shown, the list left alone. */
export const DEFAULT_KIND_SETTINGS: KindSettings = {
  enabled: true,
  badge: true,
  banner: true,
  filter: "off",
};

function kindSettingsSchema(defaults: KindSettings) {
  return v.object({
    enabled: v.fallback(v.boolean(), defaults.enabled),
    badge: v.fallback(v.boolean(), defaults.badge),
    banner: v.fallback(v.boolean(), defaults.banner),
    filter: v.fallback(v.picklist(LIST_FILTERS), defaults.filter),
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
  return parseWithDefaults(schema, stored);
}

/** The stored value of one kind's settings; a field added to `KindSettings` must be added here. */
export function encodeKindSettings(settings: KindSettings): JsonValue {
  const stored: { readonly [Field in keyof KindSettings]: JsonValue; } = {
    enabled: settings.enabled,
    badge: settings.badge,
    banner: settings.banner,
    filter: settings.filter,
  };
  return stored;
}

/** The settings that take effect: a disabled kind shows no badge or banner and filters nothing. */
export function effectiveSettings(settings: KindSettings): KindSettings {
  return settings.enabled ? settings : { ...settings, badge: false, banner: false, filter: "off" };
}
