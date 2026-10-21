import { afterEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../../tests/helpers/fixed-clock";
import { memoryStore } from "../../../tests/helpers/memory-store";
import { SHIPPED_CATALOGS } from "../../core/i18n/shipped";
import { createI18n } from "../../core/i18n/t";
import { createAllowList } from "../../core/settings/allow-list";
import { createSettingsSource } from "../../core/settings/settings-source";
import { openSettingsDialog, type SettingsDialogDeps } from "./settings-dialog";

function deps(live: boolean): SettingsDialogDeps {
  const store = memoryStore();
  return {
    document,
    i18n: createI18n(SHIPPED_CATALOGS, "en"),
    catalogs: SHIPPED_CATALOGS,
    settings: createSettingsSource(store),
    allowList: createAllowList(store, fixedClock(Date.UTC(2026, 9, 20))),
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
    expect(dialog()?.querySelector(".sar-dialog-title")?.textContent).toBe("AI Reporter for Steam");
    expect(dialog()?.querySelector("[data-sar-setting='badges']")).not.toBeNull();
    expect(document.querySelector("[data-sar-setting='badges']")).toBeNull();
  });

  it("opens only one dialog", async () => {
    await openSettingsDialog(deps(true));
    await openSettingsDialog(deps(true));

    expect(document.querySelectorAll(".sar-dialog-host")).toHaveLength(1);
  });

  it("closes with the Close button, removes itself and returns focus", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    await openSettingsDialog(deps(true));

    const close = dialog()?.querySelector<HTMLElement>("[data-sar-close]");
    expect(close?.textContent).toBe("Close");
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
      "Changes apply on the next page load.",
    );
    host()?.remove();

    await openSettingsDialog(deps(true));
    expect(dialog()?.querySelector(".sar-dialog-note")).toBeNull();
  });
});
