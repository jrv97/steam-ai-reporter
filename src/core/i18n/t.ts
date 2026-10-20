import { type Catalog, type Catalogs, DEFAULT_LOCALE, type Params, substitute } from "./catalog";
import type { MessageParams, PluralParams } from "./keys.gen";

/** Maps each key of a catalog schema to the placeholders its message takes. */
export type ParamsSchema<S> = { readonly [K in keyof S]: Params; };

/** Keys whose message takes no placeholders, so the params may be omitted. */
type BareKey<S> =
  & { [K in keyof S]: Record<never, never> extends S[K] ? K : never; }[keyof S]
  & string;

/**
 * Message lookup for one locale. `M` and `P` default to the types generated from the shipped
 * catalogs; tests pass the types generated from their own catalogs.
 */
export interface I18n<
  M extends ParamsSchema<M> = MessageParams,
  P extends ParamsSchema<P> = PluralParams,
> {
  /** The catalog locale in use: the requested one if it has a catalog, else English. */
  readonly locale: string;
  t(key: BareKey<M>): string;
  t<K extends keyof M & string>(key: K, params: M[K]): string;
  /** Picks `<base>_<category>` by `Intl.PluralRules`, else `<base>_other`; fills `$count$`. */
  plural(base: BareKey<P>, count: number): string;
  plural<K extends keyof P & string>(base: K, count: number, params: P[K]): string;
}

interface IntlPair {
  readonly rules: Intl.PluralRules;
  readonly numbers: Intl.NumberFormat;
}

const NO_PARAMS: Params = {};

/** Plural rules and number format for a catalog locale, or English ones when `Intl` lacks it. */
function intlFor(locale: string): IntlPair {
  const tag = locale.replaceAll("_", "-");
  const supported = Intl.PluralRules.supportedLocalesOf(tag).length > 0 ? tag : DEFAULT_LOCALE;
  return { rules: new Intl.PluralRules(supported), numbers: new Intl.NumberFormat(supported) };
}

function pluralText(catalog: Catalog, base: string, count: number, intl: IntlPair) {
  const entry = catalog[`${base}_${intl.rules.select(count)}`] ?? catalog[`${base}_other`];
  return entry?.message;
}

/**
 * Creates the message lookup for `locale`. A key or a whole locale missing from the catalogs
 * falls back to English; a key missing from English too returns the key itself.
 */
export function createI18n<
  M extends ParamsSchema<M> = MessageParams,
  P extends ParamsSchema<P> = PluralParams,
>(catalogs: Catalogs, locale: string): I18n<M, P> {
  const english = catalogs[DEFAULT_LOCALE] ?? {};
  const own = catalogs[locale];
  const active = own ?? english;
  const resolved = own === undefined ? DEFAULT_LOCALE : locale;
  const local = intlFor(resolved);
  const fallback = intlFor(DEFAULT_LOCALE);

  const t = (key: string, params: Params = NO_PARAMS): string => {
    const text = active[key]?.message ?? english[key]?.message;
    return text === undefined ? key : substitute(text, params);
  };

  const plural = (base: string, count: number, params: Params = NO_PARAMS): string => {
    const text = pluralText(active, base, count, local);
    if (text !== undefined) {
      return substitute(text, { ...params, count: local.numbers.format(count) });
    }
    const englishText = pluralText(english, base, count, fallback);
    return englishText === undefined
      ? base
      : substitute(englishText, { ...params, count: fallback.numbers.format(count) });
  };

  return { locale: resolved, t, plural };
}
