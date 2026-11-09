import { type ConsoleSink, createLogger } from "../log";
import type { SettingsSource } from "../ports";
import { readSettingsOrDefault } from "../settings/read";
import type { Catalogs } from "./catalog";
import { type LocaleContext, resolveLocale } from "./locale";
import { createI18n, type I18n } from "./t";

export interface SettingsI18n {
  /** The `locale` setting as read, or the default one when the settings cannot be read. */
  readonly setting: string;
  readonly i18n: I18n;
}

/**
 * The message lookup for the language the settings ask for right now. When the settings cannot
 * be read, the default setting stands and the failure goes to `sink` in the resolved language.
 */
export async function readSettingsI18n(
  source: SettingsSource,
  catalogs: Catalogs,
  context: Omit<LocaleContext, "setting">,
  sink: ConsoleSink,
): Promise<SettingsI18n> {
  const { settings, failure } = await readSettingsOrDefault(source);
  const setting = settings.locale;
  const locale = resolveLocale({ ...context, setting }, new Set(Object.keys(catalogs)));
  const i18n = createI18n(catalogs, locale);
  if (failure !== undefined) {
    createLogger(i18n, sink, false).error(failure.problem);
  }
  return { setting, i18n };
}
