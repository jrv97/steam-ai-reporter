import { afterEach, describe, expect, it, vi } from "vitest";
import { countingStore } from "../../../tests/helpers/counting-store";
import { keyOf } from "../../../tests/helpers/creators";
import { fixedClock } from "../../../tests/helpers/fixed-clock";
import { englishI18n } from "../../../tests/helpers/i18n";
import { memoryStore } from "../../../tests/helpers/memory-store";
import {
  isValveKind,
  OFF_KINDS,
  STATUS_KINDS,
  withKind,
  writeSettings,
} from "../../../tests/helpers/settings";
import { CREATOR_ROLES } from "../creator";
import { SHIPPED_CATALOGS } from "../i18n/shipped";
import { createI18n } from "../i18n/t";
import { createIgnoreLists } from "../ignored";
import { toHexColor } from "../kinds/color";
import type { KindId } from "../kinds/id";
import { LIST_FILTERS } from "../kinds/kind-settings";
import { KIND_BY_ID, KINDS } from "../kinds/registry";
import type { KeyValueStore } from "../ports";
import { ALLOW_ALL } from "../settings/allow-data";
import { DEFAULT_SETTINGS, parseSettings } from "../settings/settings";
import { createSettingsSource } from "../settings/settings-source";
import { SECTION_STATE_KEY } from "../storage-keys";
import { toAppId } from "../types";
import { createSectionState, isSectionOpen, type SectionState } from "./section-state";
import { mountSettingsForm, type SettingsContext } from "./settings-form";

const DAY = 86_400_000;
const i18n = englishI18n();
const heading = (id: KindId) => i18n.t(KIND_BY_ID[id].messages.heading);

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

/** Fires the change event a user's click on the control would. */
function change(control: Element): void {
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

/** A form on a store of its own, with the games the tests ignore already listed. */
async function setup(
  context: SettingsContext = "page",
  sectionStore: KeyValueStore = memoryStore(),
  sectionState: SectionState = createSectionState(sectionStore),
  colors: boolean = context === "page",
) {
  const clock = fixedClock(Date.UTC(2026, 9, 1));
  const store = memoryStore();
  const settings = createSettingsSource(store);
  const lists = createIgnoreLists(memoryStore(), clock);
  const allowList = lists.games;
  await allowList.add("ai", appId(10), "Older Game");
  clock.advance(DAY);
  await allowList.add("ai", appId(20), "Newer <b>Game</b>");
  clock.advance(DAY);
  await allowList.add("drm", appId(30), "Drm Game");
  await allowList.add(ALLOW_ALL, appId(40), "Every Game");
  await allowList.add("kernel", appId(10), "Older Game");
  const root = document.createElement("main");
  document.body.append(root);
  const form = await mountSettingsForm(root, {
    i18n,
    settings,
    lists,
    sectionState,
    context,
    colors,
    locales: ["en", "es"],
  });
  const control = (selector: string): HTMLElement => {
    const found = root.querySelector<HTMLElement>(selector);
    if (found === null) {
      throw new TypeError(selector);
    }
    return found;
  };
  const card = (id: KindId): HTMLElement => {
    const found = [...root.querySelectorAll<HTMLElement>("section.sar-card")].find((section) =>
      section.querySelector(".sar-card-title")?.textContent === heading(id)
    );
    if (found === undefined) {
      throw new TypeError(id);
    }
    return found;
  };
  const input = (id: KindId, field: string, value?: string): HTMLInputElement => {
    const suffix = value === undefined ? "" : `[value=${value}]`;
    const found = card(id).querySelector<HTMLInputElement>(`[data-sar-setting=${field}]${suffix}`);
    if (found === null) {
      throw new TypeError([id, field].join(" "));
    }
    return found;
  };
  const select = (): HTMLSelectElement => {
    const found = control("select");
    if (!(found instanceof HTMLSelectElement)) {
      throw new TypeError();
    }
    return found;
  };
  return {
    root,
    form,
    settings,
    lists,
    allowList,
    store,
    sectionStore,
    sectionState,
    control,
    card,
    input,
    select,
  };
}

/** The titles of the tag sections, which sit in the summary of each. */
function kindTitles(root: HTMLElement): (string | null)[] {
  return [...root.querySelectorAll(".sar-card-summary > .sar-card-title")].map((title) =>
    title.textContent
  );
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the section of each tag", () => {
  it("has one section per kind, in registry order, titled with Steam's line", async () => {
    const { root } = await setup();
    const titles = kindTitles(root);
    expect(titles.slice(0, KINDS.length)).toEqual(KINDS.map((kind) => heading(kind.id)));
    expect(titles.slice(0, 2)).toEqual([i18n.t("kind_ai_heading"), i18n.t("kind_kernel_heading")]);
  });

  it("holds a master switch, a badge, a banner entry, a color and a filter in each", async () => {
    const { card } = await setup();
    for (const kind of KINDS) {
      const section = card(kind.id);
      const settings = [...section.querySelectorAll("[data-sar-setting]")].map((control) =>
        control.getAttribute("data-sar-setting")
      );
      const facets = (kind.facets ?? []).map(() => "facets");
      expect(settings).toEqual([
        "enabled",
        ...facets,
        "badge",
        "banner",
        "color",
        "filter",
        "filter",
        "filter",
      ]);
      expect(
        [...section.querySelectorAll("[data-sar-setting]")].every((control) =>
          control.getAttribute("data-sar-for") === kind.id
        ),
      ).toBe(true);
    }
  });

  it("shows the defaults: on but the kinds that start off, badge on, list untouched", async () => {
    const { input } = await setup();
    for (const kind of KINDS) {
      expect(input(kind.id, "enabled").checked).toBe(!OFF_KINDS.includes(kind.id));
      expect(input(kind.id, "badge").checked).toBe(true);
      expect(input(kind.id, "banner").checked).toBe(!isValveKind(kind.id));
      expect(input(kind.id, "filter", "off").checked).toBe(true);
    }
  });

  it.each(STATUS_KINDS)(
    "gives %s a labelled group of its values in Steam's words, Unsupported ticked",
    async (id) => {
      const { card, root } = await setup();
      const group = card(id).querySelector("fieldset.sar-checks");
      const label = root.querySelector(`#${group?.getAttribute("aria-labelledby") ?? "x"}`);
      expect(label?.textContent).toBe(i18n.t("options_facets_label"));
      const boxes = [...(group?.querySelectorAll("input") ?? [])];
      expect(boxes.map((box) => box.closest("label")?.textContent)).toEqual([
        i18n.t("kind_compat_verified"),
        i18n.t("kind_compat_playable"),
        i18n.t("kind_compat_unsupported"),
      ]);
      expect(boxes.map((box) => box.checked)).toEqual([false, false, true]);
    },
  );

  it("saves the ticked values in the kind's order, and none when all are unticked", async () => {
    const { input, settings } = await setup();
    const box = (value: string) => input("deck", "facets", value);
    box("verified").checked = true;
    change(box("verified"));
    await vi.waitFor(async () => {
      expect(parseSettings(await settings.read()).kinds.deck.facets).toEqual([
        "verified",
        "unsupported",
      ]);
    });
    for (const value of ["verified", "unsupported"]) {
      box(value).checked = false;
      change(box(value));
    }
    await vi.waitFor(async () => {
      expect(parseSettings(await settings.read()).kinds.deck.facets).toEqual([]);
    });
    expect(parseSettings(await settings.read()).kinds.machine.facets).toEqual(["unsupported"]);
  });

  it("shows the settings stored for each kind", async () => {
    const { settings, input } = await setup();
    await writeSettings(settings, {
      ...DEFAULT_SETTINGS,
      kinds: {
        ...DEFAULT_SETTINGS.kinds,
        kernel: { enabled: true, badge: false, banner: true, filter: "dim" },
        pvp: { enabled: false, badge: true, banner: false, filter: "hide" },
      },
    });
    expect(input("kernel", "badge").checked).toBe(false);
    expect(input("kernel", "filter", "dim").checked).toBe(true);
    expect(input("pvp", "enabled").checked).toBe(false);
    expect(input("pvp", "banner").checked).toBe(false);
    expect(input("pvp", "filter", "hide").checked).toBe(true);
    expect(input("ai", "badge").checked).toBe(true);
  });

  it("names the chip of the kind in the badge help", async () => {
    const { card } = await setup();
    for (const kind of KINDS) {
      expect(card(kind.id).textContent).toContain(
        i18n.t("options_badges_help", { label: i18n.t(kind.messages.chip) }),
      );
    }
  });

  it("hides the other controls of a kind while its master switch is off", async () => {
    const { settings, card, input } = await setup();
    const options = () => card("drm").querySelector<HTMLElement>(".sar-kind-options");
    expect(options()?.hidden).toBe(false);
    await settings.patch({ kinds: { drm: { enabled: false, badge: false } } });
    expect(options()?.hidden).toBe(true);
    expect(options()?.contains(input("drm", "badge"))).toBe(true);
    expect(card("drm").contains(input("drm", "enabled"))).toBe(true);
    expect(input("drm", "enabled").closest(".sar-kind-options")).toBeNull();
    expect(card("account").querySelector<HTMLElement>(".sar-kind-options")?.hidden).toBe(false);
    await settings.patch({ kinds: { drm: { enabled: true } } });
    expect(options()?.hidden).toBe(false);
    expect(input("drm", "badge").checked).toBe(false);
  });

  it("keeps PvP off and its controls hidden until the player turns it on", async () => {
    const { settings, card, input } = await setup();
    const options = () => card("pvp").querySelector<HTMLElement>(".sar-kind-options");
    expect(input("pvp", "enabled").checked).toBe(false);
    expect(options()?.hidden).toBe(true);
    const master = input("pvp", "enabled");
    master.checked = true;
    change(master);
    await vi.waitFor(async () => {
      expect(parseSettings(await settings.read()).kinds.pvp).toStrictEqual({
        enabled: true,
        badge: true,
        banner: true,
        filter: "off",
      });
    });
    expect(options()?.hidden).toBe(false);
    expect(parseSettings(await settings.read()).kinds.drm.enabled).toBe(true);
  });

  it("turns a kind off from its master switch and keeps its other settings", async () => {
    const { settings, input } = await setup();
    await settings.patch({ kinds: { eula: { filter: "dim" } } });
    const master = input("eula", "enabled");
    master.checked = false;
    change(master);
    await vi.waitFor(async () => {
      expect(parseSettings(await settings.read()).kinds.eula.enabled).toBe(false);
    });
    expect(parseSettings(await settings.read()).kinds.eula).toStrictEqual({
      enabled: false,
      badge: true,
      banner: true,
      filter: "dim",
    });
  });
});

