import * as v from "valibot";
import {
  CHIP_TEXT_SCHEMAS,
  type ChipText,
  type ChipTextField,
} from "../../src/core/kinds/chip-text";
import { type HexColor, HexColorSchema } from "../../src/core/kinds/color";
import type { KindId } from "../../src/core/kinds/id";
import type { FacetId } from "../../src/core/kinds/kind";
import {
  type KindSettings,
  LIST_FILTERS,
  type ListFilter,
} from "../../src/core/kinds/kind-settings";
import { perKind } from "../../src/core/kinds/registry";
import { applyPatch, type Settings, wholePatch } from "../../src/core/settings/settings";
import type { StoredSettings } from "../../src/core/settings/settings-source";
import { applyKindSettings } from "../../src/core/ui/kind-attributes";

/** The text as a tag color; throws when it is not one, so a typo fails the test. */
export function hexColor(text: string): HexColor {
  return v.parse(HexColorSchema, text);
}

/** The text as a person's chip text for a field; throws when nothing is left of it. */
export function chipText(text: string, field: ChipTextField = "chip"): ChipText {
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

/** Valve's device ratings, each with Steam's three rating words. */
export const STATUS_KINDS = ["deck", "machine"] as const;

/** The kinds Valve states: they start off, with no banner entry and only Unsupported tagged. */
export const VALVE_KINDS = [...STATUS_KINDS, "family"] as const;

export type ValveKind = (typeof VALVE_KINDS)[number];

export function isValveKind(id: KindId): id is ValveKind {
  return VALVE_KINDS.some((kind) => kind === id);
}

/** One kind's settings as `plainKinds` gives them. */
export type PlainKind<T> = Omit<T, "enabled" | "banner"> & {
  readonly enabled: boolean;
  readonly banner: boolean;
  readonly facets?: readonly FacetId[];
};

/**
 * Each kind's settings as `plain`, switched off for the kinds that start off, and for the kinds
 * Valve states with their banner entry off and only Unsupported chosen.
 */
export function plainKinds<T extends { readonly enabled: boolean; readonly banner: boolean; }>(
  plain: T,
): Readonly<Record<KindId, PlainKind<T>>> {
  return perKind((kind) => {
    if (isValveKind(kind.id)) {
      return { ...plain, enabled: false, banner: false, facets: ["unsupported"] };
    }
    return OFF_KINDS.includes(kind.id) ? { ...plain, enabled: false } : plain;
  });
}

/** The settings with `patch` applied to one kind's settings. */
export function withKind(settings: Settings, id: KindId, patch: Partial<KindSettings>): Settings {
  return applyPatch(settings, { kinds: { [id]: patch } });
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
