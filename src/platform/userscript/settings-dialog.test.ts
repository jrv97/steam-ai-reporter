import { afterEach, describe, expect, it, vi } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { englishI18n } from "../../../tests/helpers/i18n";
import { dialogDeps as deps } from "../../../tests/helpers/settings-dialog";
import { KINDS } from "../../core/kinds/registry";
import { parseSettings } from "../../core/settings/settings";
import { createSettingsSource } from "../../core/settings/settings-source";
import { createUiState } from "../../core/ui/ui-state";
import { openSettingsDialog } from "./settings-dialog";

const i18n = englishI18n();

const host = () => document.querySelector(".tks-dialog-host");
const dialog = () => host()?.shadowRoot?.querySelector("dialog") ?? null;

afterEach(() => {
  host()?.remove();
  document.body.replaceChildren();
});

describe("openSettingsDialog", () => {
  it("opens a modal dialog titled with the product name, in a shadow root", async () => {
    await openSettingsDialog(deps(true));

    expect(dialog()?.open).toBe(true);
    expect(dialog()?.querySelector(".tks-dialog-title")?.textContent).toBe(i18n.t("ext_name"));
    expect(dialog()?.querySelector("[data-tks-setting='badge']")).not.toBeNull();
    expect(document.querySelector("[data-tks-setting='badge']")).toBeNull();
  });

  it("has the Backup card, whose file input stays inside the modal dialog", async () => {
    await openSettingsDialog(deps(true));

    const buttons = [...(dialog()?.querySelectorAll("button") ?? [])];
    buttons.find((button) => button.textContent === i18n.t("options_backup_restore"))?.click();
    expect(dialog()?.querySelector("input[type='file']")).not.toBeNull();
  });

  it("shows a color field for each tag, which the toolbar popup does not", async () => {
    await openSettingsDialog(deps(true));

    const fields = dialog()?.querySelectorAll("[data-tks-setting='color']") ?? [];
    expect(fields).toHaveLength(KINDS.length);
    const label = dialog()?.querySelector(`label[for="${fields[0]?.id}"]`);
    expect(label?.textContent).toBe(i18n.t("options_color_label"));
    expect(dialog()?.querySelector(".tks-options")?.getAttribute("data-tks-context")).toBe("popup");
  });

  it("saves a typed color and applies it inside the dialog", async () => {
    const store = fake.store();
    await openSettingsDialog(deps(true, store));

    const field = dialog()?.querySelector<HTMLInputElement>(
      "[data-tks-setting='color'][data-tks-for='ai']",
    );
    if (field === null || field === undefined) {
      throw new TypeError();
    }
    const color = make.color();
    // Typed without the hash and in capitals; the saved value comes back in normal form
    field.value = color.slice(1).toUpperCase();
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => {
      expect(field.value).toBe(color);
    });
    const form = dialog()?.querySelector<HTMLElement>(".tks-options");
    expect(form?.style.getPropertyValue("--tks-kind-color-ai")).toBe(color);
    const stored = parseSettings(await createSettingsSource(store).read());
    expect(stored.kinds.ai.color).toBe(color);
  });

  it("has the language picker in General, and its tabs keep the store's address", async () => {
    const store = fake.store();
    await openSettingsDialog(deps(true, store));

    const general = dialog()?.querySelector("[role=tabpanel]:not([hidden])");
    expect(general?.querySelector("select[data-tks-setting='locale']")).not.toBeNull();
    const before = location.href;
    dialog()?.querySelector<HTMLElement>("[role=tab][data-tks-tab='drm']")?.click();
    expect(location.href).toBe(before);
    await vi.waitFor(async () => {
      expect(await createUiState(store).read()).toBe("drm");
    });
  });

  it("opens only one dialog", async () => {
    await openSettingsDialog(deps(true));
    await openSettingsDialog(deps(true));

    expect(document.querySelectorAll(".tks-dialog-host")).toHaveLength(1);
  });

  it("closes with its close button, removes itself and returns focus", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    await openSettingsDialog(deps(true));

    const close = dialog()?.querySelector<HTMLElement>("[data-tks-close]");
    expect(close?.textContent).toBe(i18n.t("userscript_close"));
    close?.click();

    expect(host()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("follows the page's load progress above the tabs until it closes", async () => {
    const progress = fake.progressSource();
    await openSettingsDialog({ ...deps(true), progress });
    progress.send(make.progress());

    const options = dialog()?.querySelector(".tks-options");
    const strip = options?.querySelector(".tks-load");
    expect(strip?.getAttribute("data-tks-load")).toBe("loading");
    expect(strip?.nextElementSibling?.matches(".tks-field-error")).toBe(true);
    dialog()?.close();
    expect(progress.listening).toBe(0);
  });

  it("closes on a click on the backdrop", async () => {
    await openSettingsDialog(deps(true));
    dialog()?.click();

    expect(host()).toBeNull();
  });

  it.each([
    [false, i18n.t("userscript_reload_note")],
    [true, undefined],
  ])("with live changes %s, notes %j about applying on reload", async (live, note) => {
    await openSettingsDialog(deps(live));
    expect(dialog()?.open).toBe(true);
    expect(dialog()?.querySelector(".tks-dialog-note")?.textContent).toBe(note);
  });
});
