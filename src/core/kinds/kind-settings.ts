import * as v from "valibot";

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
}

/**
 * The settings in a stored value: every valid field, and the default for every other one, so one
 * bad or missing field does not reset the others.
 */
export function parseKindSettings(defaults: KindSettings, stored: unknown): KindSettings {
  const schema = v.fallback(
    v.object({
      enabled: v.fallback(v.boolean(), defaults.enabled),
      badge: v.fallback(v.boolean(), defaults.badge),
      banner: v.fallback(v.boolean(), defaults.banner),
      filter: v.fallback(v.picklist(LIST_FILTERS), defaults.filter),
    }),
    defaults,
  );
  return v.parse(schema, stored);
}

/** The settings that take effect: a disabled kind shows no badge or banner and filters nothing. */
export function effectiveSettings(settings: KindSettings): KindSettings {
  return settings.enabled ? settings : { ...settings, badge: false, banner: false, filter: "off" };
}
