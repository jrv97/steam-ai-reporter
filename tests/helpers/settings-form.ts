import { createIgnoreLists } from "../../src/core/ignored";
import type { KindId } from "../../src/core/kinds/id";
import { KIND_BY_ID } from "../../src/core/kinds/registry";
import { createSettingsSource } from "../../src/core/settings/settings-source";
import {
  mountSettingsForm,
  type SettingsForm,
  type SettingsFormDeps,
} from "../../src/core/ui/settings-form";
import type { TabId } from "../../src/core/ui/tab-id";
import { createUiState } from "../../src/core/ui/ui-state";
import { fixedClock } from "./fixed-clock";
import { englishI18n } from "./i18n";
import { memoryStore } from "./memory-store";

/** The deps of a full options page over stores of its own; `overrides` replaces any of them. */
export function formDeps(overrides: Partial<SettingsFormDeps> = {}): SettingsFormDeps {
  return {
    i18n: englishI18n(),
    settings: createSettingsSource(memoryStore()),
    lists: createIgnoreLists(memoryStore(), fixedClock(0)),
    uiState: createUiState(memoryStore()),
    context: "page",
    layout: "tabs",
    colors: true,
    locales: ["en"],
    ...overrides,
  };
}

/** What a test reads from a mounted form: its root, its tabs and panels, by id. */
export interface MountedForm {
  readonly root: HTMLElement;
  readonly form: SettingsForm;
  /** The tab button of a tab. */
  readonly tab: (id: TabId) => HTMLElement;
  /** The panel a tab controls. */
  readonly panel: (id: TabId) => HTMLElement;
  /** The tabs in the order they show. */
  readonly tabIds: () => readonly string[];
}

function found<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new TypeError(what);
  }
  return value;
}

/** Mounts a form into a new element in the document. */
export async function mountForm(overrides: Partial<SettingsFormDeps> = {}): Promise<MountedForm> {
  const root = document.createElement("main");
  document.body.append(root);
  const form = await mountSettingsForm(root, formDeps(overrides));
  const tab = (id: TabId): HTMLElement =>
    found(root.querySelector<HTMLElement>(`[role=tab][data-sar-tab="${id}"]`), id);
  return {
    root,
    form,
    tab,
    panel: (id) =>
      found(
        root.querySelector<HTMLElement>(`#${tab(id).getAttribute("aria-controls") ?? "x"}`),
        id,
      ),
    tabIds: () =>
      [...root.querySelectorAll("[role=tab]")].map((each) =>
        each.getAttribute("data-sar-tab") ?? ""
      ),
  };
}

/** Steam's line for a kind, which titles its settings. */
export function headingOf(id: KindId): string {
  return englishI18n().t(KIND_BY_ID[id].messages.heading);
}
