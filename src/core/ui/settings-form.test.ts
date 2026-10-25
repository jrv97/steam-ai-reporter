import { afterEach, describe, expect, it, vi } from "vitest";
import { countingStore } from "../../../tests/helpers/counting-store";
import { fixedClock } from "../../../tests/helpers/fixed-clock";
import { englishI18n } from "../../../tests/helpers/i18n";
import { memoryStore } from "../../../tests/helpers/memory-store";
import { SHIPPED_CATALOGS } from "../i18n/shipped";
import { createI18n } from "../i18n/t";
import type { KindId } from "../kinds/id";
import { LIST_FILTERS } from "../kinds/kind-settings";
import { KIND_BY_ID, KINDS } from "../kinds/registry";
import { ALLOW_ALL } from "../settings/allow-data";
import { createAllowList } from "../settings/allow-list";
import { DEFAULT_SETTINGS, parseSettings, withKind } from "../settings/settings";
import { createSettingsSource } from "../settings/settings-source";
import { toAppId } from "../types";
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
async function setup(context: SettingsContext = "page") {
  const clock = fixedClock(Date.UTC(2026, 9, 1));
  const store = memoryStore();
  const settings = createSettingsSource(store);
  const allowList = createAllowList(memoryStore(), clock);
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
  return { root, form, settings, allowList, store, control, card, input, select };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the section of each tag", () => {
  it("has one section per kind, in registry order, titled with Steam's line", async () => {
    const { root } = await setup();
    const titles = [...root.querySelectorAll("section.sar-card > .sar-card-title")].map((title) =>
      title.textContent
    );
    expect(titles.slice(0, KINDS.length)).toEqual(KINDS.map((kind) => heading(kind.id)));
    expect(titles.slice(0, 2)).toEqual([i18n.t("kind_ai_heading"), i18n.t("kind_kernel_heading")]);
  });

  it("holds a master switch, a badge, a banner entry and a list filter in each", async () => {
    const { card } = await setup();
    for (const kind of KINDS) {
      const section = card(kind.id);
      const settings = [...section.querySelectorAll("[data-sar-setting]")].map((control) =>
        control.getAttribute("data-sar-setting")
      );
      expect(settings).toEqual(["enabled", "badge", "banner", "filter", "filter", "filter"]);
      expect(
        [...section.querySelectorAll("[data-sar-setting]")].every((control) =>
          control.getAttribute("data-sar-for") === kind.id
        ),
      ).toBe(true);
    }
  });

  it("shows the defaults: on but PvP, badge and banner on, the list left alone", async () => {
    const { input } = await setup();
    for (const kind of KINDS) {
      expect(input(kind.id, "enabled").checked).toBe(kind.id !== "pvp");
      expect(input(kind.id, "badge").checked).toBe(true);
      expect(input(kind.id, "banner").checked).toBe(true);
      expect(input(kind.id, "filter", "off").checked).toBe(true);
    }
  });

  it("shows the settings stored for each kind", async () => {
    const { settings, input } = await setup();
    await settings.write({
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
    expect(control("[aria-live]").textContent).toBe(i18n.t("notice_settings_saved"));
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
    await settings.write({ ...DEFAULT_SETTINGS, locale: "es", debug: true });
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
    await settings.write(withKind(DEFAULT_SETTINGS, "pvp", { filter: "dim" }));
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
    await settings.write(withKind(DEFAULT_SETTINGS, "kernel", { banner: false }));
    expect(input("kernel", "banner").checked).toBe(false);
    expect(input("drm", "banner").checked).toBe(true);
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
      allowList: createAllowList(store, fixedClock(0)),
      context: "page",
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
    await createSettingsSource(store).write({
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
    await settings.write({ ...DEFAULT_SETTINGS, locale: "es" });
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
    await settings.write(withKind(DEFAULT_SETTINGS, "drm", { filter: "hide" }));
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
      allowList: createAllowList(memoryStore(), fixedClock(0)),
      context: "popup",
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
      allowList: createAllowList(memoryStore(), fixedClock(0)),
      context: "page",
      locales: ["en", "es"],
    });
    const titles = [...root.querySelectorAll("section.sar-card > .sar-card-title")].map((title) =>
      title.textContent
    );
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
      const fieldset = card(kind.id).querySelector("fieldset");
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
    expect(control("[aria-live]").textContent).toBe(i18n.t("notice_marking_restored"));
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
    expect(document.activeElement?.textContent).toBe(heading("pvp"));
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

  it("shows an empty list when the stored one cannot be read", async () => {
    const root = document.createElement("main");
    document.body.append(root);
    const allowList = createAllowList(memoryStore(), fixedClock(0));
    vi.spyOn(allowList, "list").mockRejectedValue(new Error());
    await mountSettingsForm(root, {
      i18n,
      settings: createSettingsSource(memoryStore()),
      allowList,
      context: "page",
      locales: ["en"],
    });
    expect(root.querySelector(".sar-empty")).not.toBeNull();
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
      allowList: createAllowList(memoryStore(), fixedClock(0)),
      context: "page",
      locales: ["en"],
    });
    const error = root.querySelector<HTMLElement>(".sar-card .sar-field-error");
    expect(error?.hidden).toBe(false);
    expect(error?.textContent).toBe(i18n.t("error_settings_load"));
    expect(error?.closest("section")?.querySelector(".sar-card-title")?.textContent).toBe(
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
      allowList: createAllowList(memoryStore(), fixedClock(0)),
      context: "page",
      locales: ["en", "es"],
    });
    const error = root.querySelector<HTMLElement>(".sar-card .sar-field-error");
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
      allowList: createAllowList(memoryStore(), fixedClock(0)),
      context: "page",
      locales: ["en"],
    });
    const banner = root.querySelector<HTMLInputElement>("[data-sar-setting=banner]");
    expect(banner?.disabled).toBe(true);
    await settings.write(withKind(DEFAULT_SETTINGS, "ai", { banner: false }));
    expect(banner?.disabled).toBe(false);
    expect(root.querySelector<HTMLElement>(".sar-card .sar-field-error")?.hidden).toBe(true);
    expect(banner?.checked).toBe(false);
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