describe("changing a setting", () => {
  it("applies the change of one kind at once and announces it", async () => {
    const { settings, control, input } = await setup();
    const dim = input("kernel", "filter", "dim");
    dim.checked = true;
    change(dim);
    await vi.waitFor(async () => {
      expect(parseSettings(await settings.read()).kinds.kernel.filter).toBe("dim");
    });
    await vi.waitFor(() => {
      expect(control("[aria-live]").textContent).toBe(i18n.t("notice_settings_saved"));
    });
    expect(
      input("kernel", "filter", "dim").closest(".sar-field")?.querySelector(".sar-field-help")
        ?.textContent,
    ).toBe(i18n.t("options_filter_dim_help"));
  });

  it.each(["badge", "banner"] as const)("flips the %s of one kind and no other", async (field) => {
    const { settings, input } = await setup();
    const switchInput = input("account", field);
    switchInput.checked = false;
    change(switchInput);
    await vi.waitFor(async () => {
      expect(parseSettings(await settings.read())).toStrictEqual(
        withKind(DEFAULT_SETTINGS, "account", { [field]: false }),
      );
    });
  });

  it("keeps the other settings of the stored value", async () => {
    const { settings, input } = await setup();
    await writeSettings(settings, { ...DEFAULT_SETTINGS, locale: "es", debug: true });
    const banner = input("ai", "banner");
    banner.checked = false;
    change(banner);
    await vi.waitFor(async () => {
      expect(parseSettings(await settings.read())).toStrictEqual({
        ...withKind(DEFAULT_SETTINGS, "ai", { banner: false }),
        locale: "es",
        debug: true,
      });
    });
  });

  it("sets a list filter the setting does not allow to its default and shows it", async () => {
    const { settings, input } = await setup();
    await writeSettings(settings, withKind(DEFAULT_SETTINGS, "pvp", { filter: "dim" }));
    expect(input("pvp", "filter", "dim").checked).toBe(true);
    const radio = input("pvp", "filter", "hide");
    radio.value = "blur";
    radio.checked = true;
    change(radio);
    await vi.waitFor(async () => {
      expect(parseSettings(await settings.read()).kinds.pvp.filter).toBe("off");
    });
    expect(input("pvp", "filter", "off").checked).toBe(true);
  });

  it("ignores a control that names no known setting or kind", async () => {
    const { settings, input } = await setup();
    const spy = vi.spyOn(settings, "patch");
    const badge = input("drm", "badge");
    badge.setAttribute("data-sar-for", "nothing");
    change(badge);
    badge.setAttribute("data-sar-for", "drm");
    badge.setAttribute("data-sar-setting", "other");
    change(badge);
    await Promise.resolve();
    expect(spy).not.toHaveBeenCalled();
  });

  it("reverts the control and shows an error under it when a change cannot be saved", async () => {
    const { settings, input } = await setup();
    vi.spyOn(settings, "patch").mockRejectedValue(new Error());
    const badge = input("anticheat", "badge");
    badge.checked = false;
    change(badge);
    const error = badge.parentElement?.querySelector<HTMLElement>(".sar-field-error");
    await vi.waitFor(() => {
      expect(error?.hidden).toBe(false);
    });
    expect(badge.checked).toBe(true);
    expect(error?.textContent).toBe(i18n.t("error_settings_save"));
    const other = input("anticheat", "banner").parentElement?.querySelector<HTMLElement>(
      ".sar-field-error",
    );
    expect(other?.hidden).toBe(true);
  });

  it("follows changes from other tabs", async () => {
    const { settings, input } = await setup();
    await writeSettings(settings, withKind(DEFAULT_SETTINGS, "kernel", { banner: false }));
    expect(input("kernel", "banner").checked).toBe(false);
    expect(input("drm", "banner").checked).toBe(true);
  });
});

