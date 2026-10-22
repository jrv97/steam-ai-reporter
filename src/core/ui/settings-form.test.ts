import { afterEach, describe, expect, it, vi } from "vitest";
import { fixedClock } from "../../../tests/helpers/fixed-clock";
import { englishI18n } from "../../../tests/helpers/i18n";
import { memoryStore } from "../../../tests/helpers/memory-store";
import { createAllowList } from "../settings/allow-list";
import { DEFAULT_SETTINGS } from "../settings/settings";
import { createSettingsSource } from "../settings/settings-source";
import { toAppId } from "../types";
import { mountSettingsForm, type SettingsContext } from "./settings-form";

const DAY = 86_400_000;

function isEventTarget(value: object): value is EventTarget {
  return "addEventListener" in value;
}

function appId(value: number) {
  const id = toAppId(value);
  if (id === undefined) {
    throw new TypeError();
  }
  return id;
}

async function setup(context: SettingsContext = "page") {
  const clock = fixedClock(Date.UTC(2026, 9, 1));
  const settings = createSettingsSource(memoryStore());
  const allowList = createAllowList(memoryStore(), clock);
  await allowList.add(appId(10), "Older Game");
  clock.advance(DAY);
  await allowList.add(appId(20), "Newer <b>Game</b>");
  const root = document.createElement("main");
  document.body.append(root);
  const form = await mountSettingsForm(root, {
    i18n: englishI18n(),
    settings,
    allowList,
    context,
    locales: ["en", "es"],
  });
  const control = (selector: string): HTMLElement => {
    const found = root.querySelector<HTMLElement>(selector);
    if (found === null) {
      throw new TypeError(selector);
    }
    return found;
  };
  const input = (selector: string): HTMLInputElement => {
    const found = control(selector);
    if (!(found instanceof HTMLInputElement)) {
      throw new TypeError(selector);
    }
    return found;
  };
  return { root, form, settings, allowList, control, input };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("mountSettingsForm", () => {
  it("shows the stored settings and the allow-list, newest first", async () => {
    const { root, control, input } = await setup();
    expect(root.classList.contains("sar-options")).toBe(true);
    expect(input("[data-sar-setting=badges]").checked).toBe(true);
    expect(input("input[value=off]").checked).toBe(true);
    expect(control(".sar-segment ~ .sar-field-help").textContent).toBe(
      "Lists stay as they are, apart from badges.",
    );
    const names = [...root.querySelectorAll(".sar-allow-name")].map((name) => name.textContent);
    expect(names).toEqual(["Newer <b>Game</b>", "Older Game"]);
    expect(root.querySelector(".sar-allow-name b")).toBeNull();
    expect(control(".sar-allow-name").getAttribute("href")).toBe(
      "https://store.steampowered.com/app/20/",
    );
    expect(control(".sar-allow-meta").textContent).toBe("Since Oct 2, 2026");
    expect(control(".sar-allow-item button").getAttribute("aria-label")).toBe(
      "Mark Newer <b>Game</b> again",
    );
  });

  it("names the badge label in the badges help", async () => {
    const { root } = await setup();
    expect(root.textContent).toContain(
      'Adds "AI use reported" to search and wishlist rows and to game images.',
    );
  });

  it("says that it sends no reports", async () => {
    const page = await setup("page");
    expect(page.root.textContent).toContain(
      "Sends no reports. It only reads what developers report on Steam.",
    );
    document.body.replaceChildren();
    const popup = await setup("popup");
    expect(popup.root.textContent).toContain("Sends no reports.");
    expect(popup.root.querySelector("select")).toBeNull();
  });

  it("renders the product header and the popup's link to all settings when given", async () => {
    const root = document.createElement("main");
    document.body.append(root);
    await mountSettingsForm(root, {
      i18n: englishI18n(),
      settings: createSettingsSource(memoryStore()),
      allowList: createAllowList(memoryStore(), fixedClock(0)),
      context: "popup",
      locales: ["en"],
      header: { version: "2026.10.20", iconUrl: "icons/icon-32.png" },
      allSettingsUrl: "options.html",
    });
    const header = root.firstElementChild;
    expect(header?.matches("header.sar-options-header")).toBe(true);
    expect(header?.querySelector("h1")?.textContent).toBe("AI Reporter for Steam");
    expect(header?.querySelector(".sar-options-version")?.textContent).toBe("Version 2026.10.20");
    expect(header?.querySelector("img")?.getAttribute("src")).toBe("icons/icon-32.png");
    expect(header?.querySelector("img")?.getAttribute("alt")).toBe("");
    const link = root.querySelector(".sar-options-footer a");
    expect(link?.textContent).toBe("All settings");
    expect(link?.getAttribute("href")).toBe("options.html");
    expect(link?.getAttribute("target")).toBe("_blank");
  });

  it("renders no header or link by default", async () => {
    const { root } = await setup("popup");
    expect(root.querySelector(".sar-options-header")).toBeNull();
    expect(root.querySelector(".sar-options-footer a")).toBeNull();
  });

  it("names each language in itself", async () => {
    const { root } = await setup();
    const options = [...root.querySelectorAll("option")].map((option) => option.value);
    expect(options).toEqual(["auto", "en", "es"]);
    expect(root.querySelector("option[value=es]")?.getAttribute("lang")).toBe("es");
  });

  it("applies a change at once and announces it", async () => {
    const { settings, control, input } = await setup();
    const dim = input("input[value=dim]");
    dim.checked = true;
    dim.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(async () => {
      expect(await settings.read()).toMatchObject({ listFilter: "dim" });
    });
    expect(control("[aria-live]").textContent).toBe("Saved.");
    expect(control(".sar-segment ~ .sar-field-help").textContent).toBe(
      "Fades these games in lists. Hover to see one clearly.",
    );
  });

  it("reverts the control and shows an error when a change cannot be saved", async () => {
    const { settings, input } = await setup();
    vi.spyOn(settings, "write").mockRejectedValue(new Error());
    const badges = input("[data-sar-setting=badges]");
    badges.checked = false;
    badges.dispatchEvent(new Event("change", { bubbles: true }));
    const error = badges.parentElement?.querySelector<HTMLElement>(".sar-field-error");
    await vi.waitFor(() => {
      expect(error?.hidden).toBe(false);
    });
    expect(badges.checked).toBe(true);
    expect(error?.textContent).toBe("Could not save this change. Try again.");
  });

  it("follows changes from other tabs", async () => {
    const { settings, input } = await setup();
    await settings.write({ ...DEFAULT_SETTINGS, banner: false });
    expect(input("[data-sar-setting=banner]").checked).toBe(false);
  });

  it("marks a game again and moves focus to the next one", async () => {
    const { root, allowList, control } = await setup();
    control('[data-sar-restore="20"]').click();
    await vi.waitFor(() => {
      expect(root.querySelectorAll(".sar-allow-item")).toHaveLength(1);
    });
    expect([...(await allowList.list()).keys()]).toEqual([10]);
    expect(document.activeElement).toBe(control('[data-sar-restore="10"]'));
    expect(control("[aria-live]").textContent).toBe("Marking restored for this game.");
  });

  it("shows the empty state with the action's own label", async () => {
    const { root, control } = await setup();
    control('[data-sar-restore="20"]').click();
    await vi.waitFor(() => {
      expect(root.querySelectorAll(".sar-allow-item")).toHaveLength(1);
    });
    control('[data-sar-restore="10"]').click();
    await vi.waitFor(() => {
      expect(control(".sar-empty").textContent).toBe(
        'None yet. Use "Stop marking this game" on a game page.',
      );
    });
  });

  it("leaves an empty allow-list out of the popup and moves focus above it", async () => {
    const { root, control } = await setup("popup");
    const section = control(".sar-allow-list").closest<HTMLElement>("section");
    expect(section?.hidden).toBe(false);
    control('[data-sar-restore="20"]').click();
    await vi.waitFor(() => {
      expect(root.querySelectorAll(".sar-allow-item")).toHaveLength(1);
    });
    control('[data-sar-restore="10"]').click();
    await vi.waitFor(() => {
      expect(section?.hidden).toBe(true);
    });
    expect(document.activeElement?.textContent).toBe("In lists");
  });

  it("keeps the empty state on the full page", async () => {
    const { root, control } = await setup();
    control('[data-sar-restore="20"]').click();
    await vi.waitFor(() => {
      expect(root.querySelectorAll(".sar-allow-item")).toHaveLength(1);
    });
    control('[data-sar-restore="10"]').click();
    await vi.waitFor(() => {
      expect(control(".sar-empty").closest<HTMLElement>("section")?.hidden).toBe(false);
    });
  });

  it("keeps a game and shows an error when marking it again fails", async () => {
    const { allowList, control } = await setup();
    vi.spyOn(allowList, "remove").mockRejectedValue(new Error());
    const button = control('[data-sar-restore="20"]');
    button.click();
    const error = button.parentElement?.querySelector<HTMLElement>(".sar-field-error");
    await vi.waitFor(() => {
      expect(error?.hidden).toBe(false);
    });
    expect(error?.textContent).toBe("Could not update this game. Try again.");
  });

  it("shows the defaults and an error when the settings cannot be read", async () => {
    const settings = createSettingsSource(memoryStore());
    vi.spyOn(settings, "read").mockRejectedValue(new Error());
    const root = document.createElement("main");
    await mountSettingsForm(root, {
      i18n: englishI18n(),
      settings,
      allowList: createAllowList(memoryStore(), fixedClock(0)),
      context: "page",
      locales: ["en"],
    });
    const error = root.querySelector<HTMLElement>(".sar-card .sar-field-error");
    expect(error?.hidden).toBe(false);
    expect(error?.textContent).toBe("Could not load your settings. Showing the defaults.");
    expect(root.querySelector<HTMLInputElement>("[data-sar-setting=banner]")?.checked).toBe(true);
  });

  it("listens on the root only, with no per-control listeners", async () => {
    // happy-dom defines addEventListener on its own prototype; spy where it actually lives.
    let owner = Reflect.getPrototypeOf(document.createElement("div"));
    while (owner !== null && !Object.hasOwn(owner, "addEventListener")) {
      owner = Reflect.getPrototypeOf(owner);
    }
    if (owner === null || !isEventTarget(owner)) {
      throw new TypeError();
    }
    const add = vi.spyOn(owner, "addEventListener");
    const { root, form } = await setup();
    const targets = new Set(add.mock.contexts);
    expect(targets).toEqual(new Set([root]));
    form.destroy();
    expect(root.childElementCount).toBe(0);
  });
});
