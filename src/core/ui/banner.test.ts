import { afterEach, describe, expect, it, vi } from "vitest";
import { setBody } from "../../../tests/helpers/dom";
import { make } from "../../../tests/helpers/factory";
import { bannerList } from "../../../tests/helpers/fixture-verdicts";
import { englishI18n } from "../../../tests/helpers/i18n";
import type { CreatorRole } from "../creator";
import { SHIPPED_CATALOGS } from "../i18n/shipped";
import { createI18n } from "../i18n/t";
import { KIND_BY_ID } from "../kinds/registry";
import type { AnyDisclosed } from "../kinds/verdicts";
import type { MessageCatalog } from "../ports";
import { ALLOW_ALL } from "../settings/allow-data";
import {
  type Banner,
  type BannerActions,
  type BannerOptions,
  type BannerView,
  createBanner,
  placeBanner,
} from "./banner";

function isEventTarget(value: object): value is EventTarget {
  return "addEventListener" in value;
}

const i18n = englishI18n();
const spanish = createI18n(SHIPPED_CATALOGS, "es");
const { app } = make.fixture;
const captured = make.fixture.verdicts;
/** The banner entries of a game with DRM, an account, a EULA and IAP. */
const SEVERAL = bannerList(captured(app.drmAccountEula));
/** Developer notes with markup and a CRLF break, and the text the banner shows for them. */
const NOTE_LINES = [make.text.markup(), make.text.note()];
const NOTES = NOTE_LINES.join("\r\n");
const SHOWN_NOTES = NOTE_LINES.join("\n");
/** A developer and publisher in the creators section, with a clan ID. */
const CREATOR_NAME = make.text.creator();
const CREATOR_SPEC = [CREATOR_NAME, make.creator.clan()] as const;
const DEVELOPER = make.creator.banner("developer", CREATOR_SPEC);
const PUBLISHER = make.creator.banner("publisher", CREATOR_SPEC);
const ROLE_KEY = {
  developer: "banner_role_developer",
  publisher: "banner_role_publisher",
} as const;

const heading = (verdict: AnyDisclosed) => i18n.t(KIND_BY_ID[verdict.kind].messages.heading);
const ignoredKind = (kind: "drm" | "pvp") =>
  i18n.t("banner_ignored_kind", { heading: i18n.t(KIND_BY_ID[kind].messages.heading) });
const role = (which: CreatorRole) => i18n.t(ROLE_KEY[which]);

function view(shown: readonly AnyDisclosed[], extra: Partial<BannerView> = {}): BannerView {
  return { shown, ignored: [], creators: [], creatorNotes: [], ...extra };
}

interface Pending {
  resolve(): void;
  reject(): void;
}

/** Actions whose promises the test settles by hand. A resolved action shows the owner's view. */
function manualActions() {
  const calls: Pending[] = [];
  let banner: Banner | undefined;
  let owner: BannerView | undefined;
  const settle = () =>
    new Promise<void>((resolve, reject) => {
      calls.push({
        resolve: () => {
          if (banner !== undefined && owner !== undefined) {
            banner.show(owner);
          }
          resolve();
        },
        reject: () => {
          reject(new Error());
        },
      });
    });
  const ignore = vi.fn(settle);
  const restore = vi.fn(settle);
  const ignoreCreator = vi.fn(settle);
  const restoreCreator = vi.fn(settle);
  const actions: BannerActions = { ignore, restore, ignoreCreator, restoreCreator };
  return {
    actions,
    ignore,
    restore,
    ignoreCreator,
    restoreCreator,
    calls,
    /** What the owner shows once the next action settles. */
    thenShow: (next: BannerView): void => {
      owner = next;
    },
    attach: (created: Banner): void => {
      banner = created;
    },
  };
}

function setup(
  options: BannerOptions = {},
  actions: BannerActions = manualActions().actions,
  catalog: MessageCatalog = i18n,
) {
  setBody('<div class="game_description_column"><div id="game_area_purchase"></div></div>');
  const frames: (() => void)[] = [];
  const banner = createBanner(document, catalog, actions, {
    frame: (callback) => frames.push(callback),
    ...options,
  });
  placeBanner(document, banner.host);
  const root = banner.host.shadowRoot;
  if (root === null) {
    throw new TypeError();
  }
  const runFrames = () => {
    for (const callback of frames.splice(0)) {
      callback();
    }
  };
  return { banner, root, runFrames };
}

