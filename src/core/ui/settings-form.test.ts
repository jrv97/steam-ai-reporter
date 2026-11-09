import { afterEach, describe, expect, it, vi } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { englishI18n } from "../../../tests/helpers/i18n";
import {
  BANNERLESS_KINDS,
  isValveKind,
  OFF_KINDS,
  STATUS_KINDS,
  writeSettings,
} from "../../../tests/helpers/settings";
import { headingOf as heading, mountForm } from "../../../tests/helpers/settings-form";
import { CREATOR_ROLES, type CreatorRole } from "../creator";
import { SHIPPED_CATALOGS } from "../i18n/shipped";
import { type BareMessageKey, createI18n } from "../i18n/t";
import { createIgnoreLists } from "../ignored";
import type { JsonValue } from "../json";
import { KIND_IDS, type KindId } from "../kinds/id";
import { LIST_FILTERS } from "../kinds/kind-settings";
import { parseOrder } from "../kinds/order";
import { KIND_BY_ID, KINDS } from "../kinds/registry";
import { ALLOW_ALL, type AllowScope } from "../settings/allow-data";
import { DEFAULT_SETTINGS, parseSettings } from "../settings/settings";
import { createSettingsSource } from "../settings/settings-source";
import { LEGACY_SETTINGS_KEY, UI_STATE_KEY } from "../storage-keys";
import type { AppId } from "../types";
import { chipText } from "./kind-details";
import { DEFAULT_TAG_COLOR, type SettingsFormDeps } from "./settings-form";
import { TOKENS_CSS } from "./styles";
import { GENERAL_TAB, type TabId } from "./tab-id";
import { createUiState } from "./ui-state";

const i18n = englishI18n();
/** The toolbar popup: compact rows, no colors. */
const POPUP = { context: "popup", layout: "list", colors: false } as const;
/** The state a tab shows for a kind that is on or off. */
const STATE_KEYS = { true: "options_state_on", false: "options_state_off" } as const;

function isEventTarget(value: object): value is EventTarget {
  return "addEventListener" in value;
}

/** A game on an ignore list: its ID, its name and when it was ignored. */
interface IgnoredGame {
  readonly id: AppId;
  readonly name: string;
  readonly added: number;
}

function ignoredGame(name: string = make.text.name()): IgnoredGame {
  return { id: make.appId(), name, added: make.time() };
}

/** The selector of the button that stops ignoring a game or creator in a scope. */
function restore(key: AppId | string, scope: AllowScope): string {
  return `[data-sar-restore="${String(key)}"][data-sar-scope="${scope}"]`;
}

