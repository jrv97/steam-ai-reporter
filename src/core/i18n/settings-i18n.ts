import type { SettingsSource } from "../ports";
import { readSettingsOrDefault, type SettingsRead } from "../settings/read";
import type { Catalogs } from "./catalog";
import { type LocaleContext, resolveLocale } from "./locale";
import { createI18n, type I18n } from "./t";

export interface SettingsI18n {
  /** The `locale` setting as read, or the default one when the settings cannot be read. */
  readonly setting: string;
  readonly i18n: I18n;
  /** Why the settings could not be read; the caller logs it once with `i18n`. */
  readonly failure: SettingsRead["failure"];
}

/**
 * The message lookup for the language the settings ask for right now. When the settings cannot
 * be read, the default setting stands and the failure comes back for the caller to log.
 */
export async function readSettingsI18n(
  source: SettingsSource,
  catalogs: Catalogs,
  context: Omit<LocaleContext, "setting">,
): Promise<SettingsI18n> {
  const { settings, failure } = await readSettingsOrDefault(source);
  const setting = settings.locale;
  const locale = resolveLocale({ ...context, setting }, new Set(Object.keys(catalogs)));
  return { setting, i18n: createI18n(catalogs, locale), failure };
}