/** A banner on actions the test settles by hand, showing `initial`. */
function wired(initial: BannerView) {
  const wiring = manualActions();
  const { banner, root } = setup({}, wiring.actions);
  wiring.attach(banner);
  banner.show(initial);
  return { ...wiring, banner, root };
}

function query(root: ShadowRoot, selector: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(selector);
  if (found === null) {
    throw new TypeError(selector);
  }
  return found;
}

/** The accessible name: the text of the elements `aria-labelledby` names, else `aria-label`. */
function nameOf(root: ShadowRoot, element: Element): string {
  const ids = element.getAttribute("aria-labelledby")?.split(" ") ?? [];
  if (ids.length > 0) {
    return ids.map((id) => root.getElementById(id)?.textContent ?? "").join(" ");
  }
  return element.getAttribute("aria-label") ?? element.textContent;
}

const texts = (root: ShadowRoot, selector: string) =>
  [...root.querySelectorAll(selector)].map((node) => node.textContent);

const withoutDrm = (shown: readonly AnyDisclosed[]) =>
  shown.filter((verdict) => verdict.kind !== "drm");

afterEach(() => {
  document.body.replaceChildren();
});

describe("createBanner", () => {
  it("renders the developer's notes verbatim, markup included, as plain text", () => {
    const { banner, root } = setup();
    banner.show(view([make.verdict.disclosed("ai", { notes: NOTES })]));
    const quote = query(root, "blockquote.sar-banner-quote");
    expect(quote.textContent).toBe(SHOWN_NOTES);
    expect(quote.children).toHaveLength(0);
  });

  it("uses catalog copy and the developer as the source", () => {
    const { banner, root } = setup();
    banner.show(view([make.verdict.disclosed("ai")]));
    expect(query(root, "h2").textContent).toBe(i18n.t("kind_ai_heading"));
    expect(query(root, ".sar-banner-source").textContent).toBe(i18n.t("banner_source"));
    expect(query(root, ".sar-banner-action").textContent).toBe(i18n.t("banner_ignore_kind"));
    expect(query(root, ".sar-banner-foot .sar-banner-link").textContent).toBe(
      i18n.t("banner_ignore"),
    );
    expect(root.querySelector("svg")).toBeNull();
  });

  it.each([["en", i18n], ["es", spanish]] as const)(
    "says in %s that a full game's disclosure is the full game's, before the developer's words",
    (_locale, catalog) => {
      const { banner, root } = setup({}, manualActions().actions, catalog);
      const service = make.text.service();
      const lent = make.verdict.lent(make.verdict.disclosed("ai", { notes: NOTES, service }));
      banner.show(view([lent, make.verdict.disclosed("anticheat")]));
      const lines = [...root.querySelectorAll(".sar-banner-entry")].map((entry) =>
        [...entry.querySelectorAll("p")].map((line) => line.textContent)
      );
      const full = [
        catalog.t("kind_full_game"),
        catalog.t("banner_source"),
        `${catalog.t("badge_card_service_label")} ${service}`,
      ];
      expect(lines).toEqual([full, []]);
      expect(root.querySelector("blockquote")?.textContent).toBe(SHOWN_NOTES);
    },
  );

  it("names the AI service as plain text, never a link", () => {
    const { banner, root } = setup();
    const service = make.text.markup();
    banner.show(view([make.verdict.disclosed("ai", { service })]));
    const line = query(root, ".sar-banner-service");
    expect(line.textContent).toBe(`${i18n.t("badge_card_service_label")} ${service}`);
    expect(line.querySelector("a, b")).toBeNull();
  });

  it("omits the service line when the developer named none", () => {
    const { banner, root } = setup();
    banner.show(view([make.verdict.disclosed("ai", { service: "" })]));
    expect(root.querySelector(".sar-banner-service")).toBeNull();
  });

  it("keeps long notes collapsed behind a toggle", () => {
    const { banner, root, runFrames } = setup({ overflows: () => true });
    banner.show(view([make.verdict.disclosed("ai")]));
    const quote = query(root, ".sar-banner-quote");
    const toggle = query(root, '[data-sar-action="toggle"]');
    expect(toggle.hidden).toBe(true);
    runFrames();
    expect(toggle.hidden).toBe(false);
    toggle.click();
    expect(quote.getAttribute("data-sar-collapsed")).toBe("false");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toBe(i18n.t("banner_collapse"));
    toggle.click();
    expect(quote.getAttribute("data-sar-collapsed")).toBe("true");
    expect(toggle.textContent).toBe(i18n.t("banner_expand"));
  });

  it("drops the clamp and the toggle for short notes", () => {
    const { banner, root, runFrames } = setup({ overflows: () => false });
    banner.show(view([make.verdict.disclosed("ai")]));
    runFrames();
    expect(query(root, ".sar-banner-quote").hasAttribute("data-sar-collapsed")).toBe(false);
    expect(root.querySelector('[data-sar-action="toggle"]')).toBeNull();
  });

  const ai = make.verdict.disclosed("ai");
  const ignoredRow = make.creator.banner("developer", CREATOR_SPEC, ["pvp"]);

  it.each([
    ["an ignored scope", view([ai]), view([ai]), view([ai], { ignored: ["ai"] })],
    [
      "a creator row",
      view(SEVERAL, { creators: [DEVELOPER] }),
      view(SEVERAL, { creators: [make.creator.banner("developer", CREATOR_SPEC)] }),
      view(SEVERAL, { creators: [ignoredRow] }),
    ],
    [
      "a creator note",
      view(SEVERAL, { creators: [ignoredRow] }),
      view(SEVERAL, { creators: [make.creator.banner("developer", CREATOR_SPEC, ["pvp"])] }),
      view(SEVERAL, {
        creators: [ignoredRow],
        creatorNotes: [make.creator.note("developer", CREATOR_SPEC, "pvp")],
      }),
    ],
  ])("keeps the drawing for an equal view and redraws for %s", (_name, first, same, changed) => {
    const { banner, root } = setup();
    banner.show(first);
    const aside = query(root, "aside");
    banner.show(same);
    expect(query(root, "aside")).toBe(aside);
    banner.show(changed);
    expect(query(root, "aside")).not.toBe(aside);
  });

  it("adds no listener to the nodes it draws", () => {
    const { banner } = setup();
    // happy-dom defines addEventListener on its own prototype; spy where it actually lives.
    let owner = Reflect.getPrototypeOf(document.createElement("div"));
    while (owner !== null && !Object.hasOwn(owner, "addEventListener")) {
      owner = Reflect.getPrototypeOf(owner);
    }
    if (owner === null || !isEventTarget(owner)) {
      throw new TypeError();
    }
    const add = vi.spyOn(owner, "addEventListener");
    banner.show(view(bannerList(captured(app.arcRaiders)), { ignored: ["pvp"] }));
    expect(add).not.toHaveBeenCalled();
  });
});