/** Fires the change event a user's click on the control would. */
function change(control: Element): void {
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Presses a key on an element, as the keyboard does on the focused one. */
function press(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

/** Settings on a store of their own whose every read rejects. */
function unreadableSettings() {
  const settings = createSettingsSource(fake.store());
  vi.spyOn(settings, "read").mockRejectedValue(new Error());
  return settings;
}

/** A form on stores of its own, with the games the tests ignore already listed. */
async function setup(overrides: Partial<SettingsFormDeps> = {}) {
  const clock = fake.clock(make.time());
  const store = fake.store();
  const settings = createSettingsSource(store);
  const lists = createIgnoreLists(fake.store(), clock);
  const allowList = lists.games;
  const games = {
    older: ignoredGame(),
    newer: ignoredGame(make.text.markup()),
    drm: ignoredGame(),
    every: ignoredGame(),
  };
  const ignore = async (scope: AllowScope, game: IgnoredGame) => {
    clock.set(game.added);
    await allowList.add(scope, game.id, game.name);
  };
  await ignore("ai", games.older);
  await ignore("ai", games.newer);
  await ignore("drm", games.drm);
  await ignore(ALLOW_ALL, games.every);
  await ignore("kernel", games.older);
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
    games,
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
      expect(input(kind.id, "banner").checked).toBe(
        !isValveKind(kind.id) && !BANNERLESS_KINDS.includes(kind.id),
      );
      expect(input(kind.id, "filter", "off").checked).toBe(true);
    }
  });

  it.each<
    readonly [KindId, BareMessageKey, string, readonly BareMessageKey[], readonly boolean[]]
  >([
    ...STATUS_KINDS.map((id) =>
      [
        id,
        "options_facet_label",
        "radio",
        ["kind_compat_verified", "kind_compat_playable", "kind_compat_unsupported"],
        [false, false, true],
      ] as const
    ),
    [
      "family",
      "options_facets_label",
      "checkbox",
      ["options_facet_available", "options_facet_unavailable"],
      [false, true],
    ],
  ])(
    "gives %s a group named %s of %s controls, one per value in its own words, the default on",
    async (id, name, type, words, ticked) => {
      const { card, root } = await setup();
      const group = card(id).querySelector("fieldset.sar-checks");
      const label = root.querySelector(`#${group?.getAttribute("aria-labelledby") ?? "x"}`);
      expect(label?.textContent).toBe(i18n.t(name));
      const boxes = [...(group?.querySelectorAll("input") ?? [])];
      expect(boxes.map((box) => box.type)).toEqual(words.map(() => type));
      expect(boxes.map((box) => box.closest("label")?.textContent)).toEqual(
        words.map((key) => i18n.t(key)),
      );
      expect(boxes.map((box) => box.checked)).toEqual(ticked);
    },
  );

  it.each(KINDS.filter((kind) => kind.facets !== undefined).map((kind) => kind.id))(
    "names each value checkbox of %s by its text, then Steam's line for the tag",
    async (id) => {
      const { card } = await setup();
      const boxes = [
        ...(card(id).querySelector("fieldset.sar-checks")?.querySelectorAll("input") ?? []),
      ];
      const tag = i18n.t(KIND_BY_ID[id].messages.heading);
      expect(boxes.length).toBeGreaterThan(0);
      expect(boxes.map((box) => box.getAttribute("aria-label"))).toEqual(
        boxes.map((box) =>
          i18n.t("options_facet_choice_label", {
            choice: box.closest("label")?.textContent ?? "",
            heading: tag,
          })
        ),
      );
    },
  );

  it("saves the one rating chosen, as one value, and leaves the other device alone", async () => {
    const { input, settings } = await setup();
    for (const value of ["playable", "verified"] as const) {
      const radio = input("deck", "facets", value);
      radio.checked = true;
      change(radio);
      await vi.waitFor(async () => {
        expect(parseSettings(await settings.read()).kinds.deck.tagged).toEqual(
          make.settings.tagged.one(value),
        );
      });
      expect(input("deck", "facets", "unsupported").checked).toBe(false);
    }
    expect(parseSettings(await settings.read()).kinds.machine.tagged).toEqual(
      make.settings.tagged.one("unsupported"),
    );
  });

  it("saves the ticked values in the kind's order, and none when all are unticked", async () => {
    const { input, settings } = await setup();
    const box = (value: string) => input("family", "facets", value);
    box("supported").checked = true;
    change(box("supported"));
    await vi.waitFor(async () => {
      expect(parseSettings(await settings.read()).kinds.family.tagged).toEqual(
        make.settings.tagged.many("supported", "unsupported"),
      );
    });
    for (const value of ["supported", "unsupported"]) {
      box(value).checked = false;
      change(box(value));
    }
    await vi.waitFor(async () => {
      expect(parseSettings(await settings.read()).kinds.family.tagged).toEqual(
        make.settings.tagged.many(),
      );
    });
  });

  it("shows the settings stored for each kind", async () => {
    const { settings, input } = await setup();
    await writeSettings(
      settings,
      make.settings({
        kinds: {
          kernel: { enabled: true, badge: false, banner: true, filter: "dim" },
          pvp: { enabled: false, badge: true, banner: false, filter: "hide" },
        },
      }),
    );
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

  it.each(KINDS.map((kind) => kind.id))(
    "keeps every control of %s in place, disabled, while its master switch is off",
    async (id) => {
      const { settings, card, input, tab } = await setup();
      await writeSettings(settings, make.settings.kind(id, { enabled: true }));
      const options = () => card(id).querySelector<HTMLFieldSetElement>(".sar-kind-options");
      const controlsOf = () => [...card(id).querySelectorAll("input, button")];
      const before = controlsOf();
      expect(options()?.disabled).toBe(false);
      await writeSettings(settings, make.settings.kind(id, { enabled: false, badge: false }));
      expect(controlsOf()).toStrictEqual(before);
      expect(options()?.disabled).toBe(true);
      expect(options()?.hidden).toBe(false);
      expect(tab(id).hidden).toBe(false);
      expect(options()?.contains(input(id, "badge"))).toBe(true);
      expect(input(id, "enabled").closest(".sar-kind-options")).toBeNull();
      await writeSettings(settings, make.settings.kind(id, { enabled: true, badge: false }));
      expect(options()?.disabled).toBe(false);
      expect(input(id, "badge").checked).toBe(false);
    },
  );

  it.each([["pvp", true], ["eula", false]] as const)(
    "turns %s from its master switch to %s, with its controls, and keeps every other setting",
    async (id, enabled) => {
      const { settings, card, input } = await setup();
      await writeSettings(settings, make.settings.kind(id, { filter: "dim" }));
      const options = () => card(id).querySelector<HTMLFieldSetElement>(".sar-kind-options");
      const master = input(id, "enabled");
      expect([master.checked, options()?.disabled]).toEqual([!enabled, enabled]);
      master.checked = enabled;
      change(master);
      await vi.waitFor(async () => {
        expect(parseSettings(await settings.read())).toStrictEqual(
          make.settings.kind(id, { enabled, filter: "dim" }),
        );
      });
      expect(options()?.disabled).toBe(!enabled);
    },
  );
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

  it.each(["badge", "banner"] as const)(
    "flips the %s of one kind and keeps every other stored setting",
    async (field) => {
      const { settings, input } = await setup();
      const stored = make.settings({ locale: "es", debug: true });
      await writeSettings(settings, stored);
      const switchInput = input("account", field);
      switchInput.checked = false;
      change(switchInput);
      await vi.waitFor(async () => {
        expect(parseSettings(await settings.read())).toStrictEqual(
          make.settings.kind("account", { [field]: false }, stored),
        );
      });
    },
  );

  it("sets a list filter the setting does not allow to its default and shows it", async () => {
    const { settings, input } = await setup();
    await writeSettings(settings, make.settings.kind("pvp", { filter: "dim" }));
    expect(input("pvp", "filter", "dim").checked).toBe(true);
    const radio = input("pvp", "filter", "hide");
    radio.value = make.text.name();
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
    badge.setAttribute("data-sar-for", make.text.name());
    change(badge);
    badge.setAttribute("data-sar-for", "drm");
    badge.setAttribute("data-sar-setting", make.text.name());
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

  it("follows a switch another tab stores, and leaves the other kinds' switches", async () => {
    const { settings, input } = await setup();
    await writeSettings(settings, make.settings.kind("kernel", { banner: false }));
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

    const PICKED = make.color();

    it.each<readonly [string, (form: Square) => void, string, string, readonly string[]]>([
      [
        "a typed hex",
        ({ text }) => {
          text.value = "#F0a";
          fire(text, "input");
        },
        "#ff00aa",
        "#F0a",
        [],
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
        [],
      ],
      [
        "a pick while the picker is open",
        ({ picker }) => {
          picker.value = PICKED;
          fire(picker, "input");
        },
        PICKED,
        PICKED,
        [],
      ],
      [
        "a pick the picker commits",
        ({ picker }) => {
          picker.value = PICKED;
          fire(picker, "change");
        },
        PICKED,
        PICKED,
        [PICKED],
      ],
    ])("keeps in step with the text after %s", async (_case, act, picked, typed, saved) => {
      const form = await square();
      const patch = vi.spyOn(form.settings, "patch");
      act(form);
      expect([form.picker.value, form.text.value]).toEqual([picked, typed]);
      expect(patch.mock.calls).toEqual(saved.map((color) => [{ kinds: { ai: { color } } }]));
    });

    it("goes back to the default violet on Reset", async () => {
      const { picker, settings, card } = await square();
      const color = make.color();
      await settings.patch({ kinds: { ai: { color } } });
      expect(picker.value).toBe(color);
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

  it("starts empty with no color set, and shows a stored color", async () => {
    const { root, settings, input, card } = await setup();
    expect(input("ai", "color").value).toBe("");
    expect(colorOf(root, "ai")).toBe("");
    expect(card("ai").querySelector<HTMLElement>("[data-sar-color-reset]")?.hidden).toBe(true);
    const color = make.color();
    await settings.patch({ kinds: { ai: { color } } });
    expect(input("ai", "color").value).toBe(color);
    expect(colorOf(root, "ai")).toBe(color);
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
    const color = make.color();
    field.value = color;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    expect(colorOf(root, "eula")).toBe(color);
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
    await settings.patch({ kinds: { pvp: { color: make.color() } } });
    typeColor(input("pvp", "color"), "  ");
    await vi.waitFor(async () => {
      expect(await storedColor(settings, "pvp")).toBeUndefined();
    });
    expect(colorOf(root, "pvp")).toBe("");
    expect(input("pvp", "color").value).toBe("");
  });

  it("resets from the quiet Reset button, whose name starts with its text", async () => {
    const { root, settings, card, input } = await setup();
    await settings.patch({ kinds: { account: { color: make.color() } } });
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

  it("applies the stored colors when it opens", async () => {
    const settings = createSettingsSource(fake.store());
    const color = make.color();
    await settings.patch({ kinds: { ai: { color } } });
    const { root } = await mountForm({ settings });
    expect(colorOf(root, "ai")).toBe(color);
  });

  it("follows a color another tab stores", async () => {
    const { root, settings, input } = await setup();
    const color = make.color();
    await settings.patch({ kinds: { ai: { color } } });
    expect(input("ai", "color").value).toBe(color);
    expect(colorOf(root, "ai")).toBe(color);
  });

  it("restores the stored color when the save fails", async () => {
    const { root, settings, card, input } = await setup();
    vi.spyOn(settings, "patch").mockRejectedValue(new Error());
    typeColor(input("ai", "color"), make.color());
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
});

describe("two forms over one store", () => {
  /** A form that is its own tab: its own settings source over the shared store. */
  async function tab(store: ReturnType<typeof fake.store>) {
    const settings = createSettingsSource(store);
    const { panel } = await mountForm({
      settings,
      lists: createIgnoreLists(store, fake.clock(make.time())),
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
    const store = fake.store();
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
    const store = fake.store();
    const first = await tab(store);
    const second = await tab(store);
    await writeSettings(
      createSettingsSource(store),
      make.settings({ kinds: { pvp: { filter: "hide" } }, locale: "es" }),
    );

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
    await writeSettings(settings, make.settings({ locale: "es" }));
    const picker = select();
    expect(picker.value).toBe("es");
    const option = document.createElement("option");
    option.value = make.text.name();
    picker.append(option);
    picker.value = option.value;
    change(picker);
    await vi.waitFor(async () => {
      expect(parseSettings(await settings.read()).locale).toBe("auto");
    });
    expect(picker.value).toBe("auto");
  });

  it("changes the language and leaves every kind alone", async () => {
    const { settings, select } = await setup();
    await writeSettings(settings, make.settings.kind("drm", { filter: "hide" }));
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
    const version = make.text.version();
    const iconUrl = make.text.url();
    const allSettingsUrl = make.text.url();
    const { root } = await mountForm({ ...POPUP, header: { version, iconUrl }, allSettingsUrl });
    const header = root.firstElementChild;
    expect(header?.matches("header.sar-options-header")).toBe(true);
    expect(header?.querySelector("h1")?.textContent).toBe(i18n.t("ext_name"));
    expect(header?.querySelector(".sar-options-version")?.textContent).toBe(
      i18n.t("options_version", { version }),
    );
    expect(header?.querySelector("img")?.getAttribute("src")).toBe(iconUrl);
    expect(header?.querySelector("img")?.getAttribute("alt")).toBe("");
    const gear = header?.querySelector("a.sar-gear");
    expect(gear?.getAttribute("aria-label")).toBe(i18n.t("options_all_settings"));
    expect(gear?.getAttribute("href")).toBe(allSettingsUrl);
    expect(gear?.getAttribute("target")).toBe("_blank");
    expect(gear?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(gear?.textContent).toBe("");
    expect(root.querySelector(".sar-options-footer a")).toBeNull();
    expect(header?.querySelector("button")).toBeNull();
  });

  it("keeps the gear small: one path of fewer than 400 bytes", async () => {
    const { root } = await mountForm({
      ...POPUP,
      header: { version: make.text.version() },
      allSettingsUrl: make.text.url(),
    });
    const svg = root.querySelector(".sar-gear svg");
    expect(svg?.querySelectorAll("*")).toHaveLength(1);
    expect(svg?.outerHTML.length).toBeLessThan(400);
  });

  it.each([
    ["a loaded page", () => createSettingsSource(fake.store())],
    ["a failed load", unreadableSettings],
  ])("draws the way back to the store at the header's end on %s", async (_name, settings) => {
    const goBack = vi.fn();
    const { root } = await mountForm({
      settings: settings(),
      header: { version: make.text.version() },
      goBack,
    });
    const back = root.querySelector<HTMLButtonElement>(".sar-options-header > button");
    expect(back).toBe(root.querySelector(".sar-options-header")?.lastElementChild);
    expect(back?.type).toBe("button");
    expect(back?.textContent).toBe(i18n.t("options_back_to_steam"));
    expect(back?.hasAttribute("aria-label")).toBe(false);
    expect(back?.disabled).toBe(false);
    back?.click();
    expect(goBack).toHaveBeenCalledTimes(1);
  });

  it("renders no header or gear by default", async () => {
    const { root } = await setup(POPUP);
    expect(root.querySelector(".sar-options-header")).toBeNull();
    expect(root.querySelector(".sar-gear")).toBeNull();
  });

  it("reads Spanish from the shipped catalog, down to the titles and the tab labels", async () => {
    const spanish = createI18n(SHIPPED_CATALOGS, "es");
    const { panel, tab, tabIds } = await mountForm({ i18n: spanish, locales: ["en", "es"] });
    expect(tabIds()).toEqual([GENERAL_TAB, ...KIND_IDS]);
    expect(tab(GENERAL_TAB).textContent).toBe(spanish.t("options_tab_general"));
    for (const kind of KINDS) {
      expect(tab(kind.id).querySelector(".sar-tab-label")?.textContent).toBe(
        spanish.t(kind.messages.heading),
      );
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
  const allSettingsUrl = make.text.url();
  const popup = (overrides: Partial<SettingsFormDeps> = {}) =>
    setup({ ...POPUP, allSettingsUrl, ...overrides });

  it("shows one row per tag, in the default order, and nothing else to set", async () => {
    const { root } = await popup();
    const ids = rows(root).map((each) =>
      each.querySelector("[data-sar-open-tab]")?.getAttribute("data-sar-open-tab")
    );
    expect(ids).toEqual(KIND_IDS);
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

  it("names a row by the person's chip text and keeps its place", async () => {
    const { root, settings } = await popup();
    const chip = make.chipText();
    await writeSettings(settings, make.settings.chipText({ pvp: { chip } }));
    expect(row(root, "pvp").querySelector(".sar-tab-label")?.textContent).toBe(chip);
    expect(rows(root).indexOf(row(root, "pvp"))).toBe(KIND_IDS.indexOf("pvp"));
  });

  it.each(KINDS.map((kind) => kind.id))(
    "links %s's name to its tab and names its switch and filter by it",
    async (id) => {
      const { root } = await popup();
      const link = row(root, id).querySelector("a");
      expect(link?.getAttribute("href")).toBe(`${allSettingsUrl}#tab=${id}`);
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

  it.each([
    [
      "a tag's name",
      (root: HTMLElement) => row(root, "drm").querySelector(".sar-tab-label"),
      "drm",
    ],
    ["the gear", (root: HTMLElement) => root.querySelector(".sar-gear svg"), undefined],
  ])("hands a click on %s to the page while the form still loads", async (_name, find, tab) => {
    const openSettings = vi.fn();
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const settings = createSettingsSource(fake.loggingStore(fake.store(), () => held));
    const mounting = popup({ openSettings, settings, header: { version: make.text.version() } });
    const target = await vi.waitFor(() => {
      const shown = find(document.body);
      if (shown === null) {
        throw new TypeError();
      }
      return shown;
    });
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    target.dispatchEvent(click);
    release();
    await mounting;
    expect(openSettings.mock.calls).toEqual([[tab]]);
    expect(click.defaultPrevented).toBe(true);
  });

  it.each([
    ["a tag's name", (root: HTMLElement) => row(root, "drm").querySelector("a")],
    ["the gear", (root: HTMLElement) => root.querySelector("a.sar-gear")],
  ])("leaves %s to the browser when the page has no way to open the settings", async (_n, find) => {
    const { root } = await popup({ header: { version: make.text.version() } });
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    find(root)?.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
  });

  it("reads no ignore list and no remembered tab", async () => {
    const lists = createIgnoreLists(fake.store(), fake.clock(make.time()));
    const store = fake.countingStore(fake.store());
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

/** Each surface that lists the tags, with the ids it shows from the first tag on. */
const SURFACES: readonly (readonly [
  string,
  Partial<SettingsFormDeps>,
  (root: HTMLElement) => readonly (string | null)[],
])[] = [
  [
    "the tabs",
    {},
    (root) =>
      [...root.querySelectorAll("[role=tab]")].slice(1).map((each) =>
        each.getAttribute("data-sar-tab")
      ),
  ],
  [
    "the popup rows",
    { ...POPUP, allSettingsUrl: make.text.url() },
    (root) =>
      [...root.querySelectorAll("[data-sar-open-tab]")].map((each) =>
        each.getAttribute("data-sar-open-tab")
      ),
  ],
];

describe("the tag order", () => {
  const MOVED = parseOrder(["pvp", "family", "drm"]);
  const collator = new Intl.Collator("en");

  it.each(SURFACES)("%s start alphabetical by Steam's heading", async (_name, deps, ids) => {
    const { root } = await setup(deps);
    expect(ids(root)).toEqual(
      KIND_IDS.toSorted((a, b) => collator.compare(heading(a), heading(b))),
    );
  });

  it.each(SURFACES)(
    "%s follow the stored order, and the default after a reset",
    async (_name, deps, ids) => {
      const source = createSettingsSource(fake.store());
      await writeSettings(source, make.settings({ order: MOVED }));
      const { root } = await setup({ ...deps, settings: source });
      expect(ids(root)).toEqual(MOVED);
      await writeSettings(source, make.settings({ order: ["machine"] }));
      expect(ids(root).slice(0, 2)).toEqual(["machine", KIND_IDS[0]]);
      await writeSettings(source, DEFAULT_SETTINGS);
      expect(ids(root)).toEqual(KIND_IDS);
    },
  );
});

describe("the tabs", () => {
  it("shows General first, built apart from the tags, then each tag by default", async () => {
    const { tabIds, tab } = await setup();
    expect(tabIds()).toEqual([GENERAL_TAB, ...KIND_IDS]);
    expect(tab(GENERAL_TAB).textContent).toBe(i18n.t("options_tab_general"));
    expect(tab(GENERAL_TAB).classList.contains("sar-tab-general")).toBe(true);
    expect(tab(GENERAL_TAB).querySelector(".sar-tab-state")).toBeNull();
    for (const id of KIND_IDS) {
      expect(tab(id).classList.contains("sar-tab-general")).toBe(false);
      expect(tab(id).querySelector(".sar-tab-state")).not.toBeNull();
    }
  });

  it.each(KINDS.map((kind) => kind.id))(
    "names the %s tab by Steam's heading, then its state, whatever the chip says",
    async (id) => {
      const { tab, settings } = await setup();
      const chip = make.chipText();
      await writeSettings(settings, make.settings.chipText({ [id]: { chip } }));
      expect(tab(id).querySelector(".sar-tab-label")?.textContent).toBe(heading(id));
      expect(tab(id).querySelector(".sar-vh")).toBeNull();
      expect(tab(id).querySelector(".sar-tab-state")?.textContent).toBe(
        i18n.t(STATE_KEYS[`${DEFAULT_SETTINGS.kinds[id].enabled}`]),
      );
      expect(tab(id).textContent).not.toContain(chip);
    },
  );

  it("moves the arrows along the tag order", async () => {
    const { tab, tabIds, settings } = await setup();
    await writeSettings(settings, make.settings({ order: ["pvp"] }));
    expect(tabIds().slice(0, 2)).toEqual([GENERAL_TAB, "pvp"]);
    tab(GENERAL_TAB).focus();
    press(tab(GENERAL_TAB), "ArrowRight");
    expect(document.activeElement).toBe(tab("pvp"));
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
    await writeSettings(settings, make.settings.kind("pvp", { enabled: true }));
    expect(state("pvp")?.textContent).toBe(i18n.t("options_state_on"));
    expect(state("pvp")?.hasAttribute("data-sar-on")).toBe(true);
  });

  it.each<[string, Partial<SettingsFormDeps>, readonly (readonly [string, JsonValue])[], TabId]>([
    ["the fragment's tab over the stored one", { initialTab: "drm" }, [[UI_STATE_KEY, {
      tab: "pvp",
    }]], "drm"],
    ["the stored tab without a fragment", {}, [[UI_STATE_KEY, { tab: "pvp" }]], "pvp"],
    ["General on a first visit", {}, [], GENERAL_TAB],
    [
      "General for a stored tab it does not know",
      {},
      [[UI_STATE_KEY, { tab: "gone" }]],
      GENERAL_TAB,
    ],
    [
      "General for an older build's sections",
      {},
      [[UI_STATE_KEY, { open: { ai: false } }]],
      GENERAL_TAB,
    ],
  ])("opens on %s", async (_case, deps, stored, shown) => {
    const { tab, panel } = await setup({
      uiState: createUiState(fake.store(new Map(stored))),
      ...deps,
    });
    expect(tab(shown).getAttribute("aria-selected")).toBe("true");
    expect(panel(shown).hidden).toBe(false);
    expect(document.querySelectorAll("[role=tabpanel]:not([hidden])")).toHaveLength(1);
  });

  it("opens on General and still works when the stored tab cannot be read", async () => {
    const store = fake.countingStore(fake.store());
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
    const store = fake.countingStore(fake.store());
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

  it("moves focus with the arrows, selects with Enter or Space, and remembers it", async () => {
    const store = fake.store();
    const onTabChange = vi.fn();
    const { tab, tabIds } = await setup({ uiState: createUiState(store), onTabChange });
    const [first, second] = tabIds();
    const last = tabIds().at(-1);
    tab(GENERAL_TAB).focus();
    press(tab(GENERAL_TAB), "ArrowDown");
    expect(document.activeElement?.getAttribute("data-sar-tab")).toBe(second);
    press(document.activeElement ?? tab(GENERAL_TAB), "End");
    expect(document.activeElement?.getAttribute("data-sar-tab")).toBe(last);
    expect(document.activeElement?.getAttribute("aria-selected")).toBe("false");
    expect(tab(GENERAL_TAB).getAttribute("aria-selected")).toBe("true");
    expect(onTabChange).not.toHaveBeenCalled();
    press(document.activeElement ?? tab(GENERAL_TAB), "Enter");
    expect(document.activeElement?.getAttribute("aria-selected")).toBe("true");
    expect(tab(GENERAL_TAB).getAttribute("aria-selected")).toBe("false");
    expect(first).toBe(GENERAL_TAB);
    await vi.waitFor(async () => {
      expect(await createUiState(store).read()).toBe(last);
    });
    expect(onTabChange.mock.calls).toEqual([[last]]);
    press(tab(GENERAL_TAB), " ");
    expect(tab(GENERAL_TAB).getAttribute("aria-selected")).toBe("true");
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
    const { ignored, names, root, games } = await setup();
    expect(names(ignored(ALLOW_ALL))).toEqual([games.every.name]);
    expect(names(ignored("ai"))).toEqual([games.newer.name, games.older.name]);
    expect(names(ignored("kernel"))).toEqual([games.older.name]);
    expect(names(ignored("drm"))).toEqual([games.drm.name]);
    expect(names(ignored("pvp"))).toEqual([]);
    expect(root.querySelector(".sar-allow-name b")).toBeNull();
    const captions = [...ignored("ai").querySelectorAll(".sar-allow-scope")];
    expect(captions.map((caption) => [caption.tagName, caption.textContent])).toEqual([
      ["H4", i18n.t("options_section_allow")],
    ]);
  });

  it("links each game to its store page and dates it", async () => {
    const { ignored, games } = await setup();
    const all = ignored(ALLOW_ALL);
    expect(all.querySelector(".sar-allow-name")?.getAttribute("href")).toBe(
      `https://store.steampowered.com/app/${String(games.every.id)}/`,
    );
    const date = new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(games.every.added);
    expect(all.querySelector(".sar-allow-meta")?.textContent).toBe(
      i18n.t("options_allow_since", { date }),
    );
  });

  it("names each quiet button by its item and its scope, so no two are alike", async () => {
    const { root, games } = await setup();
    const buttons = [...root.querySelectorAll("[data-sar-restore]")];
    const labels = buttons.map((button) => button.getAttribute("aria-label"));
    expect(labels).toContain(
      i18n.t("options_allow_restore_label", { name: games.older.name, scope: heading("ai") }),
    );
    expect(labels).toContain(
      i18n.t("options_allow_restore_label", {
        name: games.every.name,
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
    const { allowList, control, games } = await setup();
    control(restore(games.newer.id, "ai")).click();
    await vi.waitFor(async () => {
      expect([...(await allowList.list()).ai.keys()]).toEqual([games.older.id]);
    });
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(control(restore(games.older.id, "ai")));
    });
    expect([...(await allowList.list()).kernel.keys()]).toEqual([games.older.id]);
    expect(control("[aria-live]").textContent).toBe(
      i18n.t("notice_marking_restored_kind", { heading: heading("ai") }),
    );
  });

  it("shows the empty state once the last item goes, with focus on the card's title", async () => {
    const { control, ignored, games } = await setup();
    control(restore(games.drm.id, "drm")).click();
    await vi.waitFor(() => {
      expect(ignored("drm").querySelector(".sar-empty")).not.toBeNull();
    });
    expect(document.activeElement).toBe(ignored("drm").querySelector(".sar-card-title"));
  });

  it("says a game is no longer ignored for all tags when that was the scope", async () => {
    const { allowList, control, games } = await setup();
    control(restore(games.every.id, ALLOW_ALL)).click();
    await vi.waitFor(() => {
      expect(control("[aria-live]").textContent).toBe(i18n.t("notice_marking_restored"));
    });
    expect((await allowList.list()).ai.size).toBe(2);
  });

  it.each<[AllowScope, "banner_ignore" | "banner_ignore_kind"]>([
    [ALLOW_ALL, "banner_ignore"],
    ["pvp", "banner_ignore_kind"],
  ])("shows the empty state of %s with the label of its ignore button", async (of, action) => {
    const { ignored } = await setup({
      lists: createIgnoreLists(fake.store(), fake.clock(make.time())),
    });
    expect(ignored(of).querySelector(".sar-empty")?.textContent).toBe(
      i18n.t("options_allow_empty", { action: i18n.t(action) }),
    );
  });

  it("says that a list could not be read, not that nothing is ignored", async () => {
    const lists = createIgnoreLists(fake.store(), fake.clock(make.time()));
    vi.spyOn(lists.games, "list").mockRejectedValue(new Error());
    const { ignored } = await setup({ lists });
    for (const  of of[ALLOW_ALL, "drm"] as const) {
      expect(ignored(of).textContent).toContain(i18n.t("error_allow_list_load"));
      expect(ignored(of).querySelector(".sar-empty")).toBeNull();
    }
  });

  it("keeps an item and shows an error when stopping to ignore it fails", async () => {
    const { allowList, control, games } = await setup();
    vi.spyOn(allowList, "remove").mockRejectedValue(new Error());
    const button = control(restore(games.newer.id, "ai"));
    button.click();
    const error = button.parentElement?.querySelector<HTMLElement>(".sar-field-error");
    await vi.waitFor(() => {
      expect(error?.hidden).toBe(false);
    });
    expect(error?.textContent).toBe(i18n.t("error_allow_list_save"));
  });

  it("reads the lists again on request, for a change made in another tab", async () => {
    const { allowList, form, ignored, names } = await setup();
    const game = ignoredGame();
    await allowList.add("pvp", game.id, game.name);
    await form.refreshAllowList();
    expect(names(ignored("pvp"))).toEqual([game.name]);
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
    const studio = make.creator.of(make.text.creator());
    await lists.creators.developer.add(ALLOW_ALL, studio.key, studio.name);
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
    const { root } = await mountForm({ settings: unreadableSettings() });
    const error = root.querySelector<HTMLElement>(":scope > .sar-field-error");
    expect(error?.hidden).toBe(false);
    expect(error?.textContent).toBe(i18n.t("error_settings_load"));
    expect(error?.nextElementSibling?.querySelector("[role=tablist]")).not.toBeNull();
    expect(
      root.querySelector<HTMLInputElement>("[data-sar-setting=banner]")?.checked,
    ).toBe(true);
  });

  it("keeps the controls off after a failed load, so v1 can still migrate", async () => {
    const inner = fake.store(new Map([[LEGACY_SETTINGS_KEY, make.raw.v1CustomSettings()]]));
    const store = fake.countingStore(inner);
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
    expect(await inner.keys()).toStrictEqual([LEGACY_SETTINGS_KEY]);
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
    const settings = createSettingsSource(fake.store());
    vi.spyOn(settings, "read").mockRejectedValueOnce(new Error());
    const { root } = await mountForm({ settings });
    const banner = root.querySelector<HTMLInputElement>(
      "[data-sar-setting=banner][data-sar-for=ai]",
    );
    expect(banner?.disabled).toBe(true);
    await writeSettings(settings, make.settings.kind("ai", { banner: false }));
    expect(banner?.disabled).toBe(false);
    expect(root.querySelector<HTMLElement>(":scope > .sar-field-error")?.hidden).toBe(true);
    expect(banner?.checked).toBe(false);
  });
});

describe("listeners", () => {
  it("listens on the root, one per event type, and on the tab list for keys", async () => {
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
    const list = root.querySelector("[role=tablist]");
    expect(new Set(add.mock.contexts)).toEqual(new Set([root, list]));
    const typesOn = (target: unknown) =>
      add.mock.calls.flatMap(([type], at) => (add.mock.contexts[at] === target ? [type] : []));
    expect(typesOn(root).toSorted()).toEqual(
      ["change", "click", "input", "keydown", "pointerdown"],
    );
    expect(typesOn(list)).toEqual(["keydown"]);
    const remove = vi.spyOn(root, "removeEventListener");
    form.destroy();
    expect(remove.mock.calls.map(([type]) => type).toSorted()).toEqual(typesOn(root).toSorted());
    expect(root.childElementCount).toBe(0);
  });
});

/** The caption of each role's list and the role's own name. */
const ROLE_WORDS = {
  developer: { caption: "options_section_allow_developers", role: "banner_role_developer" },
  publisher: { caption: "options_section_allow_publishers", role: "banner_role_publisher" },
} as const satisfies Record<CreatorRole, Record<"caption" | "role", BareMessageKey>>;

describe.each(CREATOR_ROLES)("the ignored %ss", (role) => {
  const caption = i18n.t(ROLE_WORDS[role].caption);
  const roleName = i18n.t(ROLE_WORDS[role].role);
  const stop = (key: string, scope: AllowScope) =>
    `[data-sar-list="allow-${role}s"]${restore(key, scope)}`;
  /** One creator keyed by clan, named with markup, and one keyed by name. */
  const byClan = make.creator.of([make.text.markup(), make.creator.clan()]);
  const byName = make.creator.of(make.text.creator());

  /** A form whose list of this role holds two creators. */
  async function seeded() {
    const made = await setup();
    const list = made.lists.creators[role];
    await list.add("ai", byClan.key, byClan.name);
    await list.add(ALLOW_ALL, byName.key, byName.name);
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
    expect(names(ignored("ai"))).toEqual([["SPAN", byClan.name]]);
    expect(names(ignored(ALLOW_ALL))).toEqual([["SPAN", byName.name]]);
    expect(block(ignored("ai"))?.querySelector("a")).toBeNull();
    expect(root.querySelectorAll('[data-sar-list="allow"]')).toHaveLength(5);
    const ids = [...root.querySelectorAll("[role=group]")].map((group) =>
      group.getAttribute("aria-labelledby")
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("stops ignoring one creator without touching the other lists, and announces it", async () => {
    const { root, list, control } = await seeded();
    control(stop(byClan.key, "ai")).click();
    await vi.waitFor(async () => {
      expect((await list.list()).ai.size).toBe(0);
    });
    expect([...(await list.list())[ALLOW_ALL].keys()]).toEqual([byName.key]);
    expect(root.querySelectorAll('[data-sar-list="allow"]')).toHaveLength(5);
    expect(root.querySelector(":scope > .sar-vh")?.textContent).toBe(
      i18n.t("notice_creator_restored_kind", {
        name: byClan.name,
        role: roleName,
        heading: heading("ai"),
      }),
    );
  });

  it("names the role and not the tag when it stops ignoring a creator for all tags", async () => {
    const { root, control } = await seeded();
    control(stop(byName.key, ALLOW_ALL)).click();
    await vi.waitFor(() => {
      expect(root.querySelector(":scope > .sar-vh")?.textContent).toBe(
        i18n.t("notice_creator_restored", { name: byName.name, role: roleName }),
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
    const button = control(stop(byClan.key, "ai"));
    button.click();
    const error = button.parentElement?.querySelector<HTMLElement>(".sar-field-error");
    await vi.waitFor(() => {
      expect(error?.hidden).toBe(false);
    });
    expect(error?.textContent).toBe(i18n.t("error_creator_list_save"));
    expect((await list.list()).ai.size).toBe(1);
  });
});