/** Types into a color field as a person does: each key is an input event, leaving is a change. */
function typeColor(field: HTMLInputElement, text: string): void {
  field.value = text;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  change(field);
}

describe("the color field", () => {
  const colorOf = (root: HTMLElement, id: KindId) =>
    root.style.getPropertyValue(`--sar-kind-color-${id}`);
  const storedColor = async (settings: { read(): Promise<unknown>; }, id: KindId) =>
    parseSettings(await settings.read()).kinds[id].color;

  it("is on the full page and in the dialog, and not in the popup", async () => {
    const page = await setup("page");
    expect(page.root.querySelectorAll("[data-sar-setting=color]")).toHaveLength(KINDS.length);
    page.form.destroy();
    const popup = await setup("popup");
    expect(popup.root.querySelector("[data-sar-setting=color]")).toBeNull();
    expect(popup.root.querySelector("[data-sar-color-reset]")).toBeNull();
    popup.form.destroy();
    const dialog = await setup("popup", memoryStore(), undefined, true);
    expect(dialog.root.querySelectorAll("[data-sar-setting=color]")).toHaveLength(KINDS.length);
    expect(dialog.root.getAttribute("data-sar-context")).toBe("popup");
  });

  it("is labelled with the catalog text, which calls the setting experimental", async () => {
    const { root, input } = await setup();
    const field = input("ai", "color");
    const label = root.querySelector(`label[for="${field.id}"]`);
    expect(label?.textContent).toBe(i18n.t("options_color_label"));
    for (const locale of Object.keys(SHIPPED_CATALOGS)) {
      const label = createI18n(SHIPPED_CATALOGS, locale).t("options_color_label");
      expect(label, locale).toMatch(/\(experimental\)$/);
    }
    expect(field.placeholder).toBe(i18n.t("options_color_placeholder"));
  });

  it("starts empty with no color set, and shows a stored color in its normal form", async () => {
    const { root, settings, input, card } = await setup();
    expect(input("ai", "color").value).toBe("");
    expect(colorOf(root, "ai")).toBe("");
    expect(card("ai").querySelector<HTMLElement>("[data-sar-color-reset]")?.hidden).toBe(true);
    await settings.patch({ kinds: { ai: { color: toHexColor("ABC") } } });
    expect(input("ai", "color").value).toBe("#aabbcc");
    expect(colorOf(root, "ai")).toBe("#aabbcc");
    expect(card("ai").querySelector<HTMLElement>("[data-sar-color-reset]")?.hidden).toBe(false);
    expect(colorOf(root, "drm")).toBe("");
  });

  it.each([
    ["#8F73F3", "#8f73f3"],
    ["8f73f3", "#8f73f3"],
    ["#F0a", "#ff00aa"],
    ["  0f0  ", "#00ff00"],
  ])("saves %s as %s, in one patch of that field", async (typed, stored) => {
    const { root, settings, input } = await setup();
    const patch = vi.spyOn(settings, "patch");
    typeColor(input("kernel", "color"), typed);
    await vi.waitFor(async () => {
      expect(await storedColor(settings, "kernel")).toBe(stored);
    });
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith({ kinds: { kernel: { color: stored } } });
    expect(input("kernel", "color").value).toBe(stored);
    expect(colorOf(root, "kernel")).toBe(stored);
    expect(await storedColor(settings, "ai")).toBeUndefined();
    expect(input("kernel", "color").getAttribute("aria-invalid")).toBe("false");
  });

  it("shows the color while it is typed and saves it when the change is committed", async () => {
    const { root, settings, input } = await setup();
    const patch = vi.spyOn(settings, "patch");
    const field = input("eula", "color");
    field.value = "#123456";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    expect(colorOf(root, "eula")).toBe("#123456");
    expect(patch).not.toHaveBeenCalled();
    change(field);
    await vi.waitFor(() => {
      expect(patch).toHaveBeenCalledTimes(1);
    });
  });

  it("says so at once for text that is no color, and saves nothing", async () => {
    const { root, settings, card, input } = await setup();
    const patch = vi.spyOn(settings, "patch");
    const field = input("drm", "color");
    const error = card("drm").querySelector<HTMLElement>(`#${field.id}-invalid`);
    expect(error?.hidden).toBe(true);
    for (const text of ["#12", "#12345", "ggg", "red", "#1234567", "rgb(1,2,3)", "url(x)"]) {
      typeColor(field, text);
      expect(error?.hidden, text).toBe(false);
      expect(error?.textContent).toBe(i18n.t("options_color_invalid"));
      expect(field.getAttribute("aria-invalid")).toBe("true");
      expect(field.getAttribute("aria-describedby")).toContain(error?.id);
    }
    expect(patch).not.toHaveBeenCalled();
    expect(colorOf(root, "drm")).toBe("");
    expect(field.value).toBe("url(x)");
    typeColor(field, "#abc");
    expect(error?.hidden).toBe(true);
    expect(field.getAttribute("aria-invalid")).toBe("false");
  });

  it("keeps text being fixed when another control saves", async () => {
    const { input } = await setup();
    const field = input("drm", "color");
    typeColor(field, "#12");
    const badge = input("ai", "badge");
    badge.checked = false;
    change(badge);
    await vi.waitFor(() => {
      expect(input("ai", "badge").checked).toBe(false);
    });
    expect(field.value).toBe("#12");
  });

  it("clears the color when the text is emptied", async () => {
    const { root, settings, input } = await setup();
    await settings.patch({ kinds: { pvp: { color: toHexColor("#112233") } } });
    typeColor(input("pvp", "color"), "  ");
    await vi.waitFor(async () => {
      expect(await storedColor(settings, "pvp")).toBeUndefined();
    });
    expect(colorOf(root, "pvp")).toBe("");
    expect(input("pvp", "color").value).toBe("");
  });

  it("resets from the Reset button, whose accessible name starts with its text", async () => {
    const { root, settings, card, input } = await setup();
    await settings.patch({ kinds: { account: { color: toHexColor("#445566") } } });
    const reset = card("account").querySelector<HTMLElement>("[data-sar-color-reset]");
    expect(reset?.textContent).toBe(i18n.t("options_color_reset"));
    expect(reset?.getAttribute("aria-label")).toBe(
      i18n.t("options_color_reset_label", { heading: heading("account") }),
    );
    expect(reset?.getAttribute("aria-label")?.startsWith(reset.textContent)).toBe(true);
    typeColor(input("account", "color"), "#12");
    reset?.click();
    await vi.waitFor(async () => {
      expect(await storedColor(settings, "account")).toBeUndefined();
    });
    expect(colorOf(root, "account")).toBe("");
    expect(input("account", "color").value).toBe("");
    expect(input("account", "color").getAttribute("aria-invalid")).toBe("false");
    expect(reset?.hidden).toBe(true);
  });

  it("applies the stored colors when it opens and follows another tab", async () => {
    const { root, settings, input } = await setup();
    const store = memoryStore();
    const other = createSettingsSource(store);
    await other.patch({ kinds: { ai: { color: toHexColor("#010203") } } });
    const second = document.createElement("main");
    document.body.append(second);
    await mountSettingsForm(second, {
      i18n,
      settings: other,
      lists: createIgnoreLists(memoryStore(), fixedClock(0)),
      sectionState: createSectionState(memoryStore()),
      context: "page",
      colors: true,
      locales: ["en"],
    });
    expect(second.style.getPropertyValue("--sar-kind-color-ai")).toBe("#010203");
    await settings.patch({ kinds: { ai: { color: toHexColor("#0a0b0c") } } });
    expect(input("ai", "color").value).toBe("#0a0b0c");
    expect(colorOf(root, "ai")).toBe("#0a0b0c");
  });

  it("restores the stored color when the save fails", async () => {
    const { root, settings, card, input } = await setup();
    vi.spyOn(settings, "patch").mockRejectedValue(new Error());
    typeColor(input("ai", "color"), "#abcdef");
    const failure = card("ai").querySelector<HTMLElement>(
      ".sar-color > .sar-field-error:not([id])",
    );
    await vi.waitFor(() => {
      expect(failure?.hidden).toBe(false);
    });
    expect(failure?.textContent).toBe(i18n.t("error_settings_save"));
    expect(colorOf(root, "ai")).toBe("");
    expect(input("ai", "color").value).toBe("");
  });

  it("is disabled while the settings could not be read", async () => {
    const store = memoryStore();
    const settings = createSettingsSource(store);
    vi.spyOn(settings, "read").mockRejectedValue(new Error());
    const root = document.createElement("main");
    document.body.append(root);
    await mountSettingsForm(root, {
      i18n,
      settings,
      lists: createIgnoreLists(memoryStore(), fixedClock(0)),
      sectionState: createSectionState(memoryStore()),
      context: "page",
      colors: true,
      locales: ["en"],
    });
    const field = root.querySelector<HTMLInputElement>("[data-sar-setting=color]");
    expect(field?.disabled).toBe(true);
  });
});