describe("the entries of the captured games", () => {
  it("leaves the short lines of a kind to Steam's own boxes and the hover card", () => {
    const { banner, root } = setup();
    banner.show(view(SEVERAL));
    expect(root.querySelector("a, blockquote, .sar-banner-service")).toBeNull();
    expect(root.textContent).not.toContain("Denuvo Anti-tamper");
    expect(root.textContent).not.toContain("Ubisoft Account");
    expect(root.textContent).not.toContain(i18n.t("kind_account_links"));
  });

  it.each([
    app.drmAccountEula,
    app.kernelBootProtection,
    app.easyAntiCheat,
    app.vac,
    app.pvp,
    app.pvpOther,
  ])("gives each kind of game %i one line: its heading and its ignore button", (id) => {
    const { banner, root } = setup();
    const shown = bannerList(captured(id));
    banner.show(view(shown));
    expect(texts(root, "h2")).toEqual(shown.map(heading));
    expect(root.querySelectorAll(".sar-banner-entry")).toHaveLength(shown.length);
    expect(root.querySelectorAll(".sar-banner-action")).toHaveLength(shown.length);
    expect(root.querySelector("p:not(.sar-banner-error)")).toBeNull();
  });

  it("quotes the AI notes of a game that also declares an anti-cheat and a EULA", () => {
    const { banner, root } = setup();
    const shown = bannerList(captured(app.arcRaiders));
    banner.show(view(shown));
    expect(texts(root, "h2")).toEqual([
      i18n.t("kind_ai_heading"),
      i18n.t("kind_iap_heading"),
      i18n.t("kind_pvp_heading"),
      i18n.t("kind_eula_heading"),
      i18n.t("kind_kernel_heading"),
    ]);
    const quotes = texts(root, "blockquote");
    expect(quotes).toHaveLength(1);
    expect(shown[0]).toMatchObject({ kind: "ai", notes: quotes[0] });
  });

  it("gives a quote an id of its own", () => {
    const { banner, root } = setup();
    banner.show(view([make.verdict.disclosed("ai")]));
    const quote = query(root, "blockquote");
    expect(query(root, '[data-sar-action="toggle"]').getAttribute("aria-controls")).toBe(quote.id);
    expect(root.querySelectorAll(`[id="${quote.id}"]`)).toHaveLength(1);
  });
});

