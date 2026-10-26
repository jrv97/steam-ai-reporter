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
  withChipText,
  withKind,
  writeSettings,
} from "../../../tests/helpers/settings";
import { headingOf as heading, mountForm } from "../../../tests/helpers/settings-form";
import { CREATOR_ROLES } from "../creator";
import { SHIPPED_CATALOGS } from "../i18n/shipped";
import { createI18n } from "../i18n/t";
import { createIgnoreLists } from "../ignored";
import { toHexColor } from "../kinds/color";
import type { KindId } from "../kinds/id";
import { LIST_FILTERS } from "../kinds/kind-settings";
import { KIND_BY_ID, KINDS } from "../kinds/registry";
import { ALLOW_ALL, type AllowScope } from "../settings/allow-data";
import { DEFAULT_SETTINGS, parseSettings } from "../settings/settings";
import { createSettingsSource } from "../settings/settings-source";
import { UI_STATE_KEY } from "../storage-keys";
import { toAppId } from "../types";
import { chipText } from "./kind-details";
import { DEFAULT_TAG_COLOR, type SettingsFormDeps } from "./settings-form";
import { TOKENS_CSS } from "./styles";
import { GENERAL_TAB, sortTabs, type TabId } from "./tab-id";
import { createUiState } from "./ui-state";

const DAY = 86_400_000;
const i18n = englishI18n();
/** The toolbar popup: compact rows, no colors. */
const POPUP = { context: "popup", layout: "list", colors: false } as const;

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