describe("two forms over one store", () => {
  /** A form that is its own tab: its own settings source over the shared store. */
  async function tab(store: ReturnType<typeof memoryStore>) {
    const root = document.createElement("main");
    document.body.append(root);
    const settings = createSettingsSource(store);
    await mountSettingsForm(root, {
      i18n,
      settings,
      lists: createIgnoreLists(store, fixedClock(0)),
      sectionState: createSectionState(memoryStore()),
      context: "page",
      colors: true,
      locales: ["en"],
    });
    const input = (id: KindId, field: string): HTMLInputElement => {
      const section = [...root.querySelectorAll<HTMLElement>("section.sar-card")].find((each) =>
        each.querySelector(".sar-card-title")?.textContent === heading(id)
      );
      const found = section?.querySelector<HTMLInputElement>(`[data-sar-setting=${field}]`);
      if (found === null || found === undefined) {
        throw new TypeError([id, field].join(" "));
      }
      return found;
    };
    return { settings, input };
  }

  it("keeps what the other form changed, though it never heard of the change", async () => {
    const store = memoryStore();
    const first = await tab(store);
    const second = await tab(store);

    const kernelBadge = first.input("kernel", "badge");
    kernelBadge.checked = false;
    change(kernelBadge);
    await vi.waitFor(async () => {
      expect(parseSettings(await first.settings.read()).kinds.kernel.badge).toBe(false);
    });
    // The second form still shows the badge on, as it did when it opened.
    expect(second.input("kernel", "badge").checked).toBe(true);

    const drmBanner = second.input("drm", "banner");
    drmBanner.checked = false;
    change(drmBanner);
    await vi.waitFor(async () => {
      expect(parseSettings(await second.settings.read()).kinds.drm.banner).toBe(false);
    });
    const stored = parseSettings(await first.settings.read());
    expect(stored.kinds.kernel.badge).toBe(false);
    expect(stored.kinds.drm.banner).toBe(false);
    expect(second.input("kernel", "badge").checked).toBe(false);
  });

  it("keeps another field of the same kind and the settings of the page language", async () => {
    const store = memoryStore();
    const first = await tab(store);
    const second = await tab(store);
    await writeSettings(createSettingsSource(store), {
      ...withKind(DEFAULT_SETTINGS, "pvp", { filter: "hide" }),
      locale: "es",
    });

    const badge = second.input("pvp", "badge");
    badge.checked = false;
    change(badge);
    await vi.waitFor(async () => {
      expect(parseSettings(await first.settings.read()).kinds.pvp.badge).toBe(false);
    });
    const stored = parseSettings(await first.settings.read());
    expect(stored.kinds.pvp.filter).toBe("hide");
    expect(stored.locale).toBe("es");
  });
});

describe("the language", () => {
  it("names each language in itself", async () => {
    const { root } = await setup();
    const options = [...root.querySelectorAll("option")].map((option) => option.value);
    expect(options).toEqual(["auto", "en", "es"]);
    expect(root.querySelector("option[value=es]")?.getAttribute("lang")).toBe("es");
  });

  it("sets a language the setting does not allow to automatic and shows it", async () => {
    const { settings, select } = await setup();
    await writeSettings(settings, { ...DEFAULT_SETTINGS, locale: "es" });
    const picker = select();
    expect(picker.value).toBe("es");
    const option = document.createElement("option");
    option.value = "x y";
    picker.append(option);
    picker.value = "x y";
    change(picker);
    await vi.waitFor(async () => {
      expect(parseSettings(await settings.read()).locale).toBe("auto");
    });
    expect(picker.value).toBe("auto");
  });

  it("changes the language and leaves every kind alone", async () => {
    const { settings, select } = await setup();
    await writeSettings(settings, withKind(DEFAULT_SETTINGS, "drm", { filter: "hide" }));
    const picker = select();
    picker.value = "es";
    change(picker);
    await vi.waitFor(async () => {
      expect(parseSettings(await settings.read()).locale).toBe("es");
    });
    expect(parseSettings(await settings.read()).kinds.drm.filter).toBe("hide");
  });

  it("is left to the full page", async () => {
    const popup = await setup("popup");
    expect(popup.root.querySelector("select")).toBeNull();
  });
});

