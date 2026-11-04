/**
 * The medium date format of a catalog locale (`pt_BR` formats as `pt-BR`), or the runtime's own
 * when `Intl` lacks the locale.
 */
export function dateFormat(locale: string): Intl.DateTimeFormat {
  const tag = locale.replaceAll("_", "-");
  const supported = Intl.DateTimeFormat.supportedLocalesOf(tag).length > 0 ? tag : undefined;
  return new Intl.DateTimeFormat(supported, { dateStyle: "medium" });
}
