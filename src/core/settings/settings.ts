import * as v from "valibot";
import type { JsonValue } from "../json";

/** What the list filter does to hosts whose app discloses AI use. */
export const LIST_FILTERS = ["off", "dim", "hide"] as const;

export type ListFilter = (typeof LIST_FILTERS)[number];

/** The `locale` setting that follows the store page's language (see `resolveLocale`). */
export const AUTO_LOCALE = "auto";

/** A locale code such as `en`, `pt_BR` or `zh-CN`; `resolveLocale` checks that it has a catalog. */
const LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:[_-][A-Za-z0-9]{2,8})*$/;

const LocaleSchema = v.union([v.literal(AUTO_LOCALE), v.pipe(v.string(), v.regex(LOCALE_PATTERN))]);

export interface Settings {
  /** Show the badge on capsules. */
  readonly badges: boolean;
  /** Show the banner on app pages. */
  readonly banner: boolean;
  readonly listFilter: ListFilter;
  /** `auto`, or a catalog locale code the user chose. */
  readonly locale: string;
  /** Write debug lines to the console. */
  readonly debug: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  badges: true,
  banner: true,
  listFilter: "off",
  locale: AUTO_LOCALE,
  debug: false,
};

// Each field falls back to its own default, so one bad or missing field (an old version, a
// hand-edited value) does not reset the others.
const SettingsSchema = v.fallback(
  v.object({
    badges: v.fallback(v.boolean(), DEFAULT_SETTINGS.badges),
    banner: v.fallback(v.boolean(), DEFAULT_SETTINGS.banner),
    listFilter: v.fallback(v.picklist(LIST_FILTERS), DEFAULT_SETTINGS.listFilter),
    locale: v.fallback(LocaleSchema, DEFAULT_SETTINGS.locale),
    debug: v.fallback(v.boolean(), DEFAULT_SETTINGS.debug),
  }),
  DEFAULT_SETTINGS,
);

/** The settings in a stored value: every valid field, and the default for every other one. */
export function parseSettings(stored: unknown): Settings {
  return v.parse(SettingsSchema, stored);
}

/** The stored value of the settings. */
export function encodeSettings(settings: Settings): JsonValue {
  return {
    badges: settings.badges,
    banner: settings.banner,
    listFilter: settings.listFilter,
    locale: settings.locale,
    debug: settings.debug,
  };
}