describe("the page around the sections", () => {
  it("says that it sends no reports", async () => {
    const page = await setup("page");
    expect(page.root.textContent).toContain(i18n.t("options_privacy_no_reports"));
    document.body.replaceChildren();
    const popup = await setup("popup");
    expect(popup.root.textContent).toContain(i18n.t("options_privacy_no_reports"));
  });

  it("renders the product header and the popup's link to all settings when given", async () => {
    const root = document.createElement("main");
    document.body.append(root);
    await mountSettingsForm(root, {
      i18n,
      settings: createSettingsSource(memoryStore()),
      lists: createIgnoreLists(memoryStore(), fixedClock(0)),
      sectionState: createSectionState(memoryStore()),
      context: "popup",
      colors: false,
      locales: ["en"],
      header: { version: "2026.10.20", iconUrl: "icons/icon-32.png" },
      allSettingsUrl: "options.html",
    });
    const header = root.firstElementChild;
    expect(header?.matches("header.sar-options-header")).toBe(true);
    expect(header?.querySelector("h1")?.textContent).toBe(i18n.t("ext_name"));
    expect(header?.querySelector(".sar-options-version")?.textContent).toBe(
      i18n.t("options_version", { version: "2026.10.20" }),
    );
    expect(header?.querySelector("img")?.getAttribute("src")).toBe("icons/icon-32.png");
    expect(header?.querySelector("img")?.getAttribute("alt")).toBe("");
    const link = root.querySelector(".sar-options-footer a");
    expect(link?.textContent).toBe(i18n.t("options_all_settings"));
    expect(link?.getAttribute("href")).toBe("options.html");
    expect(link?.getAttribute("target")).toBe("_blank");
  });

  it("renders no header or link by default", async () => {
    const { root } = await setup("popup");
    expect(root.querySelector(".sar-options-header")).toBeNull();
    expect(root.querySelector(".sar-options-footer a")).toBeNull();
  });

  it("reads Spanish from the shipped catalog, down to the section titles", async () => {
    const spanish = createI18n(SHIPPED_CATALOGS, "es");
    const root = document.createElement("main");
    document.body.append(root);
    await mountSettingsForm(root, {
      i18n: spanish,
      settings: createSettingsSource(memoryStore()),
      lists: createIgnoreLists(memoryStore(), fixedClock(0)),
      sectionState: createSectionState(memoryStore()),
      context: "page",
      colors: true,
      locales: ["en", "es"],
    });
    const titles = kindTitles(root);
    expect(titles.slice(0, KINDS.length)).toEqual(
      KINDS.map((kind) => spanish.t(kind.messages.heading)),
    );
    expect(titles[0]).not.toBe(i18n.t("kind_ai_heading"));
    expect(root.textContent).toContain(spanish.t("options_kind_enabled"));
  });
});

describe("the accessible names of the controls", () => {
  it("names every section by its heading, with a heading of its own", async () => {
    const { root } = await setup();
    const sections = [...root.querySelectorAll<HTMLElement>("section.sar-card")];
    expect(sections.length).toBeGreaterThan(KINDS.length);
    const ids = sections.map((section) => section.getAttribute("aria-labelledby") ?? "");
    expect(new Set(ids).size).toBe(sections.length);
    for (const section of sections) {
      const title = section.querySelector(".sar-card-title");
      expect(title?.id).toBe(section.getAttribute("aria-labelledby"));
    }
  });

  it("makes each switch a switch inside a label that says what it does", async () => {
    const { card } = await setup();
    const labels = (id: KindId) =>
      [...card(id).querySelectorAll<HTMLLabelElement>("label.sar-field")].map((label) => {
        const box = label.querySelector("input");
        return [box?.getAttribute("role"), label.querySelector(".sar-field-label")?.textContent];
      });
    expect(labels("drm")).toEqual([
      ["switch", i18n.t("options_kind_enabled")],
      ["switch", i18n.t("options_badges")],
      ["switch", i18n.t("options_banner")],
    ]);
  });

  it("labels the badge switch shortly in the popup", async () => {
    const { card } = await setup("popup");
    expect(card("drm").textContent).toContain(i18n.t("options_badges_short"));
    expect(card("drm").textContent).not.toContain(i18n.t("options_badges"));
  });

  it("groups each list filter in a labelled fieldset with radios of its own", async () => {
    const { card, root } = await setup();
    const names = new Set<string>();
    for (const kind of KINDS) {
      const fieldset = card(kind.id).querySelector("fieldset.sar-segment");
      const label = root.querySelector(`#${fieldset?.getAttribute("aria-labelledby") ?? "x"}`);
      expect(label?.textContent).toBe(i18n.t("options_filter_label"));
      const radios = [...(fieldset?.querySelectorAll("input") ?? [])];
      expect(radios.map((radio) => radio.value)).toEqual([...LIST_FILTERS]);
      expect(new Set(radios.map((radio) => radio.name)).size).toBe(1);
      const texts = radios.map((radio) =>
        fieldset?.querySelector(`label[for="${radio.id}"]`)?.textContent
      );
      expect(texts).toEqual([
        i18n.t("options_filter_off"),
        i18n.t("options_filter_dim"),
        i18n.t("options_filter_hide"),
      ]);
      names.add(radios[0]?.name ?? "");
    }
    expect(names.size).toBe(KINDS.length);
  });
});