describe("the banner's accessibility", () => {
  it("labels the region by its heading when it shows one kind", () => {
    const { banner, root } = setup();
    banner.show(view([make.verdict.disclosed("ai")]));
    const aside = query(root, "aside");
    expect(nameOf(root, aside)).toBe(i18n.t("kind_ai_heading"));
    expect(aside.hasAttribute("aria-label")).toBe(false);
    expect(aside.tabIndex).toBe(-1);
  });

  it.each(
    [
      ["for the developer when it shows several kinds", view(SEVERAL), "banner_region_label"],
      [
        "for the developer when it shows only notes",
        view([], { ignored: [ALLOW_ALL] }),
        "banner_region_label",
      ],
      [
        "as Tag Kit's tags when an entry comes from Valve",
        view([make.verdict.disclosed("drm"), make.verdict.disclosed("deck")]),
        "badge_tags_title",
      ],
    ] as const,
  )("labels the region %s", (_name, shown, key) => {
    const { banner, root } = setup();
    banner.show(shown);
    expect(nameOf(root, query(root, "aside"))).toBe(i18n.t(key));
  });

  it("names each ignore button by its action and the kind it belongs to", () => {
    const { banner, root } = setup();
    banner.show(view(SEVERAL));
    const buttons = [...root.querySelectorAll<HTMLButtonElement>(".sar-banner-action")];
    expect(buttons.map((button) => button.tagName)).toEqual([
      "BUTTON",
      "BUTTON",
      "BUTTON",
      "BUTTON",
    ]);
    expect(buttons.map((button) => nameOf(root, button))).toEqual([
      `${i18n.t("banner_ignore_kind")} ${i18n.t("kind_iap_heading")}`,
      `${i18n.t("banner_ignore_kind")} ${i18n.t("kind_drm_heading")}`,
      `${i18n.t("banner_ignore_kind")} ${i18n.t("kind_account_heading")}`,
      `${i18n.t("banner_ignore_kind")} ${i18n.t("kind_eula_heading")}`,
    ]);
    expect(new Set(buttons.map((button) => button.id)).size).toBe(4);
  });

  it("starts every accessible name with the visible text of its button", () => {
    const { banner, root } = setup();
    banner.show(view(SEVERAL, { ignored: ["pvp"] }));
    const controls = [...root.querySelectorAll("button")];
    expect(controls.length).toBeGreaterThan(4);
    for (const control of controls) {
      expect(nameOf(root, control).startsWith(control.textContent)).toBe(true);
    }
  });

  it.each(
    [
      ["a one-tag banner with its kind", view([make.verdict.disclosed("ai")]), "ai"],
      ["a several-tag banner with no kind", view(SEVERAL), null],
      [
        "a banner with only notes for ignored scopes with no kind",
        view([], { ignored: ["pvp"] }),
        null,
      ],
    ] as const,
  )("marks %s", (_name, shown, kind) => {
    const { banner, root } = setup();
    banner.show(shown);
    expect(query(root, "aside").getAttribute("data-sar-kind")).toBe(kind);
    expect(query(root, "aside").hasAttribute("style")).toBe(false);
  });

  it("steps the headings down when it lists several kinds", () => {
    const { banner, root } = setup();
    banner.show(view([make.verdict.disclosed("ai")]));
    expect(query(root, "aside").hasAttribute("data-sar-entries")).toBe(false);
    banner.show(view(SEVERAL));
    expect(query(root, "aside").getAttribute("data-sar-entries")).toBe("many");
  });
});

describe("the banner in Spanish", () => {
  it("reads every line of the entries and the buttons from the Spanish catalog", () => {
    const { banner, root } = setup({}, manualActions().actions, spanish);
    banner.show(view(SEVERAL, { ignored: ["pvp"] }));
    expect(texts(root, "h2")).toEqual(
      SEVERAL.map((verdict) => spanish.t(KIND_BY_ID[verdict.kind].messages.heading)),
    );
    expect(texts(root, ".sar-banner-action")).toEqual(
      SEVERAL.map(() => spanish.t("banner_ignore_kind")),
    );
    expect(texts(root, ".sar-banner-ignored-text")).toEqual([
      spanish.t("banner_ignored_kind", { heading: spanish.t("kind_pvp_heading") }),
    ]);
    expect(query(root, ".sar-banner-foot button").textContent).toBe(spanish.t("banner_ignore"));
    expect(spanish.t("banner_ignore_kind")).not.toBe(i18n.t("banner_ignore_kind"));
  });
});

