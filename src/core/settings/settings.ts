import * as v from "valibot";
import { type JsonValue, parseWithDefaults } from "../json";
import { KIND_IDS, type KindId } from "../kinds/id";
import {
  encodeKindSettings,
  type KindSettings,
  mergeKindSettings,
  parseKindSettings,
} from "../kinds/kind-settings";
import { parseOrder, sameOrder } from "../kinds/order";
import { KINDS, perKind } from "../kinds/registry";

/** The `locale` setting that follows the store page's language (see `resolveLocale`). */
export const AUTO_LOCALE = "auto";

/** A locale code such as `en`, `pt_BR` or `zh-CN`; `resolveLocale` checks that it has a catalog. */
const LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:[_-][A-Za-z0-9]{2,8})*$/;

export const LocaleSchema = v.union([
  v.literal(AUTO_LOCALE),
  v.pipe(v.string(), v.regex(LOCALE_PATTERN)),
]);

export interface Settings {
  /** `auto`, or a catalog locale code the user chose. */
  readonly locale: string;
  /** Write debug lines to the console. */
  readonly debug: boolean;
  readonly kinds: Readonly<Record<KindId, KindSettings>>;
  /** Every kind once, in the order chips, banners and summaries list them. */
  readonly order: readonly KindId[];
}

export const DEFAULT_SETTINGS: Settings = {
  locale: AUTO_LOCALE,
  debug: false,
  kinds: perKind((kind) => kind.defaults),
  order: KIND_IDS,
};

// Each field falls back to its own default, so one bad or missing field (an old version, a
// hand-edited value) does not reset the others. The kinds stay unvalidated until each one is
// parsed against its own defaults.
const SettingsSchema = v.object({
  locale: v.fallback(LocaleSchema, DEFAULT_SETTINGS.locale),
  debug: v.fallback(v.boolean(), DEFAULT_SETTINGS.debug),
  kinds: v.fallback(v.record(v.string(), v.unknown()), {}),
  order: v.fallback(
    v.pipe(v.array(v.unknown()), v.transform((values) => parseOrder(values))),
    KIND_IDS,
  ),
});

/** The settings in a stored value: every valid field, and the default for every other one. */
export function parseSettings(stored: unknown): Settings {
  const { locale, debug, kinds, order } = parseWithDefaults(SettingsSchema, stored);
  return {
    locale,
    debug,
    kinds: perKind((kind) => parseKindSettings(kind, kinds[kind.id])),
    order,
  };
}

/** The stored value of the settings. */
export function encodeSettings(settings: Settings): JsonValue {
  const kinds: Record<string, JsonValue> = {};
  for (const kind of KINDS) {
    kinds[kind.id] = encodeKindSettings(settings.kinds[kind.id]);
  }
  // The registry order is not stored, so a new kind lands last for one who never moved a tag
  const { locale, debug, order } = settings;
  return { locale, debug, kinds, ...(sameOrder(order, KIND_IDS) ? {} : { order }) };
}

/** A change to the settings: only the fields it names, so it leaves every other one alone. */
export interface SettingsPatch {
  readonly locale?: string;
  readonly debug?: boolean;
  readonly kinds?: Readonly<Partial<Record<KindId, Readonly<Partial<KindSettings>>>>>;
  /** A whole order; a kind it leaves out goes last. */
  readonly order?: readonly KindId[];
}

/** The settings with the fields of `patch` replaced. */
export function applyPatch(settings: Settings, patch: SettingsPatch): Settings {
  return {
    locale: patch.locale ?? settings.locale,
    debug: patch.debug ?? settings.debug,
    kinds: perKind((kind) => mergeKindSettings(settings.kinds[kind.id], patch.kinds?.[kind.id])),
    order: patch.order === undefined ? settings.order : parseOrder(patch.order),
  };
}

/**
 * A patch that names every field, so applying it sets the settings to exactly `settings`. An unset
 * color or chip text is named as `undefined`, which clears a stored one.
 */
export function wholePatch(settings: Settings): SettingsPatch {
  return {
    locale: settings.locale,
    debug: settings.debug,
    kinds: perKind((kind) => {
      const own = settings.kinds[kind.id];
      return { ...own, color: own.color, chip: own.chip, chipCompact: own.chipCompact };
    }),
    order: settings.order,
  };
}
