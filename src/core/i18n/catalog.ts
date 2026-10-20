/** One message of a Chrome `messages.json` catalog, as far as the runtime reads it. */
export interface CatalogEntry {
  readonly message: string;
  readonly placeholders?: Readonly<Record<string, unknown>>;
}

/** A catalog as authored in `src/locales/<locale>/messages.json`: message key to entry. */
export type Catalog = Readonly<Partial<Record<string, CatalogEntry>>>;

/** Catalogs by catalog locale code (`en`, `es`, `pt_BR`). English is always present. */
export type Catalogs = Readonly<Partial<Record<string, Catalog>>>;

/** Named placeholder values. Names are lower case, as `gen_i18n_keys.py` writes them. */
export type Params = Readonly<Record<string, string>>;

export const DEFAULT_LOCALE = "en";

const TOKEN = /\$\$|\$([A-Za-z0-9_@]+)\$/g;

/**
 * Replaces each `$name$` with the parameter of that name (case-insensitive, as in Chrome) and
 * `$$` with `$`. A placeholder without a parameter stays as written, so a gap is visible.
 */
export function substitute(message: string, params: Params): string {
  return message.replace(TOKEN, (token: string, name: string | undefined): string => {
    if (name === undefined) {
      return "$";
    }
    return params[name.toLowerCase()] ?? token;
  });
}