describe("the notes for ignored scopes", () => {
  it("shows a game ignored for all tags as one line with Undo and nothing else", () => {
    const { banner, root } = setup();
    banner.show(view([], { ignored: [ALLOW_ALL] }));
    expect(query(root, "aside").getAttribute("data-sar-variant")).toBe("ignored");
    expect(query(root, ".sar-banner-ignored-text").textContent).toBe(i18n.t("banner_ignored"));
    expect(query(root, ".sar-banner-link").textContent).toBe(i18n.t("banner_undo"));
    expect(root.querySelector("blockquote, h2, .sar-banner-action, .sar-banner-foot")).toBeNull();
  });

  it("notes a kind ignored on its own beside the entries that remain", () => {
    const { banner, root } = setup();
    const rest = withoutDrm(SEVERAL);
    banner.show(view(rest, { ignored: ["drm"] }));
    expect(query(root, "aside").hasAttribute("data-sar-variant")).toBe(false);
    expect(texts(root, "h2")).toEqual(rest.map(heading));
    expect(query(root, ".sar-banner-ignored-text").textContent).toBe(ignoredKind("drm"));
    expect(nameOf(root, query(root, '[data-sar-action="undo"]'))).toBe(
      `${i18n.t("banner_undo")} ${ignoredKind("drm")}`,
    );
  });

  it("offers no ignore for all tags when no entry is left", () => {
    const { banner, root } = setup();
    banner.show(view([], { ignored: ["drm", "pvp"] }));
    expect(root.querySelector(".sar-banner-foot")).toBeNull();
    expect(texts(root, ".sar-banner-ignored-text")).toEqual([
      ignoredKind("drm"),
      ignoredKind("pvp"),
    ]);
  });
});