describe("the ignored games", () => {
  it("lists the games of each scope under its name: all tags first, then each tag", async () => {
    const { root } = await setup();
    const scopes = [...root.querySelectorAll(".sar-allow-scope")].map((title) => title.textContent);
    expect(scopes).toEqual([
      i18n.t("options_allow_scope_all"),
      heading("ai"),
      heading("kernel"),
      heading("drm"),
    ]);
    const names = (title: string) => {
      const group = [...root.querySelectorAll(".sar-allow-group")].find((each) =>
        each.querySelector(".sar-allow-scope")?.textContent === title
      );
      return [...(group?.querySelectorAll(".sar-allow-name") ?? [])].map((name) =>
        name.textContent
      );
    };
    expect(names(i18n.t("options_allow_scope_all"))).toEqual(["Every Game"]);
    expect(names(heading("ai"))).toEqual(["Newer <b>Game</b>", "Older Game"]);
    expect(names(heading("kernel"))).toEqual(["Older Game"]);
    expect(names(heading("drm"))).toEqual(["Drm Game"]);
    expect(root.querySelector(".sar-allow-name b")).toBeNull();
  });

  it("links each game to its store page and dates it", async () => {
    const { control } = await setup();
    expect(control(".sar-allow-name").getAttribute("href")).toBe(
      "https://store.steampowered.com/app/40/",
    );
    expect(control(".sar-allow-meta").textContent).toBe(
      i18n.t("options_allow_since", { date: "Oct 3, 2026" }),
    );
  });

  it("names each button by its game and its scope, so no two are alike", async () => {
    const { root } = await setup();
    const labels = [...root.querySelectorAll("[data-sar-restore]")].map((button) =>
      button.getAttribute("aria-label")
    );
    expect(labels).toContain(
      i18n.t("options_allow_restore_label", {
        name: "Older Game",
        scope: heading("ai"),
      }),
    );
    expect(labels).toContain(
      i18n.t("options_allow_restore_label", {
        name: "Every Game",
        scope: i18n.t("options_allow_scope_all"),
      }),
    );
    expect(new Set(labels).size).toBe(labels.length);
    for (const group of root.querySelectorAll(".sar-allow-group")) {
      expect(group.getAttribute("role")).toBe("group");
      const title = group.querySelector(".sar-allow-scope");
      expect(group.getAttribute("aria-labelledby")).toBe(title?.id);
    }
  });

  it("stops ignoring a game for one tag only, and moves focus to the next game", async () => {
    const { root, allowList, control } = await setup();
    control('[data-sar-restore="10"][data-sar-scope="ai"]').click();
    await vi.waitFor(async () => {
      expect([...(await allowList.list()).ai.keys()]).toEqual([20]);
    });
    await vi.waitFor(() => {
      expect(root.querySelectorAll(".sar-allow-item")).toHaveLength(4);
    });
    expect([...(await allowList.list()).kernel.keys()]).toEqual([10]);
    expect(document.activeElement).toBe(
      control('[data-sar-restore="10"][data-sar-scope="kernel"]'),
    );
    await vi.waitFor(() => {
      expect(control("[aria-live]").textContent).toBe(
        i18n.t("notice_marking_restored_kind", { heading: heading("ai") }),
      );
    });
  });

  it("says a game is no longer ignored for all tags when that was the scope", async () => {
    const { control } = await setup();
    control('[data-sar-restore="40"][data-sar-scope="all"]').click();
    await vi.waitFor(() => {
      expect(control("[aria-live]").textContent).toBe(i18n.t("notice_marking_restored"));
    });
  });

  it("says that the list could not be read, not that nothing is ignored", async () => {
    for (const context of ["page", "popup"] as const) {
      const root = document.createElement("main");
      document.body.append(root);
      const lists = createIgnoreLists(memoryStore(), fixedClock(0));
      vi.spyOn(lists.games, "list").mockRejectedValue(new Error());
      await mountSettingsForm(root, {
        i18n,
        settings: createSettingsSource(memoryStore()),
        lists,
        sectionState: createSectionState(memoryStore()),
        context,
        colors: context === "page",
        locales: ["en"],
      });
      const section = [...root.querySelectorAll<HTMLElement>("section.sar-card")].find((card) =>
        card.querySelector(".sar-card-title")?.textContent === i18n.t("options_section_allow")
      );
      expect(section?.hidden).toBe(false);
      expect(section?.textContent).toContain(i18n.t("error_allow_list_load"));
      expect(section?.querySelector(".sar-empty")).toBeNull();
      root.remove();
    }
  });

  it("stops ignoring a game for all tags and leaves the tags it is ignored for", async () => {
    const { allowList, control } = await setup();
    control('[data-sar-restore="40"][data-sar-scope="all"]').click();
    await vi.waitFor(async () => {
      expect((await allowList.list())[ALLOW_ALL].size).toBe(0);
    });
    expect((await allowList.list()).ai.size).toBe(2);
    expect(
      document.querySelector(".sar-allow-group")?.querySelector(".sar-allow-scope")
        ?.textContent,
    ).toBe(heading("ai"));
  });

  it("drops a scope's heading with its last game", async () => {
    const { root, control } = await setup();
    control('[data-sar-restore="30"][data-sar-scope="drm"]').click();
    await vi.waitFor(() => {
      expect(root.querySelectorAll(".sar-allow-scope")).toHaveLength(3);
    });
    expect(
      [...root.querySelectorAll(".sar-allow-scope")].map((title) => title.textContent),
    ).not.toContain(heading("drm"));
  });

  it("shows the empty state with the action's own label", async () => {
    const { root, control } = await setup();
    for (const [id, scope] of [[10, "ai"], [20, "ai"], [30, "drm"], [40, "all"], [10, "kernel"]]) {
      control(`[data-sar-restore="${String(id)}"][data-sar-scope="${String(scope)}"]`).click();
      await vi.waitFor(() => {
        expect(
          root.querySelector(
            `[data-sar-restore="${String(id)}"][data-sar-scope="${String(scope)}"]`,
          ),
        )
          .toBeNull();
      });
    }
    expect(control(".sar-empty").textContent).toBe(
      i18n.t("options_allow_empty", { action: i18n.t("banner_ignore") }),
    );
  });

  it("leaves an empty list out of the popup and moves focus above it", async () => {
    const { control, root, allowList } = await setup("popup");
    const section = control(".sar-allow-list").closest<HTMLElement>("section");
    expect(section?.hidden).toBe(false);
    for (const scope of ["ai", "drm", "kernel", "all"] as const) {
      for (const id of (await allowList.list())[scope].keys()) {
        control(`[data-sar-restore="${String(id)}"][data-sar-scope="${scope}"]`).click();
        await vi.waitFor(() => {
          expect(
            root.querySelector(`[data-sar-restore="${String(id)}"][data-sar-scope="${scope}"]`),
          )
            .toBeNull();
        });
      }
    }
    expect(section?.hidden).toBe(true);
    expect(document.activeElement?.textContent).toBe(heading("family"));
  });

  it("keeps the empty state on the full page", async () => {
    const { control, root, allowList } = await setup();
    for (const scope of ["ai", "drm", "kernel", "all"] as const) {
      for (const id of (await allowList.list())[scope].keys()) {
        control(`[data-sar-restore="${String(id)}"][data-sar-scope="${scope}"]`).click();
        await vi.waitFor(() => {
          expect(
            root.querySelector(`[data-sar-restore="${String(id)}"][data-sar-scope="${scope}"]`),
          )
            .toBeNull();
        });
      }
    }
    expect(control(".sar-empty").closest<HTMLElement>("section")?.hidden).toBe(false);
  });

  it("keeps a game and shows an error when stopping to ignore it fails", async () => {
    const { allowList, control } = await setup();
    vi.spyOn(allowList, "remove").mockRejectedValue(new Error());
    const button = control('[data-sar-restore="20"][data-sar-scope="ai"]');
    button.click();
    const error = button.parentElement?.querySelector<HTMLElement>(".sar-field-error");
    await vi.waitFor(() => {
      expect(error?.hidden).toBe(false);
    });
    expect(error?.textContent).toBe(i18n.t("error_allow_list_save"));
  });

  it("reads the list again on request, for a change made in another tab", async () => {
    const { root, allowList, form } = await setup();
    await allowList.add("pvp", appId(50), "Fifty");
    await form.refreshAllowList();
    expect(root.querySelectorAll(".sar-allow-scope")).toHaveLength(5);
  });

  it("reads each list once per refresh, however many places draw it", async () => {
    const { lists, form } = await setup();
    const reads = [lists.games, ...CREATOR_ROLES.map((role) => lists.creators[role])].map((list) =>
      vi.spyOn(list, "list")
    );
    await form.refreshAllowList();
    expect(reads.map((read) => read.mock.calls.length)).toEqual([1, 1, 1]);
  });
});

