import type { Catalogs } from "../../core/i18n/catalog";
import { resolveLocale } from "../../core/i18n/locale";
import { createI18n, type I18n } from "../../core/i18n/t";
import type { SettingsSource } from "../../core/ports";
import { DEFAULT_SETTINGS, parseSettings } from "../../core/settings/settings";

/**
 * The message lookup for the language the settings ask for right now: the menu caption and the
 * dialog follow a language change, while `start()` keeps the one it resolved at page load.
 */
export async function currentI18n(
  doc: Document,
  settings: SettingsSource,
  catalogs: Catalogs,
  browserLang: string | undefined,
): Promise<I18n> {
  let setting = DEFAULT_SETTINGS.locale;
  try {
    setting = parseSettings(await settings.read()).locale;
  } catch {
    // The default setting stands; the form reports a storage that cannot be read.
  }
  const pageLang = doc.documentElement.lang;
  const locale = resolveLocale(
    browserLang === undefined ? { setting, pageLang } : { setting, pageLang, browserLang },
    new Set(Object.keys(catalogs)),
  );
  return createI18n(catalogs, locale);
}
