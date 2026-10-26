import type { KindId } from "./id";
import type { KindSettings } from "./kind-settings";
import { KINDS } from "./registry";

/**
 * The GetItems sections a request can ask for besides `extra_details`, which every request asks
 * for, in request order. `categories` comes with every item and needs no flag.
 */
export const SECTIONS = ["basic_info", "platforms"] as const;

export type Section = (typeof SECTIONS)[number];

/** What every request asks for: `basic_info`, the developers and publishers the ignores follow. */
export const BASE_SECTIONS: readonly Section[] = ["basic_info"];

/**
 * The sections the next request asks for: the base ones, and each section an enabled kind reads.
 * Read at request time, so a settings change applies to the next batch.
 */
export function requestSections(kinds: Readonly<Record<KindId, KindSettings>>): readonly Section[] {
  const wanted = new Set<Section>(BASE_SECTIONS);
  for (const kind of KINDS) {
    if (kinds[kind.id].enabled) {
      for (const section of kind.sections ?? []) {
        wanted.add(section);
      }
    }
  }
  return wanted.size === BASE_SECTIONS.length
    ? BASE_SECTIONS
    : SECTIONS.filter((section) => wanted.has(section));
}

/**
 * Whether an answer that came with the sections `had` holds what asking for `need` would. An
 * answer without a record came without GetItems details, which no section would change.
 */
export function coversSections(
  had: readonly Section[] | undefined,
  need: readonly Section[],
): boolean {
  return had === undefined || need.every((section) => had.includes(section));
}