describe("ignoring from the banner", () => {
  it("ignores one kind, moves focus to its Undo and announces it", async () => {
    const { root, ignore, calls, thenShow } = wired(view(SEVERAL));
    thenShow(view(withoutDrm(SEVERAL), { ignored: ["drm"] }));

    query(root, '.sar-banner-action[data-sar-scope="drm"]').click();
    query(root, '.sar-banner-action[data-sar-scope="drm"]').click();
    expect(ignore).toHaveBeenCalledTimes(1);
    expect(ignore).toHaveBeenCalledWith("drm");
    calls[0]?.resolve();
    await vi.waitFor(() => {
      expect(root.querySelector('[data-sar-action="undo"][data-sar-scope="drm"]')).not.toBeNull();
    });
    expect(root.activeElement).toBe(query(root, '[data-sar-action="undo"]'));
    await vi.waitFor(() => {
      expect(query(root, "[aria-live]").textContent).toBe(
        i18n.t("notice_marking_stopped_kind", { heading: i18n.t("kind_drm_heading") }),
      );
    });
    expect(texts(root, "h2")).toEqual(withoutDrm(SEVERAL).map(heading));
  });

  it("ignores the game for all tags from the link below the entries", async () => {
    const { root, ignore, calls, thenShow } = wired(view(SEVERAL));
    thenShow(view([], { ignored: [ALLOW_ALL] }));

    query(root, '.sar-banner-foot [data-sar-action="ignore"]').click();
    expect(ignore).toHaveBeenCalledWith(ALLOW_ALL);
    calls[0]?.resolve();
    await vi.waitFor(() => {
      expect(query(root, "aside").getAttribute("data-sar-variant")).toBe("ignored");
    });
    expect(root.activeElement).toBe(query(root, '[data-sar-action="undo"]'));
    await vi.waitFor(() => {
      expect(query(root, "[aria-live]").textContent).toBe(i18n.t("notice_marking_stopped"));
    });
  });

  it("undoes an ignored kind and puts focus on its ignore button again", async () => {
    const { root, restore, calls, thenShow } = wired(
      view(withoutDrm(SEVERAL), { ignored: ["drm"] }),
    );
    thenShow(view(SEVERAL));

    query(root, '[data-sar-action="undo"]').click();
    expect(restore).toHaveBeenCalledWith("drm");
    calls[0]?.resolve();
    await vi.waitFor(() => {
      expect(texts(root, "h2")).toHaveLength(SEVERAL.length);
    });
    expect(root.activeElement).toBe(query(root, '.sar-banner-action[data-sar-scope="drm"]'));
    await vi.waitFor(() => {
      expect(query(root, "[aria-live]").textContent).toBe(
        i18n.t("notice_marking_restored_kind", { heading: i18n.t("kind_drm_heading") }),
      );
    });
  });

  it("undoes an ignore for all tags and focuses the ignore link", async () => {
    const { root, calls, thenShow } = wired(view([], { ignored: [ALLOW_ALL] }));
    thenShow(view(SEVERAL));

    query(root, '[data-sar-action="undo"]').click();
    calls[0]?.resolve();
    await vi.waitFor(() => {
      expect(root.querySelector("h2")).not.toBeNull();
    });
    expect(root.activeElement).toBe(query(root, '.sar-banner-foot [data-sar-action="ignore"]'));
  });

  it.each(
    [
      [
        "the ignore list",
        view([make.verdict.disclosed("ai")]),
        ".sar-banner-action",
        "error_allow_list_save",
        "blockquote",
      ],
      [
        "the creator list",
        view(SEVERAL, { creators: [DEVELOPER] }),
        ".sar-banner-creator button",
        "error_creator_list_save",
        ".sar-banner-creator",
      ],
    ] as const,
  )(
    "keeps the view and shows an alert when %s cannot be saved",
    async (_name, initial, button, error, kept) => {
      const { root, calls } = wired(initial);
      query(root, button).click();
      calls[0]?.reject();
      await vi.waitFor(() => {
        expect(query(root, ".sar-banner-error").hidden).toBe(false);
      });
      expect(query(root, ".sar-banner-error").textContent).toBe(i18n.t(error));
      expect(query(root, ".sar-banner-error").getAttribute("role")).toBe("alert");
      expect(root.querySelectorAll(kept)).toHaveLength(1);
    },
  );

  const kindView = view([make.verdict.disclosed("ai")]);
  const creatorView = view(SEVERAL, { creators: [DEVELOPER] });

  it.each([
    ["a scope", kindView, ".sar-banner-action", "data-sar-scope", "nothing"],
    ["an action", kindView, ".sar-banner-action", "data-sar-action", "other"],
    ["a role", creatorView, ".sar-banner-creator button", "data-sar-role", "other"],
    ["a key", creatorView, ".sar-banner-creator button", "data-sar-creator", CREATOR_NAME],
    [
      "a creator the view lacks",
      creatorView,
      ".sar-banner-creator button",
      "data-sar-creator",
      `c:${String(make.creator.clan())}`,
    ],
  ])("does nothing for %s it does not know", (_name, initial, button, attribute, value) => {
    const { root, ignore, restore, ignoreCreator, restoreCreator } = wired(initial);
    const control = query(root, button);
    control.setAttribute(attribute, value);
    control.click();
    expect(ignore).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
    expect(ignoreCreator).not.toHaveBeenCalled();
    expect(restoreCreator).not.toHaveBeenCalled();
  });
});

describe("placeBanner", () => {
  it("puts the banner first in the description column, above the purchase box", () => {
    setBody(make.page.app("5072580-ai-first.html"));
    const banner = createBanner(document, i18n, manualActions().actions);
    expect(placeBanner(document, banner.host)).toBe(true);
    const column = document.querySelector(".game_description_column");
    expect(column?.firstElementChild).toBe(banner.host);
    expect(banner.host.nextElementSibling?.id).toBe("game_area_purchase");
  });

  it("reports a page without the column", () => {
    setBody("<div></div>");
    const banner = createBanner(document, i18n, manualActions().actions);
    expect(placeBanner(document, banner.host)).toBe(false);
    expect(banner.host.isConnected).toBe(false);
  });
});