describe("a failed read of the settings", () => {
  it("shows the defaults and an error when the settings cannot be read", async () => {
    const settings = createSettingsSource(memoryStore());
    vi.spyOn(settings, "read").mockRejectedValue(new Error());
    const root = document.createElement("main");
    await mountSettingsForm(root, {
      i18n,
      settings,
      lists: createIgnoreLists(memoryStore(), fixedClock(0)),
      sectionState: createSectionState(memoryStore()),
      context: "page",
      colors: true,
      locales: ["en"],
    });
    // Above the cards, so a closed section cannot hide it
    const error = root.querySelector<HTMLElement>(":scope > .sar-field-error");
    expect(error?.hidden).toBe(false);
    expect(error?.textContent).toBe(i18n.t("error_settings_load"));
    expect(error?.nextElementSibling?.querySelector(".sar-card-title")?.textContent).toBe(
      heading("ai"),
    );
    expect(
      root.querySelector<HTMLInputElement>("[data-sar-setting=banner]")?.checked,
    ).toBe(true);
  });

  it("keeps the controls off after a failed load, so v1 can still migrate", async () => {
    const inner = memoryStore(
      new Map([["v1:settings", { badges: false, banner: true, listFilter: "hide", locale: "es" }]]),
    );
    const store = countingStore(inner);
    const settings = createSettingsSource(store);
    store.break();
    const root = document.createElement("main");
    document.body.append(root);
    await mountSettingsForm(root, {
      i18n,
      settings,
      lists: createIgnoreLists(memoryStore(), fixedClock(0)),
      sectionState: createSectionState(memoryStore()),
      context: "page",
      colors: true,
      locales: ["en", "es"],
    });
    const error = root.querySelector<HTMLElement>(":scope > .sar-field-error");
    expect(error?.hidden).toBe(false);
    const controls = [...root.querySelectorAll<HTMLInputElement>("[data-sar-setting]")];
    expect(controls.length).toBeGreaterThan(KINDS.length);
    expect(controls.every((control) => control.disabled)).toBe(true);

    // A change event that still gets through (a script, an older browser) saves nothing.
    const banner = root.querySelector<HTMLInputElement>("[data-sar-setting=banner]");
    if (banner === null) {
      throw new TypeError();
    }
    banner.checked = false;
    change(banner);
    await Promise.resolve();
    expect(banner.checked).toBe(true);
    expect(store.calls.set).toBe(0);

    store.heal();
    expect(await inner.keys()).toStrictEqual(["v1:settings"]);
    const read = parseSettings(await settings.read());
    expect(read.kinds.ai).toStrictEqual({
      enabled: true,
      badge: false,
      banner: true,
      filter: "hide",
    });
    expect(read.locale).toBe("es");
  });

  it("turns the controls on again when settings arrive after a failed load", async () => {
    const settings = createSettingsSource(memoryStore());
    vi.spyOn(settings, "read").mockRejectedValueOnce(new Error());
    const root = document.createElement("main");
    document.body.append(root);
    await mountSettingsForm(root, {
      i18n,
      settings,
      lists: createIgnoreLists(memoryStore(), fixedClock(0)),
      sectionState: createSectionState(memoryStore()),
      context: "page",
      colors: true,
      locales: ["en"],
    });
    const banner = root.querySelector<HTMLInputElement>("[data-sar-setting=banner]");
    expect(banner?.disabled).toBe(true);
    await writeSettings(settings, withKind(DEFAULT_SETTINGS, "ai", { banner: false }));
    expect(banner?.disabled).toBe(false);
    expect(root.querySelector<HTMLElement>(":scope > .sar-field-error")?.hidden).toBe(true);
    expect(banner?.checked).toBe(false);
  });
});

