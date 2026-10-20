import * as v from "valibot";
import { DEFAULT_LOCALE } from "./catalog";

/**
 * Steam's `<html lang>` values with Steam's own language name and our catalog locale code
 * (rq6, S5). One table serves both directions: the page language picks the catalog, and the
 * Steam name is the `context.language` that GetItems takes.
 */
const STEAM_LANGUAGES = [
  ["en", "english", "en"],
  ["de", "german", "de"],
  ["fr", "french", "fr"],
  ["es", "spanish", "es"],
  ["es-419", "latam", "es_419"],
  ["pt", "portuguese", "pt_PT"],
  ["pt-br", "brazilian", "pt_BR"],
  ["zh-cn", "schinese", "zh_CN"],
  ["zh-tw", "tchinese", "zh_TW"],
  ["ja", "japanese", "ja"],
  ["ko", "koreana", "ko"],
  ["ru", "russian", "ru"],
  ["uk", "ukrainian", "uk"],
  ["pl", "polish", "pl"],
  ["tr", "turkish", "tr"],
  ["th", "thai", "th"],
  ["vi", "vietnamese", "vi"],
  ["id", "indonesian", "id"],
  ["ar", "arabic", "ar"],
  ["cs", "czech", "cs"],
  ["da", "danish", "da"],
  ["nl", "dutch", "nl"],
  ["fi", "finnish", "fi"],
  ["el", "greek", "el"],
  ["hu", "hungarian", "hu"],
  ["it", "italian", "it"],
  ["no", "norwegian", "no"],
  ["ro", "romanian", "ro"],
  ["sv", "swedish", "sv"],
  ["bg", "bulgarian", "bg"],
] as const;

type Row = (typeof STEAM_LANGUAGES)[number];

/** Steam's name for a store language, as GetItems' `context.language` takes it. */
export type SteamLanguage = Row[1];

export const DEFAULT_STEAM_LANGUAGE: SteamLanguage = "english";

/** Validates a Steam language name read from outside, for example a stored verdict. */
export const SteamLanguageSchema = v.picklist(STEAM_LANGUAGES.map((row) => row[1]));

export interface LocaleContext {
  /** The `locale` setting: `auto`, or a catalog locale code the user chose. */
  readonly setting: string;
  /** `<html lang>` on a store page; absent elsewhere, for example on the options page. */
  readonly pageLang?: string;
  /** `navigator.language`, which `auto` follows off store pages. */
  readonly browserLang?: string;
}

const BY_PAGE_LANG: ReadonlyMap<string, Row> = new Map(
  STEAM_LANGUAGES.map((row): [string, Row] => [row[0], row]),
);

function normalize(tag: string): string {
  return tag.trim().toLowerCase().replaceAll("_", "-");
}

/** The Steam language of a store page from its `<html lang>`; undefined outside the table. */
export function steamLanguage(pageLang: string): SteamLanguage | undefined {
  return BY_PAGE_LANG.get(normalize(pageLang))?.[1];
}

/** Catalog locale codes to try for a language tag, most specific first. */
function candidates(tag: string): readonly string[] {
  const normalized = normalize(tag);
  const known = BY_PAGE_LANG.get(normalized)?.[2];
  const [language = "", region] = normalized.split("-");
  const regional = region === undefined ? [] : [`${language}_${region.toUpperCase()}`];
  return [...(known === undefined ? [] : [known]), ...regional, language];
}

/**
 * The catalog locale to use. A chosen locale wins when it has a catalog. `auto` follows the
 * store page's `<html lang>` on store pages and the browser language elsewhere. Every path
 * falls back from region to language, then to English.
 */
export function resolveLocale(context: LocaleContext, available: ReadonlySet<string>): string {
  const tag = context.setting === "auto"
    ? (context.pageLang ?? context.browserLang ?? DEFAULT_LOCALE)
    : context.setting;
  return candidates(tag).find((code) => available.has(code)) ?? DEFAULT_LOCALE;
}
