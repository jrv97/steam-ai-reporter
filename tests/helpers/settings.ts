import type { KindId } from "../../src/core/kinds/id";
import type { KindSettings } from "../../src/core/kinds/kind-settings";
import { KINDS } from "../../src/core/kinds/registry";
import { applyPatch, type Settings, type SettingsPatch } from "../../src/core/settings/settings";
import type { StoredSettings } from "../../src/core/settings/settings-source";

/** The settings with `patch` applied to one kind's settings. */
export function withKind(settings: Settings, id: KindId, patch: Partial<KindSettings>): Settings {
  return applyPatch(settings, { kinds: { [id]: patch } });
}

/** A patch that names every field, so applying it sets the settings to exactly `settings`. */
function wholePatch(settings: Settings): SettingsPatch {
  return {
    locale: settings.locale,
    debug: settings.debug,
    kinds: Object.fromEntries(KINDS.map((kind) => [kind.id, settings.kinds[kind.id]])),
  };
}

/** Stores exactly these settings, telling the source's subscribers, as another tab's save does. */
export function writeSettings(source: StoredSettings, settings: Settings): Promise<Settings> {
  return source.patch(wholePatch(settings));
}