describe("the creators section", () => {
  const chip = (id: "ai" | "drm" | "account" | "iap") => i18n.t(KIND_BY_ID[id].messages.chip);

  const rows = (root: ShadowRoot) =>
    [...root.querySelectorAll(".sar-banner-creator")].map((row) => ({
      label: row.querySelector(".sar-banner-creator-label")?.textContent,
      buttons: [...row.querySelectorAll("button")].map((button) => button.textContent),
    }));

  it("is a closed section with a row for each name and role, and a button for each tag", () => {
    const { banner, root } = setup();
    banner.show(view(SEVERAL, { creators: [DEVELOPER, PUBLISHER] }));
    const section = query(root, "details.sar-banner-creators");
    expect(section.hasAttribute("open")).toBe(false);
    expect(query(root, "summary").textContent).toBe(i18n.t("banner_creators_toggle"));
    const tags = [
      i18n.t("banner_ignore_creator_kind", { chip: chip("iap") }),
      i18n.t("banner_ignore_creator_kind", { chip: chip("drm") }),
      i18n.t("banner_ignore_creator_kind", { chip: chip("account") }),
      i18n.t("banner_ignore_creator_kind", { chip: i18n.t("kind_eula_chip") }),
      i18n.t("banner_ignore_creator_all"),
    ];
    expect(rows(root)).toEqual([
      { label: `${CREATOR_NAME} ${role("developer")}`, buttons: tags },
      { label: `${CREATOR_NAME} ${role("publisher")}`, buttons: tags },
    ]);
  });

  it("names a button by its text and the creator's name and role", () => {
    const { banner, root } = setup();
    banner.show(view(SEVERAL, { creators: [DEVELOPER] }));
    const first = query(root, ".sar-banner-creator button");
    expect(nameOf(root, first)).toBe(`${first.textContent} ${CREATOR_NAME} ${role("developer")}`);
    const ids = [...root.querySelectorAll("[id]")].map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("leaves out the buttons for the scopes the creator is ignored in", () => {
    const { banner, root } = setup();
    const name = make.text.creator();
    const some = make.creator.banner("developer", name, ["drm"]);
    const all = make.creator.banner("publisher", name, [ALLOW_ALL]);
    banner.show(view(SEVERAL, { creators: [some, all] }));
    const [first, second] = rows(root);
    expect(first?.buttons).toHaveLength(4);
    expect(first?.buttons).not.toContain(
      i18n.t("banner_ignore_creator_kind", { chip: chip("drm") }),
    );
    expect(second?.buttons).toHaveLength(4);
    expect(second?.buttons).not.toContain(i18n.t("banner_ignore_creator_all"));
  });

  it("shows no section without an entry to ignore or without a creator", () => {
    const { banner, root } = setup();
    banner.show(
      view([], {
        creators: [DEVELOPER],
        creatorNotes: [make.creator.note("developer", CREATOR_NAME, ALLOW_ALL)],
      }),
    );
    expect(root.querySelector("details")).toBeNull();
    banner.show(view(SEVERAL));
    expect(root.querySelector("details")).toBeNull();
  });

  it("writes the name as text, never as markup", () => {
    const { banner, root } = setup();
    const name = make.text.markup();
    banner.show(view(SEVERAL, { creators: [make.creator.banner("developer", name)] }));
    expect(root.querySelector(".sar-banner-creator b")).toBeNull();
    expect(query(root, ".sar-banner-creator-name").textContent).toBe(name);
  });

  it("keeps the section open across a redraw, and closed on a new banner", () => {
    const { banner, root } = setup();
    banner.show(view(SEVERAL, { creators: [DEVELOPER] }));
    const section = query(root, "details");
    section.setAttribute("open", "");
    section.dispatchEvent(new Event("toggle"));
    banner.show(view(SEVERAL, { creators: [DEVELOPER], ignored: ["pvp"] }));
    expect(query(root, "details").hasAttribute("open")).toBe(true);
    const fresh = setup();
    fresh.banner.show(view(SEVERAL, { creators: [DEVELOPER] }));
    expect(query(fresh.root, "details").hasAttribute("open")).toBe(false);
  });

  it("notes a creator ignored for all tags or for one tag, with an Undo named by the note", () => {
    const { banner, root } = setup();
    banner.show(
      view(withoutDrm(SEVERAL), {
        creatorNotes: [
          make.creator.note("developer", CREATOR_NAME, ALLOW_ALL),
          make.creator.note("publisher", CREATOR_SPEC, "drm"),
        ],
      }),
    );
    const who = (which: CreatorRole) => ({ name: CREATOR_NAME, role: role(which) });
    expect(texts(root, ".sar-banner-ignored-text")).toEqual([
      i18n.t("banner_ignored_creator", who("developer")),
      i18n.t("banner_ignored_creator_kind", {
        ...who("publisher"),
        heading: i18n.t("kind_drm_heading"),
      }),
    ]);
    const undo = query(root, '[data-sar-action="undo-creator"]');
    expect(nameOf(root, undo)).toBe(
      `${i18n.t("banner_undo")} ${i18n.t("banner_ignored_creator", who("developer"))}`,
    );
  });

  it("ignores a creator for one tag, moves focus to its Undo and announces it", async () => {
    const { root, ignoreCreator, calls, thenShow } = wired(
      view(SEVERAL, { creators: [DEVELOPER] }),
    );
    thenShow(
      view(withoutDrm(SEVERAL), {
        creators: [make.creator.banner("developer", CREATOR_SPEC, ["drm"])],
        creatorNotes: [make.creator.note("developer", CREATOR_SPEC, "drm")],
      }),
    );
    const button = [...root.querySelectorAll<HTMLElement>(".sar-banner-creator button")].find(
      (each) => each.textContent === i18n.t("banner_ignore_creator_kind", { chip: chip("drm") }),
    );
    button?.click();
    button?.click();
    expect(ignoreCreator).toHaveBeenCalledTimes(1);
    expect(ignoreCreator).toHaveBeenCalledWith("developer", DEVELOPER.creator, "drm");
    calls[0]?.resolve();
    await vi.waitFor(() => {
      expect(root.activeElement).toBe(query(root, '[data-sar-action="undo-creator"]'));
    });
    await vi.waitFor(() => {
      expect(query(root, "[aria-live]").textContent).toBe(
        i18n.t("notice_creator_stopped_kind", {
          name: CREATOR_NAME,
          role: role("developer"),
          heading: i18n.t("kind_drm_heading"),
        }),
      );
    });
  });

  it("ignores a creator for all tags from its last button", async () => {
    const { root, ignoreCreator, calls, thenShow } = wired(
      view(SEVERAL, { creators: [DEVELOPER] }),
    );
    thenShow(
      view([], { creatorNotes: [make.creator.note("developer", CREATOR_SPEC, ALLOW_ALL)] }),
    );
    const buttons = [...root.querySelectorAll<HTMLElement>(".sar-banner-creator button")];
    buttons.at(-1)?.click();
    expect(ignoreCreator).toHaveBeenCalledWith("developer", DEVELOPER.creator, ALLOW_ALL);
    calls[0]?.resolve();
    await vi.waitFor(() => {
      expect(query(root, "[aria-live]").textContent).toBe(
        i18n.t("notice_creator_stopped", { name: CREATOR_NAME, role: role("developer") }),
      );
    });
  });

  it("undoes with the key that is on the list, and focuses the ignore button again", async () => {
    const key = make.creator.key(`n:${CREATOR_NAME}`);
    const byName = { ...make.creator.note("developer", CREATOR_SPEC, "drm"), key };
    const { root, restoreCreator, calls, thenShow } = wired(
      view(withoutDrm(SEVERAL), { creators: [DEVELOPER], creatorNotes: [byName] }),
    );
    thenShow(view(SEVERAL, { creators: [DEVELOPER] }));
    query(root, '[data-sar-action="undo-creator"]').click();
    expect(restoreCreator).toHaveBeenCalledWith("developer", key, "drm");
    calls[0]?.resolve();
    await vi.waitFor(() => {
      expect(root.activeElement).toBe(
        query(root, '.sar-banner-creator button[data-sar-scope="drm"]'),
      );
    });
    await vi.waitFor(() => {
      expect(query(root, "[aria-live]").textContent).toBe(
        i18n.t("notice_creator_restored_kind", {
          name: CREATOR_NAME,
          role: role("developer"),
          heading: i18n.t("kind_drm_heading"),
        }),
      );
    });
  });

  it("reads every line of the section from the Spanish catalog", () => {
    const { banner, root } = setup({}, manualActions().actions, spanish);
    banner.show(
      view(SEVERAL, {
        creators: [DEVELOPER],
        creatorNotes: [make.creator.note("publisher", CREATOR_NAME, ALLOW_ALL)],
      }),
    );
    expect(query(root, "summary").textContent).toBe(spanish.t("banner_creators_toggle"));
    expect(query(root, ".sar-banner-creator-role").textContent).toBe(
      spanish.t("banner_role_developer"),
    );
    expect(query(root, ".sar-banner-ignored-text").textContent).toBe(
      spanish.t("banner_ignored_creator", {
        name: CREATOR_NAME,
        role: spanish.t("banner_role_publisher"),
      }),
    );
    expect(spanish.t("banner_creators_toggle")).not.toBe(i18n.t("banner_creators_toggle"));
  });
});
