import { afterEach, describe, expect, it, vi } from "vitest";
import { fixedClock } from "../../../tests/helpers/fixed-clock";
import { memoryStore } from "../../../tests/helpers/memory-store";
import { SHIPPED_CATALOGS } from "../../core/i18n/shipped";
import { createI18n } from "../../core/i18n/t";
import { KINDS } from "../../core/kinds/registry";
import { createAllowList } from "../../core/settings/allow-list";
import { parseSettings } from "../../core/settings/settings";
import { createSettingsSource } from "../../core/settings/settings-source";
import { createSectionState } from "../../core/ui/section-state";
import { openSettingsDialog, type SettingsDialogDeps } from "./settings-dialog";

const i18n = createI18n(SHIPPED_CATALOGS, "en");

function deps(live: boolean, store = memoryStore()): SettingsDialogDeps {
  return {
    document,
    i18n,
    catalogs: SHIPPED_CATALOGS,
    settings: createSettingsSource(store),
    allowList: createAllowList(store, fixedClock(Date.UTC(2026, 9, 20))),
    sectionState: createSectionState(store),
    live,
  };
}

const host = () => document.querySelector(".sar-dialog-host");
const dialog = () => host()?.shadowRoot?.querySelector("dialog") ?? null;

afterEach(() => {
  host()?.remove();
  document.body.replaceChildren();
});

describe("openSettingsDialog", () => {
  it("opens a modal dialog titled with the product name, in a shadow root", async () => {
    await openSettingsDialog(deps(true));

    expect(dialog()?.open).toBe(true);
    expect(dialog()?.querySelector(".sar-dialog-title")?.textContent).toBe(i18n.t("ext_name"));
    expect(dialog()?.querySelector("[data-sar-setting='badge']")).not.toBeNull();
    expect(document.querySelector("[data-sar-setting='badge']")).toBeNull();
  });

  it("shows a color field for each tag, which the toolbar popup does not", async () => {
    await openSettingsDialog(deps(true));

    const fields = dialog()?.querySelectorAll("[data-sar-setting='color']") ?? [];
    expect(fields).toHaveLength(KINDS.length);
    const label = dialog()?.querySelector(`label[for="${fields[0]?.id}"]`);
    expect(label?.textContent).toBe(i18n.t("options_color_label"));
    expect(dialog()?.querySelector(".sar-options")?.getAttribute("data-sar-context")).toBe("popup");
  });

  it("saves a typed color and applies it inside the dialog", async () => {
    const store = memoryStore();
    await openSettingsDialog(deps(true, store));

    const field = dialog()?.querySelector<HTMLInputElement>("[data-sar-setting='color']");
    if (field === null || field === undefined) {
      throw new TypeError();
    }
    field.value = "0F0";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => {
      expect(field.value).toBe("#00ff00");
    });
    const form = dialog()?.querySelector<HTMLElement>(".sar-options");
    expect(form?.style.getPropertyValue("--sar-kind-color-ai")).toBe("#00ff00");
    const stored = parseSettings(await createSettingsSource(store).read());
    expect(stored.kinds.ai.color).toBe("#00ff00");
  });

  it("opens only one dialog", async () => {
    await openSettingsDialog(deps(true));
    await openSettingsDialog(deps(true));

    expect(document.querySelectorAll(".sar-dialog-host")).toHaveLength(1);
  });

  it("closes with its close button, removes itself and returns focus", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    await openSettingsDialog(deps(true));

    const close = dialog()?.querySelector<HTMLElement>("[data-sar-close]");
    expect(close?.textContent).toBe(i18n.t("userscript_close"));
    close?.click();

    expect(host()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("closes on a click on the backdrop", async () => {
    await openSettingsDialog(deps(true));
    dialog()?.click();

    expect(host()).toBeNull();
  });

  it("notes that changes apply on reload only where they cannot apply live", async () => {
    await openSettingsDialog(deps(false));
    expect(dialog()?.querySelector(".sar-dialog-note")?.textContent).toBe(
      i18n.t("userscript_reload_note"),
    );
    host()?.remove();

    await openSettingsDialog(deps(true));
    expect(dialog()?.querySelector(".sar-dialog-note")).toBeNull();
  });
});