/** Presses a key on an element, as the keyboard does on the focused one. */
function press(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

/** A form on stores of its own, with the games the tests ignore already listed. */
async function setup(overrides: Partial<SettingsFormDeps> = {}) {
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
  const mounted = await mountForm({ settings, lists, locales: ["en", "es"], ...overrides });
  const { root, panel } = mounted;
  const control = (selector: string): HTMLElement => {
    const found = root.querySelector<HTMLElement>(selector);
    if (found === null) {
      throw new TypeError(selector);
    }
    return found;
  };
  /** A kind's settings card, the first in its tab. */
  const card = (id: KindId): HTMLElement => {
    const found = panel(id).querySelector<HTMLElement>("section.sar-card");
    if (found === null) {
      throw new TypeError(id);
    }
    return found;
  };
  /** The card of what is ignored in a scope: in General for all tags, else in the tag's tab. */
  const ignored = (of: AllowScope): HTMLElement => {
    const title = i18n.t(of === ALLOW_ALL ? "options_allow_all_title" : "options_allow_kind_title");
    const found = [...panel(of === ALLOW_ALL ? GENERAL_TAB : of).querySelectorAll("section")]
      .find((section) => section.querySelector(".sar-card-title")?.textContent === title);
    if (found === undefined) {
      throw new TypeError(of);
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
  /** The names listed in a card, in order. */
  const names = (section: HTMLElement) =>
    [...section.querySelectorAll(".sar-allow-name")].map((name) => name.textContent);
  return {
    ...mounted,
    settings,
    lists,
    allowList,
    store,
    control,
    card,
    ignored,
    input,
    select,
    names,
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the settings of each tag", () => {
  it("titles each tag's tab with Steam's line, in a heading of its own", async () => {
    const { card } = await setup();
    for (const kind of KINDS) {
      const title = card(kind.id).querySelector(".sar-card-title");
      expect([title?.tagName, title?.textContent]).toEqual(["H2", heading(kind.id)]);
    }
  });

  it("holds the master switch, badge, banner, chip text, color and filter", async () => {
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
        "chip",
        "chipCompact",
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

  describe("its color square", () => {
    /** A tag's color square and hex text box. */
    async function square(id: KindId = "ai") {
      const form = await setup();
      const picker = form.root.querySelector(`[data-sar-picker=${id}]`);
      if (!(picker instanceof HTMLInputElement)) {
        throw new TypeError(id);
      }
      return { ...form, picker, text: form.input(id, "color") };
    }
    const fire = (target: Element, type: "input" | "change") => {
      target.dispatchEvent(new Event(type, { bubbles: true }));
    };
    type Square = Awaited<ReturnType<typeof square>>;

    it("is the browser's own picker, named for the tag, on the default violet", async () => {
      const { picker } = await square();
      expect([picker.type, picker.value]).toEqual(["color", DEFAULT_TAG_COLOR]);
      expect(picker.getAttribute("aria-label")).toBe(
        i18n.t("options_color_pick_label", { heading: heading("ai") }),
      );
    });

    it("pins the default violet to accent 400 of the tokens", () => {
      expect(DEFAULT_TAG_COLOR).toBe(/--sar-accent-400:\s*([^;]+);/.exec(TOKENS_CSS)?.[1]);
    });

    it.each<readonly [string, (form: Square) => void, string, string, string | undefined]>([
      [
        "a typed hex",
        ({ text }) => {
          text.value = "#F0a";
          fire(text, "input");
        },
        "#ff00aa",
        "#F0a",
        undefined,
      ],
      [
        "typed text that is no color",
        ({ text }) => {
          text.value = "#F0a";
          fire(text, "input");
          text.value = "#12";
          fire(text, "input");
        },
        "#ff00aa",
        "#12",
        undefined,
      ],
      [
        "a pick while the picker is open",
        ({ picker }) => {
          picker.value = "#00ff00";
          fire(picker, "input");
        },
        "#00ff00",
        "#00ff00",
        undefined,
      ],
      [
        "a pick the picker commits",
        ({ picker }) => {
          picker.value = "#00ff00";
          fire(picker, "change");
        },
        "#00ff00",
        "#00ff00",
        "#00ff00",
      ],
    ])("keeps in step with the text after %s", async (_case, act, picked, typed, stored) => {
      const form = await square();
      const patch = vi.spyOn(form.settings, "patch");
      act(form);
      expect([form.picker.value, form.text.value]).toEqual([picked, typed]);
      if (stored === undefined) {
        expect(patch).not.toHaveBeenCalled();
      } else {
        await vi.waitFor(async () => {
          expect(await storedColor(form.settings, "ai")).toBe(stored);
        });
      }
    });

    it("goes back to the default violet on Reset", async () => {
      const { picker, settings, card } = await square();
      await settings.patch({ kinds: { ai: { color: toHexColor("#123456") } } });
      expect(picker.value).toBe("#123456");
      card("ai").querySelector<HTMLElement>("[data-sar-color-reset]")?.click();
      expect(picker.value).toBe(DEFAULT_TAG_COLOR);
      await vi.waitFor(async () => {
        expect(await storedColor(settings, "ai")).toBeUndefined();
      });
    });
  });

  it("is on the full page and in the dialog, and not in the popup", async () => {
    const page = await setup();
    expect(page.root.querySelectorAll("[data-sar-setting=color]")).toHaveLength(KINDS.length);
    page.form.destroy();
    const popup = await setup(POPUP);
    expect(popup.root.querySelector("[data-sar-setting=color]")).toBeNull();
    expect(popup.root.querySelector("[data-sar-picker]")).toBeNull();
    expect(popup.root.querySelector("[data-sar-color-reset]")).toBeNull();
    popup.form.destroy();
    const dialog = await setup({ context: "popup" });
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

  it("points each field at the full help in General, with a short line under it", async () => {
    const { root, input, card, panel } = await setup();
    const helps = [...root.querySelectorAll(".sar-field-help")].filter((help) =>
      help.textContent === i18n.t("options_color_help")
    );
    expect(helps).toHaveLength(1);
    expect(panel(GENERAL_TAB).contains(helps[0] ?? null)).toBe(true);
    for (const kind of KINDS) {
      expect(input(kind.id, "color").getAttribute("aria-describedby")).toContain(helps[0]?.id);
      expect(card(kind.id).textContent).toContain(i18n.t("options_color_help_short"));
    }
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

  it("resets from the quiet Reset button, whose name starts with its text", async () => {
    const { root, settings, card, input } = await setup();
    await settings.patch({ kinds: { account: { color: toHexColor("#445566") } } });
    const reset = card("account").querySelector<HTMLElement>("[data-sar-color-reset]");
    expect(reset?.textContent).toBe(i18n.t("options_color_reset"));
    expect(reset?.getAttribute("data-sar-variant")).toBe("quiet");
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
    const other = createSettingsSource(memoryStore());
    await other.patch({ kinds: { ai: { color: toHexColor("#010203") } } });
    const second = await mountForm({ settings: other });
    expect(second.root.style.getPropertyValue("--sar-kind-color-ai")).toBe("#010203");
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
    const settings = createSettingsSource(memoryStore());
    vi.spyOn(settings, "read").mockRejectedValue(new Error());
    const { root } = await mountForm({ settings });
    const field = root.querySelector<HTMLInputElement>("[data-sar-setting=color]");
    expect(field?.disabled).toBe(true);
  });
});

describe("two forms over one store", () => {
  /** A form that is its own tab: its own settings source over the shared store. */
  async function tab(store: ReturnType<typeof memoryStore>) {
    const settings = createSettingsSource(store);
    const { panel } = await mountForm({
      settings,
      lists: createIgnoreLists(store, fixedClock(0)),
    });
    const input = (id: KindId, field: string): HTMLInputElement => {
      const found = panel(id).querySelector<HTMLInputElement>(`[data-sar-setting=${field}]`);
      if (found === null) {
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

  it.each([["page", {}], ["dialog", { context: "popup" }]] as const)(
    "is in General on the %s",
    async (_surface, overrides) => {
      const { panel, select } = await setup(overrides);
      expect(panel(GENERAL_TAB).contains(select())).toBe(true);
    },
  );
});

describe("the page around the tabs", () => {
  it("says that it sends no reports", async () => {
    const page = await setup();
    expect(page.root.textContent).toContain(i18n.t("options_privacy_no_reports"));
    document.body.replaceChildren();
    const popup = await setup(POPUP);
    expect(popup.root.textContent).toContain(i18n.t("options_privacy_no_reports"));
  });

  it("renders the product header with the popup's gear to all settings when given", async () => {
    const { root } = await mountForm({
      ...POPUP,
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
    const gear = header?.querySelector("a.sar-gear");
    expect(gear?.getAttribute("aria-label")).toBe(i18n.t("options_all_settings"));
    expect(gear?.getAttribute("href")).toBe("options.html");
    expect(gear?.getAttribute("target")).toBe("_blank");
    expect(gear?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(gear?.textContent).toBe("");
    expect(root.querySelector(".sar-options-footer a")).toBeNull();
  });

  it("keeps the gear small: one path of fewer than 400 bytes", async () => {
    const { root } = await mountForm({ ...POPUP, header: { version: "1" }, allSettingsUrl: "o" });
    const svg = root.querySelector(".sar-gear svg");
    expect(svg?.querySelectorAll("*")).toHaveLength(1);
    expect(svg?.outerHTML.length).toBeLessThan(400);
  });

  it("renders no header or gear by default", async () => {
    const { root } = await setup(POPUP);
    expect(root.querySelector(".sar-options-header")).toBeNull();
    expect(root.querySelector(".sar-gear")).toBeNull();
  });

  it("reads Spanish from the shipped catalog, down to the titles and the tab labels", async () => {
    const spanish = createI18n(SHIPPED_CATALOGS, "es");
    const { panel, tab, tabIds } = await mountForm({ i18n: spanish, locales: ["en", "es"] });
    const chips = KINDS.map((kind) => ({ id: kind.id, label: spanish.t(kind.messages.chip) }));
    expect(tabIds()).toEqual(sortTabs(chips, "es"));
    expect(tab(GENERAL_TAB).textContent).toBe(spanish.t("options_tab_general"));
    for (const kind of KINDS) {
      expect(panel(kind.id).querySelector(".sar-card-title")?.textContent).toBe(
        spanish.t(kind.messages.heading),
      );
    }
    expect(panel("ai").textContent).toContain(spanish.t("options_kind_enabled"));
    expect(spanish.t("kind_ai_heading")).not.toBe(i18n.t("kind_ai_heading"));
  });
});

describe("the toolbar popup", () => {
  const rows = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(".sar-kind-row")];
  const row = (root: HTMLElement, id: KindId): HTMLElement => {
    const found = rows(root).find((each) =>
      each.querySelector(`[data-sar-open-tab="${id}"]`) !== null
    );
    if (found === undefined) {
      throw new TypeError(id);
    }
    return found;
  };
  const popup = (overrides: Partial<SettingsFormDeps> = {}) =>
    setup({ ...POPUP, allSettingsUrl: "options.html", ...overrides });

  it("shows one row per tag, in the order of the tabs, and nothing else to set", async () => {
    const { root } = await popup();
    const chips = KINDS.map((kind) => ({ id: kind.id, label: i18n.t(kind.messages.chip) }));
    const ids = rows(root).map((each) =>
      each.querySelector("[data-sar-open-tab]")?.getAttribute("data-sar-open-tab")
    );
    expect(ids).toEqual(sortTabs(chips, "en").slice(1));
    const settings = new Set(
      [...root.querySelectorAll("[data-sar-setting]")].map((each) =>
        each.getAttribute("data-sar-setting")
      ),
    );
    expect(settings).toEqual(new Set(["enabled", "filter"]));
    for (const absent of ["[role=tab]", "select", ".sar-allow-group", ".sar-empty", "section"]) {
      expect(root.querySelector(absent), absent).toBeNull();
    }
  });

  it("names and sorts a row by the person's chip text", async () => {
    const { root, settings } = await popup();
    await writeSettings(settings, withChipText(DEFAULT_SETTINGS, { pvp: { chip: "Aaa" } }));
    const first = rows(root)[0];
    expect(first?.querySelector("[data-sar-open-tab]")?.getAttribute("data-sar-open-tab")).toBe(
      "pvp",
    );
    expect(first?.querySelector(".sar-tab-label")?.textContent).toBe("Aaa");
  });

  it.each(KINDS.map((kind) => kind.id))(
    "links %s's name to its tab and names its switch and filter by it",
    async (id) => {
      const { root } = await popup();
      const link = row(root, id).querySelector("a");
      expect(link?.getAttribute("href")).toBe(`options.html#tab=${id}`);
      expect(link?.getAttribute("target")).toBe("_blank");
      expect(link?.querySelector(".sar-vh")?.textContent).toBe(
        chipText(i18n, KIND_BY_ID[id], undefined, undefined).name,
      );
      const enabled = row(root, id).querySelector("[data-sar-setting=enabled]");
      expect(enabled?.getAttribute("role")).toBe("switch");
      expect(enabled?.getAttribute("aria-labelledby")).toBe(link?.id);
      const labels = row(root, id).querySelector("fieldset")?.getAttribute("aria-labelledby");
      const names = (labels ?? "").split(" ").map((each) => root.querySelector(`#${each}`));
      expect(names.map((name) => name?.textContent)).toEqual([
        link?.textContent,
        i18n.t("options_filter_label"),
      ]);
    },
  );

  it("saves the switch and the filter of a row, and disables the filter while off", async () => {
    const { root, settings } = await popup();
    const hide = row(root, "kernel").querySelector<HTMLInputElement>("[value=hide]");
    if (hide === null) {
      throw new TypeError();
    }
    hide.checked = true;
    change(hide);
    await vi.waitFor(async () => {
      expect(parseSettings(await settings.read()).kinds.kernel.filter).toBe("hide");
    });
    const enabled = row(root, "kernel").querySelector<HTMLInputElement>("[role=switch]");
    if (enabled === null) {
      throw new TypeError();
    }
    enabled.checked = false;
    change(enabled);
    await vi.waitFor(async () => {
      expect(parseSettings(await settings.read()).kinds.kernel.enabled).toBe(false);
    });
    expect(row(root, "kernel").querySelector("fieldset")?.disabled).toBe(true);
    expect(row(root, "pvp").querySelector("fieldset")?.disabled).toBe(true);
    expect(row(root, "ai").querySelector("fieldset")?.disabled).toBe(false);
  });

  it("hands a click on a tag's name to the page, which opens its tab", async () => {
    const openTab = vi.fn();
    const { root } = await popup({ openTab });
    const link = row(root, "drm").querySelector("a");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    link?.querySelector(".sar-tab-label")?.dispatchEvent(click);
    expect(openTab.mock.calls).toEqual([["drm"]]);
    expect(click.defaultPrevented).toBe(true);
  });

  it("leaves the link to the browser when the page has no way to open a tab", async () => {
    const { root } = await popup();
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    row(root, "drm").querySelector("a")?.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
  });

  it("reads no ignore list and no remembered tab", async () => {
    const lists = createIgnoreLists(memoryStore(), fixedClock(0));
    const store = countingStore(memoryStore());
    const reads = [lists.games, ...CREATOR_ROLES.map((role) => lists.creators[role])].map((list) =>
      vi.spyOn(list, "list")
    );
    const { form } = await popup({ lists, uiState: createUiState(store) });
    await form.refreshAllowList();
    expect(reads.flatMap((read) => read.mock.calls)).toEqual([]);
    expect(store.calls.get).toBe(0);
  });
});

describe("the accessible names of the controls", () => {
  it("names every card by its heading, with a heading of its own", async () => {
    const { root } = await setup();
    const sections = [...root.querySelectorAll<HTMLElement>("section.sar-card")];
    expect(sections.length).toBeGreaterThan(KINDS.length * 2);
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

  it("labels the badge switch shortly where space is tight", async () => {
    const { card } = await setup({ context: "popup" });
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

describe("the tabs", () => {
  it("shows General first, then each tag by its chip word in alphabetical order", async () => {
    const { tabIds, tab } = await setup();
    const chips = KINDS.map((kind) => ({ id: kind.id, label: i18n.t(kind.messages.chip) }));
    expect(tabIds()).toEqual(sortTabs(chips, "en"));
    expect(tabIds()[0]).toBe(GENERAL_TAB);
    expect(tab(GENERAL_TAB).textContent).toBe(i18n.t("options_tab_general"));
  });

  it.each(KINDS.map((kind) => kind.id))(
    "names the %s tab by its chip and Steam's line, then its state, the chip shown",
    async (id) => {
      const { tab } = await setup();
      const kind = KINDS.find((each) => each.id === id);
      const chip = i18n.t(kind?.messages.chip ?? "kind_ai_chip");
      const on = !OFF_KINDS.includes(id);
      const shown = tab(id).querySelector(".sar-tab-label");
      expect([shown?.textContent, shown?.getAttribute("aria-hidden")]).toEqual([chip, "true"]);
      expect(tab(id).querySelector(".sar-vh")?.textContent).toBe(
        chipText(i18n, KIND_BY_ID[id], undefined, undefined).name,
      );
      expect(tab(id).querySelector(".sar-tab-state")?.textContent).toBe(
        i18n.t(on ? "options_state_on" : "options_state_off"),
      );
    },
  );

  it("names and sorts a tab by the person's chip text, and the arrows follow", async () => {
    const { tab, tabIds, settings } = await setup();
    await writeSettings(settings, withChipText(DEFAULT_SETTINGS, { pvp: { chip: "Aaa" } }));
    expect(tabIds().slice(0, 2)).toEqual([GENERAL_TAB, "pvp"]);
    expect(tab("pvp").querySelector(".sar-tab-label")?.textContent).toBe("Aaa");
    expect(tab("pvp").querySelector(".sar-vh")?.textContent).toBe(
      i18n.t("kind_chip_name", { chip: "Aaa", heading: heading("pvp") }),
    );
    press(tab(GENERAL_TAB), "ArrowRight");
    expect(tab("pvp").getAttribute("aria-selected")).toBe("true");
  });

  it("follows the master switch on the tab, here and from another tab", async () => {
    const { tab, input, settings } = await setup();
    const state = (id: KindId) => tab(id).querySelector(".sar-tab-state");
    const master = input("ai", "enabled");
    master.checked = false;
    change(master);
    await vi.waitFor(() => {
      expect(state("ai")?.textContent).toBe(i18n.t("options_state_off"));
    });
    expect(state("ai")?.hasAttribute("data-sar-on")).toBe(false);
    await writeSettings(settings, withKind(DEFAULT_SETTINGS, "pvp", { enabled: true }));
    expect(state("pvp")?.textContent).toBe(i18n.t("options_state_on"));
    expect(state("pvp")?.hasAttribute("data-sar-on")).toBe(true);
  });

  it("keeps a tag that is off on its own tab, with only its master switch", async () => {
    const { tab, card } = await setup();
    expect(tab("pvp").hidden).toBe(false);
    tab("pvp").click();
    const shown = [...card("pvp").querySelectorAll<HTMLElement>("[data-sar-setting]")].filter(
      (control) => control.closest("[hidden]") === null,
    );
    expect(shown.map((control) => control.getAttribute("data-sar-setting"))).toEqual(["enabled"]);
  });

  it.each<[string, TabId | undefined, unknown, TabId]>([
    ["the fragment's tab over the stored one", "drm", { tab: "pvp" }, "drm"],
    ["the stored tab without a fragment", undefined, { tab: "pvp" }, "pvp"],
    ["General on a first visit", undefined, undefined, GENERAL_TAB],
    ["General for a stored tab it does not know", undefined, { tab: "gone" }, GENERAL_TAB],
    ["General for an older build's sections", undefined, { open: { ai: false } }, GENERAL_TAB],
  ])("opens on %s", async (_case, initialTab, stored, shown) => {
    const store = memoryStore(stored === undefined ? new Map() : new Map([[UI_STATE_KEY, stored]]));
    const { tab, panel } = await setup({
      uiState: createUiState(store),
      ...(initialTab === undefined ? {} : { initialTab }),
    });
    expect(tab(shown).getAttribute("aria-selected")).toBe("true");
    expect(panel(shown).hidden).toBe(false);
    expect(document.querySelectorAll("[role=tabpanel]:not([hidden])")).toHaveLength(1);
  });

  it("opens on General and still works when the stored tab cannot be read", async () => {
    const store = countingStore(memoryStore());
    store.break();
    const { tab, input, settings } = await setup({ uiState: createUiState(store) });
    expect(tab(GENERAL_TAB).getAttribute("aria-selected")).toBe("true");
    const banner = input("ai", "banner");
    banner.checked = false;
    change(banner);
    await vi.waitFor(async () => {
      expect(parseSettings(await settings.read()).kinds.ai.banner).toBe(false);
    });
  });

  it("remembers a tab picked with a click and tells the page; opening writes nothing", async () => {
    const store = countingStore(memoryStore());
    const onTabChange = vi.fn();
    const { tab } = await setup({ uiState: createUiState(store), onTabChange });
    expect(store.calls.set).toBe(0);
    tab("eula").click();
    tab("eula").click();
    await vi.waitFor(async () => {
      expect(await createUiState(store).read()).toBe("eula");
    });
    expect(store.calls.set).toBe(1);
    expect(onTabChange.mock.calls).toEqual([["eula"]]);
  });

  it("moves the selection and the focus with the arrow keys, and remembers it", async () => {
    const store = memoryStore();
    const { tab, tabIds } = await setup({ uiState: createUiState(store) });
    const [first, second] = tabIds();
    tab(GENERAL_TAB).focus();
    press(tab(GENERAL_TAB), "ArrowDown");
    expect(second).toBeDefined();
    expect(document.activeElement?.getAttribute("data-sar-tab")).toBe(second);
    press(document.activeElement ?? tab(GENERAL_TAB), "ArrowLeft");
    press(document.activeElement ?? tab(GENERAL_TAB), "End");
    expect(document.activeElement?.getAttribute("data-sar-tab")).toBe(tabIds().at(-1));
    expect(document.activeElement?.getAttribute("aria-selected")).toBe("true");
    expect(first).toBe(GENERAL_TAB);
    await vi.waitFor(async () => {
      expect(await createUiState(store).read()).toBe(tabIds().at(-1));
    });
  });

  it("shows a tab asked for from outside, and tells the page", async () => {
    const onTabChange = vi.fn();
    const { form, tab } = await setup({ onTabChange });
    form.selectTab("family");
    expect(tab("family").getAttribute("aria-selected")).toBe("true");
    expect(onTabChange).toHaveBeenCalledWith("family");
  });
});

describe("the ignored items", () => {
  it("lists each scope in its own card: all tags in General, each tag in its tab", async () => {
    const { ignored, names, root } = await setup();
    expect(names(ignored(ALLOW_ALL))).toEqual(["Every Game"]);
    expect(names(ignored("ai"))).toEqual(["Newer <b>Game</b>", "Older Game"]);
    expect(names(ignored("kernel"))).toEqual(["Older Game"]);
    expect(names(ignored("drm"))).toEqual(["Drm Game"]);
    expect(names(ignored("pvp"))).toEqual([]);
    expect(root.querySelector(".sar-allow-name b")).toBeNull();
    const captions = [...ignored("ai").querySelectorAll(".sar-allow-scope")];
    expect(captions.map((caption) => [caption.tagName, caption.textContent])).toEqual([
      ["H4", i18n.t("options_section_allow")],
    ]);
  });

  it("links each game to its store page and dates it", async () => {
    const { ignored } = await setup();
    const all = ignored(ALLOW_ALL);
    expect(all.querySelector(".sar-allow-name")?.getAttribute("href")).toBe(
      "https://store.steampowered.com/app/40/",
    );
    expect(all.querySelector(".sar-allow-meta")?.textContent).toBe(
      i18n.t("options_allow_since", { date: "Oct 3, 2026" }),
    );
  });

  it("names each quiet button by its item and its scope, so no two are alike", async () => {
    const { root } = await setup();
    const buttons = [...root.querySelectorAll("[data-sar-restore]")];
    const labels = buttons.map((button) => button.getAttribute("aria-label"));
    expect(labels).toContain(
      i18n.t("options_allow_restore_label", { name: "Older Game", scope: heading("ai") }),
    );
    expect(labels).toContain(
      i18n.t("options_allow_restore_label", {
        name: "Every Game",
        scope: i18n.t("options_allow_scope_all"),
      }),
    );
    expect(new Set(labels).size).toBe(labels.length);
    expect(buttons.every((button) => button.getAttribute("data-sar-variant") === "quiet")).toBe(
      true,
    );
    for (const group of root.querySelectorAll(".sar-allow-group")) {
      expect(group.getAttribute("role")).toBe("group");
      const title = group.querySelector(".sar-allow-scope");
      expect(group.getAttribute("aria-labelledby")).toBe(title?.id);
    }
  });

  it("stops ignoring for one tag only, and moves focus to the next item in the card", async () => {
    const { allowList, control } = await setup();
    control('[data-sar-restore="20"][data-sar-scope="ai"]').click();
    await vi.waitFor(async () => {
      expect([...(await allowList.list()).ai.keys()]).toEqual([10]);
    });
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(control('[data-sar-restore="10"][data-sar-scope="ai"]'));
    });
    expect([...(await allowList.list()).kernel.keys()]).toEqual([10]);
    expect(control("[aria-live]").textContent).toBe(
      i18n.t("notice_marking_restored_kind", { heading: heading("ai") }),
    );
  });

  it("shows the empty state once the last item goes, with focus on the card's title", async () => {
    const { control, ignored } = await setup();
    control('[data-sar-restore="30"][data-sar-scope="drm"]').click();
    await vi.waitFor(() => {
      expect(ignored("drm").querySelector(".sar-empty")).not.toBeNull();
    });
    expect(document.activeElement).toBe(ignored("drm").querySelector(".sar-card-title"));
  });

  it("says a game is no longer ignored for all tags when that was the scope", async () => {
    const { allowList, control } = await setup();
    control('[data-sar-restore="40"][data-sar-scope="all"]').click();
    await vi.waitFor(() => {
      expect(control("[aria-live]").textContent).toBe(i18n.t("notice_marking_restored"));
    });
    expect((await allowList.list()).ai.size).toBe(2);
  });

  it.each<[AllowScope, "banner_ignore" | "banner_ignore_kind"]>([
    [ALLOW_ALL, "banner_ignore"],
    ["pvp", "banner_ignore_kind"],
  ])("shows the empty state of %s with the label of its ignore button", async (of, action) => {
    const { ignored } = await setup({ lists: createIgnoreLists(memoryStore(), fixedClock(0)) });
    expect(ignored(of).querySelector(".sar-empty")?.textContent).toBe(
      i18n.t("options_allow_empty", { action: i18n.t(action) }),
    );
  });

  it("says that a list could not be read, not that nothing is ignored", async () => {
    const lists = createIgnoreLists(memoryStore(), fixedClock(0));
    vi.spyOn(lists.games, "list").mockRejectedValue(new Error());
    const { ignored } = await setup({ lists });
    for (const  of of[ALLOW_ALL, "drm"] as const) {
      expect(ignored(of).textContent).toContain(i18n.t("error_allow_list_load"));
      expect(ignored(of).querySelector(".sar-empty")).toBeNull();
    }
  });

  it("keeps an item and shows an error when stopping to ignore it fails", async () => {
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

  it("reads the lists again on request, for a change made in another tab", async () => {
    const { allowList, form, ignored, names } = await setup();
    await allowList.add("pvp", appId(50), "Fifty");
    await form.refreshAllowList();
    expect(names(ignored("pvp"))).toEqual(["Fifty"]);
  });

  it("reads each list once per refresh, however many cards draw it", async () => {
    const { lists, form } = await setup();
    const reads = [lists.games, ...CREATOR_ROLES.map((role) => lists.creators[role])].map((list) =>
      vi.spyOn(list, "list")
    );
    await form.refreshAllowList();
    expect(reads.map((read) => read.mock.calls.length)).toEqual([1, 1, 1]);
  });
});

describe("the note on what all tags ignore", () => {
  it("counts in each tag's card what all tags ignore, and General has no note", async () => {
    const { ignored, lists, form } = await setup();
    const note = (of: AllowScope) => ignored(of).querySelector(".sar-allow-note");
    for (const kind of KINDS) {
      expect(note(kind.id)?.firstChild?.textContent).toBe(i18n.plural("options_allow_all_note", 1));
    }
    expect(note(ALLOW_ALL)).toBeNull();
    await lists.creators.developer.add(ALLOW_ALL, keyOf("n:Studio"), "Studio");
    await form.refreshAllowList();
    expect(note("pvp")?.firstChild?.textContent).toBe(i18n.plural("options_allow_all_note", 2));
  });

  it("leads to the list in General with a button that changes no address", async () => {
    const { ignored, tab } = await setup();
    const show = ignored("ai").querySelector<HTMLElement>(".sar-allow-note button");
    expect(show?.textContent).toBe(i18n.t("options_allow_all_show"));
    expect(show?.getAttribute("data-sar-variant")).toBe("quiet");
    expect(show?.closest("a")).toBeNull();
    show?.click();
    expect(tab(GENERAL_TAB).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(ignored(ALLOW_ALL).querySelector(".sar-card-title"));
  });
});

describe("a failed read of the settings", () => {
  it("shows the defaults and an error above the tabs when settings cannot be read", async () => {
    const settings = createSettingsSource(memoryStore());
    vi.spyOn(settings, "read").mockRejectedValue(new Error());
    const { root } = await mountForm({ settings });
    const error = root.querySelector<HTMLElement>(":scope > .sar-field-error");
    expect(error?.hidden).toBe(false);
    expect(error?.textContent).toBe(i18n.t("error_settings_load"));
    expect(error?.nextElementSibling?.querySelector("[role=tablist]")).not.toBeNull();
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
    const { root } = await mountForm({ settings, locales: ["en", "es"] });
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
    const { root } = await mountForm({ settings });
    const banner = root.querySelector<HTMLInputElement>(
      "[data-sar-setting=banner][data-sar-for=ai]",
    );
    expect(banner?.disabled).toBe(true);
    await writeSettings(settings, withKind(DEFAULT_SETTINGS, "ai", { banner: false }));
    expect(banner?.disabled).toBe(false);
    expect(root.querySelector<HTMLElement>(":scope > .sar-field-error")?.hidden).toBe(true);
    expect(banner?.checked).toBe(false);
  });
});

describe("listeners", () => {
  it("listens on the root only, one listener per event type, until destroyed", async () => {
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
    const types = add.mock.calls.map(([type]) => type);
    expect(types.toSorted()).toEqual(["change", "click", "input", "keydown", "pointerdown"]);
    const remove = vi.spyOn(root, "removeEventListener");
    form.destroy();
    expect(remove.mock.calls.map(([type]) => type).toSorted()).toEqual(types.toSorted());
    expect(root.childElementCount).toBe(0);
  });
});

describe.each(CREATOR_ROLES)("the ignored %ss", (role) => {
  const developer = role === "developer";
  const caption = i18n.t(
    developer ? "options_section_allow_developers" : "options_section_allow_publishers",
  );
  const roleName = i18n.t(developer ? "banner_role_developer" : "banner_role_publisher");
  const stop = (key: string, scope: string) =>
    `[data-sar-list="allow-${role}s"][data-sar-restore="${key}"][data-sar-scope="${scope}"]`;
  const NAME = "Valve <b>Software</b>";

  /** A form whose list of this role holds two creators. */
  async function seeded() {
    const made = await setup();
    const list = made.lists.creators[role];
    await list.add("ai", keyOf("c:4"), NAME);
    await list.add(ALLOW_ALL, keyOf("n:Embark Studios"), "Embark Studios");
    await made.form.refreshAllowList();
    return { ...made, list };
  }

  /** The block of this role's list in a scope's card. */
  function block(section: HTMLElement): Element | undefined {
    return [...section.querySelectorAll(".sar-allow-group")].find((group) =>
      group.querySelector(".sar-allow-scope")?.textContent === caption
    );
  }

  it("lists the creators of each scope under their own caption, apart from the games", async () => {
    const { root, ignored } = await seeded();
    const names = (section: HTMLElement) =>
      [...(block(section)?.querySelectorAll(".sar-allow-name") ?? [])].map((name) => [
        name.tagName,
        name.textContent,
      ]);
    expect(names(ignored("ai"))).toEqual([["SPAN", NAME]]);
    expect(names(ignored(ALLOW_ALL))).toEqual([["SPAN", "Embark Studios"]]);
    expect(block(ignored("ai"))?.querySelector("a")).toBeNull();
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
    expect(root.querySelector(":scope > .sar-vh")?.textContent).toBe(
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
      expect(root.querySelector(":scope > .sar-vh")?.textContent).toBe(
        i18n.t("notice_creator_restored", { name: "Embark Studios", role: roleName }),
      );
    });
  });

  it("says that the list could not be read, not that nothing is ignored", async () => {
    const { lists, form, ignored } = await setup();
    vi.spyOn(lists.creators[role], "list").mockRejectedValue(new Error());
    await form.refreshAllowList();
    expect(block(ignored(ALLOW_ALL))?.textContent).toContain(i18n.t("error_creator_list_load"));
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
