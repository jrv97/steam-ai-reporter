import * as v from "valibot";
import {
  CHIP_TEXT_SCHEMAS,
  type ChipText,
  type ChipTextField,
} from "../../src/core/kinds/chip-text";
import type { KindId } from "../../src/core/kinds/id";
import type { FacetId } from "../../src/core/kinds/kind";
import {
  type KindSettings,
  LIST_FILTERS,
  type ListFilter,
  type TaggedFacets,
} from "../../src/core/kinds/kind-settings";
import { perKind } from "../../src/core/kinds/registry";
import { applyPatch, type Settings, wholePatch } from "../../src/core/settings/settings";
import type { StoredSettings } from "../../src/core/settings/settings-source";
import { applyKindSettings } from "../../src/core/ui/kind-attributes";

/** The text as a person's chip text for a field; throws when nothing is left of it. */
function chipText(text: string, field: ChipTextField = "chip"): ChipText {
  return v.parse(CHIP_TEXT_SCHEMAS[field], text);
}

/** Settings whose kinds carry these chip texts, by kind and field. */
export function withChipText(
  settings: Settings,
  texts: Partial<Record<KindId, Partial<Record<ChipTextField, string>>>>,
): Settings {
  return applyPatch(settings, {
    kinds: perKind((kind) => {
      const own = texts[kind.id] ?? {};
      return {
        chip: own.chip === undefined ? undefined : chipText(own.chip),
        chipCompact: own.chipCompact === undefined
          ? undefined
          : chipText(own.chipCompact, "chipCompact"),
      };
    }),
  });
}

/** The kinds that start switched off: most games would carry them, or Valve states them. */
export const OFF_KINDS: readonly KindId[] = ["pvp", "iap", "deck", "machine", "family"];

/** The kinds that start on without a banner entry, since the page already says it. */
export const BANNERLESS_KINDS: readonly KindId[] = ["earlyaccess"];

/** Valve's device ratings, each with Steam's three rating words. */
export const STATUS_KINDS = ["deck", "machine"] as const;

/** The kinds Valve states: they start off, with no banner entry and only Unsupported tagged. */
const VALVE_KINDS = [...STATUS_KINDS, "family"] as const;

export type ValveKind = (typeof VALVE_KINDS)[number];

export function isValveKind(id: KindId): id is ValveKind {
  return VALVE_KINDS.some((kind) => kind === id);
}

type PlainBase<T> = Omit<T, "enabled" | "banner"> & {
  readonly enabled: boolean;
  readonly banner: boolean;
};

/** One kind's settings as `plainKinds` gives them, with `Tagged` for what a Valve kind tags. */
export type PlainKind<T, Tagged> = PlainBase<T> | (PlainBase<T> & Tagged);

/** What a kind tags, as storage holds it: one `facet`, or a `facets` list. */
interface StoredTagged {
  readonly facet?: FacetId;
  readonly facets?: readonly FacetId[];
}

function storedTagged(tagged: TaggedFacets): StoredTagged {
  switch (tagged.pick) {
    case "one":
      return { facet: tagged.facet };
    case "many":
      return { facets: tagged.facets };
    default:
      return tagged satisfies never;
  }
}

/**
 * Each kind's settings as `plain`, switched off for the kinds that start off, and for the kinds
 * Valve states with their banner entry off and only Unsupported chosen, in `tagged`'s form.
 */
function kindsWith<T extends { readonly enabled: boolean; readonly banner: boolean; }, Tagged>(
  plain: T,
  tagged: (value: TaggedFacets) => Tagged,
): Readonly<Record<KindId, PlainKind<T, Tagged>>> {
  return perKind((kind): PlainKind<T, Tagged> => {
    const chosen = kind.defaults.tagged;
    if (isValveKind(kind.id) && chosen !== undefined) {
      return { ...plain, enabled: false, banner: false, ...tagged(chosen) };
    }
    if (BANNERLESS_KINDS.includes(kind.id)) {
      return { ...plain, banner: false };
    }
    return OFF_KINDS.includes(kind.id) ? { ...plain, enabled: false } : plain;
  });
}

/** Each kind's settings as `plain`, as `kindsWith` describes, the way the settings hold them. */
export function plainKinds<T extends { readonly enabled: boolean; readonly banner: boolean; }>(
  plain: T,
): Readonly<Record<KindId, PlainKind<T, { readonly tagged: TaggedFacets; }>>> {
  return kindsWith(plain, (tagged) => ({ tagged }));
}

/** The same, the way storage holds them. */
export function storedKinds<T extends { readonly enabled: boolean; readonly banner: boolean; }>(
  plain: T,
): Readonly<Record<KindId, PlainKind<T, StoredTagged>>> {
  return kindsWith(plain, storedTagged);
}

/** The settings with `patch` applied to one kind's settings. */
export function withKind(settings: Settings, id: KindId, patch: Partial<KindSettings>): Settings {
  return applyPatch(settings, { kinds: { [id]: patch } });
}

/** Every kind switched on over its defaults, with `patch`, then each kind's own `byKind` patch. */
export function switchedOnKinds(
  patch: Partial<KindSettings> = {},
  byKind: Partial<Record<KindId, Partial<KindSettings>>> = {},
): Readonly<Record<KindId, KindSettings>> {
  return perKind((kind) => ({ ...kind.defaults, enabled: true, ...patch, ...byKind[kind.id] }));
}

/** Writes the kinds' list filters on the root element as the app does, `off` for the rest. */
export function applyFilters(modes: Partial<Record<KindId, ListFilter>>): void {
  applyKindSettings(
    document.documentElement,
    perKind((kind) => ({ ...kind.defaults, enabled: true, filter: modes[kind.id] ?? "off" })),
  );
}

/** Stores exactly these settings, telling the source's subscribers, as another tab's save does. */
export function writeSettings(source: StoredSettings, settings: Settings): Promise<Settings> {
  return source.patch(wholePatch(settings));
}

/**
 * The mode that wins when several kinds match one host: hide over dim over off. The style rules
 * reach the same result without a function, because a hidden host ignores a dim and a host that
 * cannot hide dims for both, so tests use this as their oracle.
 */
export function strongestFilter(modes: Iterable<ListFilter>): ListFilter {
  let strongest: ListFilter = "off";
  for (const mode of modes) {
    if (LIST_FILTERS.indexOf(mode) > LIST_FILTERS.indexOf(strongest)) {
      strongest = mode;
    }
  }
  return strongest;
}
