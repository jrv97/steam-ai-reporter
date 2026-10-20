import { createI18n, type I18n } from "../../src/core/i18n/t";
import en from "../../src/locales/en/messages.json";

/** The shipped English catalog, as the UI renderers see it. */
export function englishI18n(): I18n {
  return createI18n({ en }, "en");
}