describe("collapsible sections", () => {
  function detailsOf(section: HTMLElement): HTMLDetailsElement {
    const found = section.querySelector("details");
    if (found === null) {
      throw new TypeError();
    }
    return found;
  }

  /** Opens or closes the section the way a click on its summary does: the toggle follows. */
  function toggle(section: HTMLElement, open: boolean): void {
    detailsOf(section).open = open;
  }

  it("makes each tag's section a native disclosure with its title in the summary", async () => {
    const { card } = await setup();
    for (const kind of KINDS) {
      const details = detailsOf(card(kind.id));
      const summary = details.firstElementChild;
      expect(summary?.tagName).toBe("SUMMARY");
      expect(summary?.querySelector(".sar-card-title")?.textContent).toBe(heading(kind.id));
      expect(details.querySelectorAll(":scope > summary")).toHaveLength(1);
      // The master switch is in the body, one open away
      expect(details.querySelector("[data-sar-setting=enabled]")).not.toBeNull();
      expect(summary?.querySelector("[data-sar-setting]")).toBeNull();
    }
  });

  it("starts every section open when nothing was stored", async () => {
    const { card } = await setup();
    for (const kind of KINDS) {
      expect(detailsOf(card(kind.id)).open).toBe(true);
    }
  });

  it("keeps the other cards as they were", async () => {
    const { control } = await setup();
    expect(control(`.sar-card [data-sar-setting=locale]`).closest("details")).toBeNull();
    expect(control(".sar-allow-list").closest("details")).toBeNull();
  });

  it("shows on or off in the summary, from the master switch", async () => {
    const { card, input, settings } = await setup();
    const cue = (id: KindId) => card(id).querySelector(".sar-card-summary .sar-card-state");
    for (const kind of KINDS) {
      const on = !OFF_KINDS.includes(kind.id);
      expect(cue(kind.id)?.textContent).toBe(i18n.t(on ? "options_state_on" : "options_state_off"));
      expect(cue(kind.id)?.hasAttribute("data-sar-on")).toBe(on);
    }

    toggle(card("ai"), false);
    const master = input("ai", "enabled");
    master.checked = false;
    change(master);
    await vi.waitFor(() => {
      expect(cue("ai")?.textContent).toBe(i18n.t("options_state_off"));
    });
    expect(cue("ai")?.hasAttribute("data-sar-on")).toBe(false);
    expect(parseSettings(await settings.read()).kinds.ai.enabled).toBe(false);
  });

  it("follows the master switch in another tab while the section is closed", async () => {
    const { card, settings } = await setup();
    toggle(card("pvp"), false);
    await writeSettings(settings, withKind(DEFAULT_SETTINGS, "pvp", { enabled: true }));
    expect(card("pvp").querySelector(".sar-card-state")?.textContent).toBe(
      i18n.t("options_state_on"),
    );
  });

  it("remembers a closed section, and only that one", async () => {
    const { card, sectionState } = await setup();
    toggle(card("kernel"), false);
    await vi.waitFor(async () => {
      expect([...(await sectionState.read())]).toEqual([["kernel", false]]);
    });
  });

  it("opens the sections as stored, in the popup and on the page alike", async () => {
    const sectionStore = memoryStore();
    const seed = createSectionState(sectionStore);
    await seed.setOpen("ai", false);
    await seed.setOpen("pvp", false);
    for (const context of ["page", "popup"] as const) {
      const { root, card } = await setup(context, sectionStore);
      for (const kind of KINDS) {
        expect(detailsOf(card(kind.id)).open).toBe(kind.id !== "ai" && kind.id !== "pvp");
      }
      root.remove();
    }
  });

  it("restores what the last visit left, after a close and a new mount", async () => {
    const sectionStore = memoryStore();
    const first = await setup("page", sectionStore);
    toggle(first.card("drm"), false);
    await vi.waitFor(async () => {
      expect(isSectionOpen(await first.sectionState.read(), "drm")).toBe(false);
    });
    first.form.destroy();
    const second = await setup("popup", sectionStore);
    expect(detailsOf(second.card("drm")).open).toBe(false);
    toggle(second.card("drm"), true);
    await vi.waitFor(async () => {
      expect(isSectionOpen(await second.sectionState.read(), "drm")).toBe(true);
    });
  });

  it("writes nothing for a mount, or for a toggle that changes nothing", async () => {
    const sectionStore = countingStore(memoryStore());
    await createSectionState(sectionStore).setOpen("ai", false);
    const writes = sectionStore.calls.set;
    const { card } = await setup("page", sectionStore);
    const details = detailsOf(card("ai"));
    expect(details.open).toBe(false);
    details.dispatchEvent(new Event("toggle"));
    toggle(card("kernel"), true);
    await Promise.resolve();
    expect(sectionStore.calls.set).toBe(writes);
  });

  it("remembers the last of two quick toggles, one write for each change", async () => {
    const sectionStore = countingStore(memoryStore());
    const { card } = await setup("page", sectionStore);
    toggle(card("ai"), false);
    toggle(card("ai"), true);
    await vi.waitFor(() => {
      expect(sectionStore.calls.set).toBe(2);
    });
    const { sectionState } = await setup("popup", sectionStore);
    expect(isSectionOpen(await sectionState.read(), "ai")).toBe(true);
  });

  it("opens every section when the stored state is bad", async () => {
    const sectionStore = memoryStore(new Map([[SECTION_STATE_KEY, { open: "closed" }]]));
    const { card } = await setup("page", sectionStore);
    for (const kind of KINDS) {
      expect(detailsOf(card(kind.id)).open).toBe(true);
    }
  });

  it("still renders and works when the state cannot be read", async () => {
    const sectionStore = countingStore(memoryStore());
    sectionStore.break();
    const { card, input, settings } = await setup("page", sectionStore);
    for (const kind of KINDS) {
      expect(detailsOf(card(kind.id)).open).toBe(true);
    }
    expect(card("ai").querySelector(".sar-card-state")?.textContent).toBe(
      i18n.t("options_state_on"),
    );
    const banner = input("ai", "banner");
    banner.checked = false;
    change(banner);
    await vi.waitFor(async () => {
      expect(parseSettings(await settings.read()).kinds.ai.banner).toBe(false);
    });
  });

  it("keeps a section closed on screen when remembering it fails", async () => {
    const sectionStore = countingStore(memoryStore());
    const { card } = await setup("page", sectionStore);
    sectionStore.break();
    // A rejected write must not surface as an unhandled rejection, which fails the run
    toggle(card("ai"), false);
    await vi.waitFor(() => {
      expect(sectionStore.calls.get).toBeGreaterThan(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(detailsOf(card("ai")).open).toBe(false);
    sectionStore.heal();
    toggle(card("kernel"), false);
    await vi.waitFor(() => {
      expect(sectionStore.calls.set).toBe(1);
    });
  });

  it("puts focus on the title of a closed section, which stays in view", async () => {
    const { card, root } = await setup();
    const last = card(KINDS.at(-1)?.id ?? "ai");
    toggle(last, false);
    const title = last.querySelector<HTMLElement>(".sar-card-title");
    title?.focus();
    expect(title?.tabIndex).toBe(-1);
    expect(title?.closest("summary")).not.toBeNull();
    expect(root.ownerDocument.activeElement).toBe(title);
  });

  it("stops listening for toggles on destroy, in the capture phase it joined", async () => {
    const { root, form } = await setup();
    const remove = vi.spyOn(root, "removeEventListener");
    form.destroy();
    expect(remove).toHaveBeenCalledWith("toggle", expect.any(Function), true);
  });
});

describe("listeners", () => {
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

describe.each(CREATOR_ROLES)("the ignored %ss", (role) => {
  const developer = role === "developer";
  const title = i18n.t(
    developer ? "options_section_allow_developers" : "options_section_allow_publishers",
  );
  const roleName = i18n.t(developer ? "banner_role_developer" : "banner_role_publisher");
  const stop = (key: string, scope: string) =>
    `[data-sar-list="allow-${role}s"][data-sar-restore="${key}"][data-sar-scope="${scope}"]`;
  const NAME = "Valve <b>Software</b>";

  function cardIn(root: HTMLElement, text: string): HTMLElement {
    const found = [...root.querySelectorAll<HTMLElement>("section.sar-card")].find((section) =>
      section.querySelector(".sar-card-title")?.textContent === text
    );
    if (found === undefined) {
      throw new TypeError(text);
    }
    return found;
  }

  /** A form whose list of this role holds two creators. */
  async function seeded(context: SettingsContext = "page") {
    const made = await setup(context);
    const list = made.lists.creators[role];
    await list.add("ai", keyOf("c:4"), NAME);
    await list.add(ALLOW_ALL, keyOf("n:Embark Studios"), "Embark Studios");
    await made.form.refreshAllowList();
    return { ...made, list, section: cardIn(made.root, title) };
  }

  it("lists the creators by scope under their own title, apart from the games", async () => {
    const { root, section } = await seeded();
    const scopes = [...section.querySelectorAll(".sar-allow-scope")];
    expect(scopes.map((scope) => scope.textContent)).toEqual([
      i18n.t("options_allow_scope_all"),
      heading("ai"),
    ]);
    const names = [...section.querySelectorAll(".sar-allow-name")];
    expect(names.map((name) => [name.tagName, name.textContent])).toEqual([
      ["SPAN", "Embark Studios"],
      ["SPAN", NAME],
    ]);
    expect(section.querySelector("a")).toBeNull();
    expect(root.querySelectorAll('[data-sar-list="allow"]')).toHaveLength(5);
    const ids = [...root.querySelectorAll("[role=group]")].map((group) =>
      group.getAttribute("aria-labelledby")
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("stops ignoring one creator without touching the other lists, and announces it", async () => {
    const { root, list, control } = await seeded();
    control(stop("c:4", "ai")).click();
    await vi.waitFor(async () => {
      expect((await list.list()).ai.size).toBe(0);
    });
    expect([...(await list.list())[ALLOW_ALL].keys()]).toEqual(["n:Embark Studios"]);
    expect(root.querySelectorAll('[data-sar-list="allow"]')).toHaveLength(5);
    expect(root.querySelector(".sar-vh")?.textContent).toBe(
      i18n.t("notice_creator_restored_kind", {
        name: NAME,
        role: roleName,
        heading: heading("ai"),
      }),
    );
  });

  it("names the role and not the tag when it stops ignoring a creator for all tags", async () => {
    const { root, control } = await seeded();
    control(stop("n:Embark Studios", "all")).click();
    await vi.waitFor(() => {
      expect(root.querySelector(".sar-vh")?.textContent).toBe(
        i18n.t("notice_creator_restored", { name: "Embark Studios", role: roleName }),
      );
    });
  });

  it.each([["page", false], ["popup", true]] as const)(
    "shows an empty list on the %s with the toggle's label, hidden in the popup: %s",
    async (context, hidden) => {
      const { root } = await setup(context);
      const section = cardIn(root, title);
      expect(section.hidden).toBe(hidden);
      expect(section.querySelector(".sar-empty")?.textContent).toBe(
        i18n.t("options_allow_empty", { action: i18n.t("banner_creators_toggle") }),
      );
    },
  );

  it("says that the list could not be read, not that nothing is ignored", async () => {
    const { lists, form, root } = await setup("popup");
    vi.spyOn(lists.creators[role], "list").mockRejectedValue(new Error());
    await form.refreshAllowList();
    const section = cardIn(root, title);
    expect(section.hidden).toBe(false);
    expect(section.textContent).toContain(i18n.t("error_creator_list_load"));
    expect(section.querySelector(".sar-empty")).toBeNull();
  });

  it("keeps the creator and shows an error when stopping to ignore it fails", async () => {
    const { list, control } = await seeded();
    vi.spyOn(list, "remove").mockRejectedValue(new Error());
    const button = control(stop("c:4", "ai"));
    button.click();
    const error = button.parentElement?.querySelector<HTMLElement>(".sar-field-error");
    await vi.waitFor(() => {
      expect(error?.hidden).toBe(false);
    });
    expect(error?.textContent).toBe(i18n.t("error_creator_list_save"));
    expect((await list.list()).ai.size).toBe(1);
  });
});
