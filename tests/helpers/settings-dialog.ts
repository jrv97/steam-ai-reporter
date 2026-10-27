import { SHIPPED_CATALOGS } from "../../src/core/i18n/shipped";
import { createI18n } from "../../src/core/i18n/t";
import { createIgnoreLists } from "../../src/core/ignored";
import { createSettingsSource } from "../../src/core/settings/settings-source";
import { createUiState } from "../../src/core/ui/ui-state";
import type { SettingsDialogDeps } from "../../src/platform/userscript/settings-dialog";
import { fixedClock } from "./fixed-clock";
import { memoryStore } from "./memory-store";

const NOW = Date.UTC(2026, 9, 20);

/** The deps of the userscript settings dialog in English over a store of its own. */
export function dialogDeps(live = true, store = memoryStore()): SettingsDialogDeps {
  return {
    document,
    i18n: createI18n(SHIPPED_CATALOGS, "en"),
    catalogs: SHIPPED_CATALOGS,
    settings: createSettingsSource(store),
    lists: createIgnoreLists(store, fixedClock(NOW)),
    uiState: createUiState(store),
    clock: fixedClock(NOW),
    live,
  };
}
