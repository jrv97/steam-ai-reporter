import type { KindId } from "../../src/core/kinds/id";
import {
  type KindSettings,
  LIST_FILTERS,
  type ListFilter,
} from "../../src/core/kinds/kind-settings";
import { KINDS, perKind } from "../../src/core/kinds/registry";
import { applyPatch, type Settings, type SettingsPatch } from "../../src/core/settings/settings";
import type { StoredSettings } from "../../src/core/settings/settings-source";
import { applyKindSettings } from "../../src/core/ui/kind-attributes";

/** The settings with `patch` applied to one kind's settings. */
export function withKind(settings: Settings, id: KindId, patch: Partial<KindSettings>): Settings {
  return applyPatch(settings, { kinds: { [id]: patch } });
}

/**
 * A patch that names every field, so applying it sets the settings to exactly `settings`. An unset
 * color is named as `undefined`, which clears a stored one.
 */
function wholePatch(settings: Settings): SettingsPatch {
  return {
    locale: settings.locale,
    debug: settings.debug,
    kinds: Object.fromEntries(
      KINDS.map((kind) => {
        const own = settings.kinds[kind.id];
        return [kind.id, { ...own, color: own.color }];
      }),
    ),
  };
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
