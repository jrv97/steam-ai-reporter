import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { ALLOW_ALL, type AllowScope } from "../settings/allow-data";
import {
  type Banner,
  type BannerActions,
  type BannerOptions,
  type BannerView,
  createBanner,
  HOVER_CLOSE_MS,
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
const SEVERAL_KINDS = SEVERAL.map((verdict) => verdict.kind);
/** Developer notes with markup and a CRLF break, and the text the banner shows for them. */
const NOTE_LINES = [make.text.markup(), make.text.note()];
const NOTES = NOTE_LINES.join("\r\n");
const SHOWN_NOTES = NOTE_LINES.join("\n");
/** A developer and publisher of the game, with a clan ID. */
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
const who = (which: CreatorRole) => ({ name: CREATOR_NAME, role: role(which) });

/** A view that lists the shown kinds unless `extra` says otherwise. */
function view(shown: readonly AnyDisclosed[], extra: Partial<BannerView> = {}): BannerView {
  return {
    shown,
    listed: shown.map((verdict) => verdict.kind),
    ignored: [],
    creators: [],
    creatorNotes: [],
    ...extra,
  };
}

/** A game ignored for all tags: nothing shown, the same tags listed. */
const silenced = (extra: Partial<BannerView> = {}) =>
  view([], { listed: SEVERAL_KINDS, ignored: [ALLOW_ALL], ...extra });

/** The selectors of the menu's controls, by the ids that survive a redraw. */
const MAIN = "#tks-banner-ignore-main";
const CARET = "#tks-banner-menu-button";
const MENU = "#tks-banner-menu";
const gameOption = (scope: AllowScope) =>
  scope === ALLOW_ALL ? `#tks-banner-option-game-${ALLOW_ALL}` : `#tks-banner-option-tag-${scope}`;
const creatorOption = (which: CreatorRole, scope: AllowScope) =>
  `#tks-banner-option-${which}-0-${scope}`;
const groupHead = (group: string) => `#tks-banner-group-${group}`;
const GAME_ROW = gameOption(ALLOW_ALL);

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

const texts = (root: ParentNode, selector: string) =>
  [...root.querySelectorAll(selector)].map((node) => node.textContent);

const withoutDrm = (shown: readonly AnyDisclosed[]) =>
  shown.filter((verdict) => verdict.kind !== "drm");

function press(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

/** Each option of a group as its title and its muted line. */
function options(root: ShadowRoot, group: string): readonly (readonly string[])[] {
  const body = query(root, `${groupHead(group)}-items`);
  return [...body.querySelectorAll(".tks-ignore-option")].map((option) =>
    texts(option, ".tks-ignore-title, .tks-ignore-subtitle")
  );
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("createBanner", () => {
  it("renders the developer's notes verbatim, markup included, as plain text", () => {
    const { banner, root } = setup();
    banner.show(view([make.verdict.disclosed("ai", { notes: NOTES })]));
    const quote = query(root, "blockquote.tks-banner-quote");
    expect(quote.textContent).toBe(SHOWN_NOTES);
    expect(quote.children).toHaveLength(0);
  });

  it("uses catalog copy and the developer as the source", () => {
    const { banner, root } = setup();
    banner.show(view([make.verdict.disclosed("ai")]));
    expect(query(root, "h2").textContent).toBe(i18n.t("kind_ai_heading"));
    expect(query(root, ".tks-banner-source").textContent).toBe(i18n.t("banner_source"));
    expect(query(root, MAIN).textContent).toBe(i18n.t("banner_menu_ignore"));
    expect(query(root, CARET).getAttribute("aria-label")).toBe(i18n.t("banner_menu_label"));
    expect(root.querySelector("svg")).toBeNull();
  });

  it.each([["en", i18n], ["es", spanish]] as const)(
    "says in %s that a full game's disclosure is the full game's, before the developer's words",
    (_locale, catalog) => {
      const { banner, root } = setup({}, manualActions().actions, catalog);
      const service = make.text.service();
      const lent = make.verdict.lent(make.verdict.disclosed("ai", { notes: NOTES, service }));
      banner.show(view([lent, make.verdict.disclosed("anticheat")]));
      const lines = [...root.querySelectorAll(".tks-banner-entry")].map((entry) =>
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
    const line = query(root, ".tks-banner-service");
    expect(line.textContent).toBe(`${i18n.t("badge_card_service_label")} ${service}`);
    expect(line.querySelector("a, b")).toBeNull();
  });

  it("omits the service line when the developer named none", () => {
    const { banner, root } = setup();
    banner.show(view([make.verdict.disclosed("ai", { service: "" })]));
    expect(root.querySelector(".tks-banner-service")).toBeNull();
  });

  it("keeps long notes collapsed behind a toggle", () => {
    const { banner, root, runFrames } = setup({ overflows: () => true });
    banner.show(view([make.verdict.disclosed("ai")]));
    const quote = query(root, ".tks-banner-quote");
    const toggle = query(root, '[data-tks-action="toggle"]');
    expect(toggle.hidden).toBe(true);
    runFrames();
    expect(toggle.hidden).toBe(false);
    toggle.click();
    expect(quote.getAttribute("data-tks-collapsed")).toBe("false");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toBe(i18n.t("banner_collapse"));
    toggle.click();
    expect(quote.getAttribute("data-tks-collapsed")).toBe("true");
    expect(toggle.textContent).toBe(i18n.t("banner_expand"));
  });

  it("drops the clamp and the toggle for short notes", () => {
    const { banner, root, runFrames } = setup({ overflows: () => false });
    banner.show(view([make.verdict.disclosed("ai")]));
    runFrames();
    expect(query(root, ".tks-banner-quote").hasAttribute("data-tks-collapsed")).toBe(false);
    expect(root.querySelector('[data-tks-action="toggle"]')).toBeNull();
  });

  const ai = make.verdict.disclosed("ai");
  const ignoredRow = make.creator.banner("developer", CREATOR_SPEC, ["pvp"]);

  it.each([
    ["an ignored scope", view([ai]), view([ai]), view([ai], { ignored: ["ai"] })],
    ["a listed tag", view([ai]), view([ai]), view([ai], { listed: ["ai", "pvp"] })],
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
    expect(root.querySelector("a, blockquote, .tks-banner-service")).toBeNull();
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
  ])("gives each kind of game %i its heading and one option in the menu", (id) => {
    const { banner, root } = setup();
    const shown = bannerList(captured(id));
    banner.show(view(shown));
    expect(texts(root, "h2")).toEqual(shown.map(heading));
    expect(root.querySelectorAll(".tks-banner-entry")).toHaveLength(shown.length);
    expect(options(root, "tags")).toHaveLength(shown.length);
    expect(root.querySelector("p:not(.tks-banner-error)")).toBeNull();
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
    expect(query(root, '[data-tks-action="toggle"]').getAttribute("aria-controls")).toBe(quote.id);
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
      ["for the developer when it shows only notes", silenced(), "banner_region_label"],
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

  it("starts every accessible name with the visible text of its control", () => {
    const { banner, root } = setup();
    banner.show(view(SEVERAL, { ignored: ["pvp"], creators: [DEVELOPER] }));
    const controls = [...root.querySelectorAll("button")];
    expect(controls.length).toBeGreaterThan(SEVERAL.length * 2);
    for (const control of controls) {
      expect(nameOf(root, control).startsWith(control.textContent)).toBe(true);
    }
    const ids = [...root.querySelectorAll("[id]")].map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(
    [
      ["a one-tag banner with its kind", view([make.verdict.disclosed("ai")]), "ai"],
      ["a several-tag banner with no kind", view(SEVERAL), null],
      [
        "a banner with only notes for ignored scopes with no kind",
        view([], { listed: ["pvp"], ignored: ["pvp"] }),
        null,
      ],
    ] as const,
  )("marks %s", (_name, shown, kind) => {
    const { banner, root } = setup();
    banner.show(shown);
    expect(query(root, "aside").getAttribute("data-tks-kind")).toBe(kind);
    expect(query(root, "aside").hasAttribute("style")).toBe(false);
  });

  it("steps the headings down when it lists several kinds", () => {
    const { banner, root } = setup();
    banner.show(view([make.verdict.disclosed("ai")]));
    expect(query(root, "aside").hasAttribute("data-tks-entries")).toBe(false);
    banner.show(view(SEVERAL));
    expect(query(root, "aside").getAttribute("data-tks-entries")).toBe("many");
  });
});

describe("the ignore menu", () => {
  const chip = (kind: AnyDisclosed["kind"]) => i18n.t(KIND_BY_ID[kind].messages.chip);
  const tagLines = SEVERAL.map((verdict) => [chip(verdict.kind), heading(verdict)]);
  const creatorLines = (
    note: "banner_menu_developer_all_note" | "banner_menu_publisher_all_note",
  ) => [[i18n.t("banner_menu_all_tags"), i18n.t(note)], ...tagLines];

  it("puts the game's own row first, then the tag, developer and publisher groups", () => {
    const { banner, root } = setup();
    banner.show(view(SEVERAL, { creators: [DEVELOPER, PUBLISHER] }));
    const menu = query(root, MENU);
    expect(menu.getAttribute("role")).toBe("menu");
    expect(menu.querySelector("[role^='menuitem']")).toBe(query(root, GAME_ROW));
    expect(texts(query(root, GAME_ROW), ".tks-ignore-title, .tks-ignore-subtitle")).toEqual([
      i18n.t("banner_ignore"),
      i18n.t("banner_menu_game_note"),
    ]);
    expect(texts(root, ".tks-ignore-group-head")).toEqual([
      i18n.t("banner_menu_group_tags"),
      i18n.t("banner_menu_group_developers"),
      i18n.t("banner_menu_group_publishers"),
    ]);
    expect(options(root, "developer")).toEqual(creatorLines("banner_menu_developer_all_note"));
    expect(options(root, "publisher")).toEqual(creatorLines("banner_menu_publisher_all_note"));
    expect(options(root, "tags")).toEqual(tagLines);
    expect(texts(root, ".tks-ignore-creator-name")).toEqual([CREATOR_NAME, CREATOR_NAME]);
    const roles = [...menu.querySelectorAll(".tks-ignore-option")].map((each) =>
      each.getAttribute("role")
    );
    expect(new Set(roles)).toEqual(new Set(["menuitemcheckbox"]));
  });

  it("leaves out an empty group and writes a creator's name as text", () => {
    const { banner, root } = setup();
    const name = make.text.markup();
    banner.show(view(SEVERAL, { creators: [make.creator.banner("developer", name)] }));
    expect(root.querySelector(groupHead("publisher"))).toBeNull();
    expect(query(root, ".tks-ignore-creator-name").textContent).toBe(name);
    expect(root.querySelector(".tks-ignore-creator b")).toBeNull();
  });

  it.each([
    ["nothing ignored", view(SEVERAL, { creators: [DEVELOPER] }), []],
    ["the game for all tags", silenced({ creators: [DEVELOPER] }), [MAIN, GAME_ROW]],
    [
      "one tag of the game",
      view(withoutDrm(SEVERAL), { listed: SEVERAL_KINDS, ignored: ["drm"] }),
      [gameOption("drm")],
    ],
    [
      "a developer for one tag and a publisher for all tags",
      view(SEVERAL, {
        creators: [
          make.creator.banner("developer", CREATOR_SPEC, ["drm"]),
          make.creator.banner("publisher", CREATOR_SPEC, [ALLOW_ALL]),
        ],
      }),
      [creatorOption("developer", "drm"), creatorOption("publisher", ALLOW_ALL)],
    ],
  ])("checks what is ignored now: %s", (_name, shown, checked) => {
    const { banner, root } = setup();
    banner.show(shown);
    const on = [...root.querySelectorAll('[aria-checked="true"], [data-tks-ignored]')];
    expect(on.map((each) => `#${each.id}`)).toEqual(checked);
  });

  it("reads its ignored label on the main button once the game is ignored for all tags", () => {
    const { banner, root } = setup();
    banner.show(silenced());
    expect(query(root, MAIN).textContent).toBe(i18n.t("banner_menu_ignored"));
  });

  it("opens from the caret on its first item and closes again", () => {
    const { banner, root } = setup();
    banner.show(view(SEVERAL));
    const caret = query(root, CARET);
    expect(query(root, MENU).hidden).toBe(true);
    caret.click();
    expect(caret.getAttribute("aria-expanded")).toBe("true");
    expect(query(root, MENU).hidden).toBe(false);
    expect(root.activeElement).toBe(query(root, GAME_ROW));
    caret.click();
    expect(caret.getAttribute("aria-expanded")).toBe("false");
    expect(query(root, MENU).hidden).toBe(true);
  });

  it.each([
    ["Down", "ArrowDown", GAME_ROW],
    ["Up", "ArrowUp", gameOption("eula")],
  ])("opens from the caret on %s", (_name, key, focused) => {
    const { banner, root } = setup();
    banner.show(view(SEVERAL));
    press(query(root, CARET), key);
    expect(query(root, MENU).hidden).toBe(false);
    expect(root.activeElement).toBe(query(root, focused));
  });

  it.each([
    ["Down to the next item", GAME_ROW, "ArrowDown", groupHead("tags")],
    ["Down from the last item to the first", gameOption("eula"), "ArrowDown", GAME_ROW],
    ["Up from the first item to the last", GAME_ROW, "ArrowUp", gameOption("eula")],
    ["Home to the first item", gameOption("drm"), "Home", GAME_ROW],
    ["End to the last item", GAME_ROW, "End", gameOption("eula")],
    ["Left from an option to its group", gameOption("drm"), "ArrowLeft", groupHead("tags")],
  ])("moves with %s", (_name, from, key, focused) => {
    const { banner, root } = setup();
    banner.show(view(SEVERAL));
    query(root, CARET).click();
    query(root, from).focus();
    press(query(root, from), key);
    expect(root.activeElement).toBe(query(root, focused));
  });

  it("opens and closes a group with Right, Left and a click, skipping its hidden options", () => {
    const { banner, root } = setup();
    banner.show(view(SEVERAL, { creators: [DEVELOPER] }));
    query(root, CARET).click();
    const head = query(root, groupHead("developer"));
    expect(head.getAttribute("aria-expanded")).toBe("false");
    head.focus();
    press(head, "ArrowDown");
    expect(root.activeElement).toBe(query(root, GAME_ROW));
    press(head, "ArrowRight");
    expect(head.getAttribute("aria-expanded")).toBe("true");
    expect(query(root, `${groupHead("developer")}-items`).hidden).toBe(false);
    press(head, "ArrowLeft");
    expect(head.getAttribute("aria-expanded")).toBe("false");
    head.click();
    expect(head.getAttribute("aria-expanded")).toBe("true");
  });

  it.each([
    ["Escape on an option, back on the caret", GAME_ROW, "Escape", CARET],
    ["Tab on an option", GAME_ROW, "Tab", GAME_ROW],
    ["Tab on the caret", CARET, "Tab", CARET],
    ["Tab on the main half", MAIN, "Tab", MAIN],
  ])("closes on %s", (_name, from, key, focused) => {
    const { banner, root } = setup();
    banner.show(view(SEVERAL));
    query(root, CARET).click();
    query(root, from).focus();
    press(query(root, from), key);
    expect(query(root, MENU).hidden).toBe(true);
    expect(query(root, CARET).getAttribute("aria-expanded")).toBe("false");
    expect(root.activeElement).toBe(query(root, focused));
  });

  it("closes the menu and stops listening for presses outside when it is removed", () => {
    const { banner, root } = setup();
    banner.show(view(SEVERAL));
    query(root, CARET).click();
    const stop = vi.spyOn(document, "removeEventListener");
    banner.remove();
    expect(banner.host.isConnected).toBe(false);
    expect(stop).toHaveBeenCalledWith("pointerdown", expect.any(Function), true);
    placeBanner(document, banner.host);
    expect(query(root, MENU).hidden).toBe(true);
    expect(query(root, CARET).getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on a press outside the banner and stays open on one inside", () => {
    const { banner, root } = setup();
    banner.show(view(SEVERAL));
    query(root, CARET).click();
    query(root, gameOption("drm")).dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, composed: true }),
    );
    expect(query(root, MENU).hidden).toBe(false);
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(query(root, MENU).hidden).toBe(true);
  });

  it("keeps the menu, its groups and the focus across a redraw, and starts closed", () => {
    const { banner, root } = setup();
    banner.show(view(SEVERAL, { creators: [DEVELOPER] }));
    query(root, CARET).click();
    query(root, groupHead("developer")).click();
    query(root, groupHead("tags")).click();
    query(root, groupHead("tags")).focus();
    banner.show(view(SEVERAL, { creators: [DEVELOPER], ignored: ["pvp"] }));
    expect(query(root, MENU).hidden).toBe(false);
    expect(query(root, groupHead("developer")).getAttribute("aria-expanded")).toBe("true");
    expect(query(root, groupHead("tags")).getAttribute("aria-expanded")).toBe("false");
    expect(root.activeElement).toBe(query(root, groupHead("tags")));
    const fresh = setup();
    fresh.banner.show(view(SEVERAL, { creators: [DEVELOPER] }));
    expect(query(fresh.root, MENU).hidden).toBe(true);
    expect(texts(fresh.root, '.tks-ignore-group-head[aria-expanded="true"]')).toEqual([
      i18n.t("banner_menu_group_tags"),
    ]);
  });
});

describe("the ignore menu on hover", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const hover = (target: Element, pointerType = "mouse") =>
    target.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType }));
  const leave = (target: Element, relatedTarget: EventTarget) =>
    target.dispatchEvent(
      new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse", relatedTarget }),
    );

  it.each([
    ["opens over the arrow with a mouse", CARET, "mouse", false],
    ["stays closed over the main button", MAIN, "mouse", true],
    ["stays closed on a touch", CARET, "touch", true],
  ])("%s, leaving the focus where it was", (_name, over, pointerType, hidden) => {
    const { banner, root } = setup();
    banner.show(view(SEVERAL));
    hover(query(root, over), pointerType);
    expect(query(root, MENU).hidden).toBe(hidden);
    expect(root.activeElement).toBeNull();
  });

  it("closes once the pointer has left the button and the menu for a moment", () => {
    const { banner, root } = setup();
    banner.show(view(SEVERAL));
    hover(query(root, CARET));
    leave(query(root, CARET), query(root, MAIN));
    leave(query(root, CARET), root.host);
    hover(query(root, GAME_ROW));
    vi.advanceTimersByTime(HOVER_CLOSE_MS);
    expect(query(root, MENU).hidden).toBe(false);
    leave(query(root, GAME_ROW), document.body);
    vi.advanceTimersByTime(HOVER_CLOSE_MS - 1);
    expect(query(root, MENU).hidden).toBe(false);
    vi.advanceTimersByTime(1);
    expect(query(root, MENU).hidden).toBe(true);
  });

  it("keeps a menu that hover opened once the arrow is clicked", () => {
    const { banner, root } = setup();
    banner.show(view(SEVERAL));
    hover(query(root, CARET));
    query(root, CARET).click();
    expect(root.activeElement).toBe(query(root, GAME_ROW));
    leave(query(root, CARET), document.body);
    vi.advanceTimersByTime(HOVER_CLOSE_MS);
    expect(query(root, MENU).hidden).toBe(false);
  });
});

describe("the banner in Spanish", () => {
  it("reads the entries, the notes and the menu from the Spanish catalog", () => {
    const { banner, root } = setup({}, manualActions().actions, spanish);
    banner.show(
      view(withoutDrm(SEVERAL), {
        listed: SEVERAL_KINDS,
        ignored: ["drm"],
        creators: [DEVELOPER],
        creatorNotes: [make.creator.note("publisher", CREATOR_NAME, ALLOW_ALL)],
      }),
    );
    expect(texts(root, "h2")).toEqual(
      withoutDrm(SEVERAL).map((verdict) => spanish.t(KIND_BY_ID[verdict.kind].messages.heading)),
    );
    expect(texts(root, ".tks-banner-ignored-text")).toEqual([
      spanish.t("banner_ignored_kind", { heading: spanish.t("kind_drm_heading") }),
      spanish.t("banner_ignored_creator", {
        name: CREATOR_NAME,
        role: spanish.t("banner_role_publisher"),
      }),
    ]);
    expect(query(root, MAIN).textContent).toBe(spanish.t("banner_menu_ignore"));
    expect(texts(root, ".tks-ignore-group-head")).toEqual([
      spanish.t("banner_menu_group_tags"),
      spanish.t("banner_menu_group_developers"),
    ]);
    expect(options(root, "developer")[0]).toEqual([
      spanish.t("banner_menu_all_tags"),
      spanish.t("banner_menu_developer_all_note"),
    ]);
    expect(spanish.t("banner_menu_ignore")).not.toBe(i18n.t("banner_menu_ignore"));
  });
});

describe("the notes for ignored scopes", () => {
  it("shows a game ignored for all tags as one line over the menu", () => {
    const { banner, root } = setup();
    banner.show(silenced({ ignored: [ALLOW_ALL, "drm"] }));
    expect(query(root, "aside").getAttribute("data-tks-variant")).toBe("ignored");
    expect(texts(root, ".tks-banner-ignored-text")).toEqual([i18n.t("banner_ignored")]);
    expect(root.querySelector("blockquote, h2, .tks-banner-link")).toBeNull();
    expect(root.querySelector(MENU)).not.toBeNull();
  });

  it("notes a kind ignored on its own beside the entries that remain", () => {
    const { banner, root } = setup();
    const rest = withoutDrm(SEVERAL);
    banner.show(view(rest, { listed: SEVERAL_KINDS, ignored: ["drm"] }));
    expect(query(root, "aside").hasAttribute("data-tks-variant")).toBe(false);
    expect(texts(root, "h2")).toEqual(rest.map(heading));
    expect(texts(root, ".tks-banner-ignored-text")).toEqual([ignoredKind("drm")]);
  });

  it("notes a creator ignored for all tags or for one tag", () => {
    const { banner, root } = setup();
    banner.show(
      view(withoutDrm(SEVERAL), {
        listed: SEVERAL_KINDS,
        creatorNotes: [
          make.creator.note("developer", CREATOR_NAME, ALLOW_ALL),
          make.creator.note("publisher", CREATOR_SPEC, "drm"),
        ],
      }),
    );
    expect(texts(root, ".tks-banner-ignored-text")).toEqual([
      i18n.t("banner_ignored_creator", who("developer")),
      i18n.t("banner_ignored_creator_kind", {
        ...who("publisher"),
        heading: i18n.t("kind_drm_heading"),
      }),
    ]);
  });
});

describe("ignoring from the menu", () => {
  const byName = make.creator.key(`n:${CREATOR_NAME}`);
  const listedByName = { ...DEVELOPER, ignored: [{ scope: "drm" as const, key: byName }] };
  const drmHeading = { heading: i18n.t("kind_drm_heading") };
  const ignoredDrm = view(withoutDrm(SEVERAL), { listed: SEVERAL_KINDS, ignored: ["drm"] });

  it.each(
    [
      [
        "checks a tag of the game",
        view(SEVERAL),
        ignoredDrm,
        gameOption("drm"),
        "ignore",
        ["drm"],
        i18n.t("notice_marking_stopped_kind", drmHeading),
      ],
      [
        "unchecks a tag of the game",
        ignoredDrm,
        view(SEVERAL),
        gameOption("drm"),
        "restore",
        ["drm"],
        i18n.t("notice_marking_restored_kind", drmHeading),
      ],
      [
        "ignores the game for all tags from the main button",
        view(SEVERAL),
        silenced(),
        MAIN,
        "ignore",
        [ALLOW_ALL],
        i18n.t("notice_marking_stopped"),
      ],
      [
        "stops ignoring the game from the main button",
        silenced(),
        view(SEVERAL),
        MAIN,
        "restore",
        [ALLOW_ALL],
        i18n.t("notice_marking_restored"),
      ],
      [
        "checks a developer for one tag",
        view(SEVERAL, { creators: [DEVELOPER] }),
        view(SEVERAL, { creators: [make.creator.banner("developer", CREATOR_SPEC, ["drm"])] }),
        creatorOption("developer", "drm"),
        "ignoreCreator",
        ["developer", DEVELOPER.creator, "drm"],
        i18n.t("notice_creator_stopped_kind", { ...who("developer"), ...drmHeading }),
      ],
      [
        "checks a developer for all tags",
        view(SEVERAL, { creators: [DEVELOPER] }),
        view([], { listed: SEVERAL_KINDS, creators: [DEVELOPER] }),
        creatorOption("developer", ALLOW_ALL),
        "ignoreCreator",
        ["developer", DEVELOPER.creator, ALLOW_ALL],
        i18n.t("notice_creator_stopped", who("developer")),
      ],
      [
        "unchecks a developer with the key that is on the list",
        view(SEVERAL, { creators: [listedByName] }),
        view(SEVERAL, { creators: [DEVELOPER] }),
        creatorOption("developer", "drm"),
        "restoreCreator",
        ["developer", byName, "drm"],
        i18n.t("notice_creator_restored_kind", { ...who("developer"), ...drmHeading }),
      ],
    ] as const,
  )(
    "%s once, keeps the focus on it and announces it",
    async (_name, initial, after, control, call, args, spoken) => {
      const wiring = wired(initial);
      const { root, calls, thenShow } = wiring;
      thenShow(after);
      query(root, CARET).click();
      const target = query(root, control);
      target.focus();
      target.click();
      target.click();
      expect(wiring[call]).toHaveBeenCalledTimes(1);
      expect(wiring[call]).toHaveBeenCalledWith(...args);
      calls[0]?.resolve();
      await vi.waitFor(() => {
        expect(query(root, "[aria-live]").textContent).toBe(spoken);
      });
      expect(root.activeElement).toBe(query(root, control));
      expect(query(root, MENU).hidden).toBe(false);
    },
  );

  it.each(
    [
      [
        "the ignore list",
        view([make.verdict.disclosed("ai")]),
        gameOption("ai"),
        "error_allow_list_save",
      ],
      [
        "the creator list",
        view(SEVERAL, { creators: [DEVELOPER] }),
        creatorOption("developer", "drm"),
        "error_creator_list_save",
      ],
    ] as const,
  )(
    "keeps the view and shows an alert when %s cannot be saved",
    async (_name, initial, control, error) => {
      const { root, calls } = wired(initial);
      const aside = query(root, "aside");
      query(root, control).click();
      calls[0]?.reject();
      await vi.waitFor(() => {
        expect(query(root, ".tks-banner-error").hidden).toBe(false);
      });
      expect(query(root, ".tks-banner-error").textContent).toBe(i18n.t(error));
      expect(query(root, ".tks-banner-error").getAttribute("role")).toBe("alert");
      expect(query(root, "aside")).toBe(aside);
    },
  );

  const kindView = view([make.verdict.disclosed("ai")]);
  const creatorView = view(SEVERAL, { creators: [DEVELOPER] });
  const creatorDrm = creatorOption("developer", "drm");

  it.each([
    ["a scope", kindView, gameOption("ai"), "data-tks-scope", "nothing"],
    ["an action", kindView, gameOption("ai"), "data-tks-action", "other"],
    ["a role", creatorView, creatorDrm, "data-tks-role", "other"],
    ["a key", creatorView, creatorDrm, "data-tks-creator", CREATOR_NAME],
    [
      "a creator the view lacks",
      creatorView,
      creatorDrm,
      "data-tks-creator",
      `c:${String(make.creator.clan())}`,
    ],
  ])("does nothing for %s it does not know", (_name, initial, control, attribute, value) => {
    const { root, ignore, restore, ignoreCreator, restoreCreator } = wired(initial);
    const target = query(root, control);
    target.setAttribute(attribute, value);
    target.click();
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
