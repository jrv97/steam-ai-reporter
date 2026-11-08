import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setBody } from "../../../tests/helpers/dom";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { disclosedList } from "../../../tests/helpers/fixture-verdicts";
import { englishI18n } from "../../../tests/helpers/i18n";
import { the } from "../../../tests/helpers/surfaces";
import { dateFormat } from "../i18n/date-format";
import { KIND_IDS, type KindId } from "../kinds/id";
import { KIND_BY_ID } from "../kinds/registry";
import type { AnyDisclosed, KindVerdicts } from "../kinds/verdicts";
import {
  type Align,
  createHoverCard,
  HOVER_CARD_ID,
  type HoverCard,
  placeCard,
} from "./hover-card";
import { adoptPageStyles } from "./styles";

/** The id of a description the store already set on a link. */
const STORE_NOTE_ID = "store-note";

/** A trigger of the class `className`, appended to `parent`. */
function triggerIn(parent: Element, className: string): HTMLElement {
  const trigger = document.createElement("span");
  trigger.className = className;
  parent.append(trigger);
  return trigger;
}

describe("placeCard", () => {
  const viewport = { width: 1000, height: 800 };
  const card = { width: 306, height: 200 };
  const trigger = { left: 100, top: 100, right: 220, bottom: 119 };

  it("puts the card one offset below the trigger, start edges aligned", () => {
    expect(placeCard(trigger, card, viewport, 8, "start")).toEqual({
      left: 100,
      top: 127,
      side: "below",
    });
  });

  it("flips above near the bottom edge, and stays below when above has no room either", () => {
    const low = { left: 100, top: 700, right: 220, bottom: 719 };
    expect(placeCard(low, card, viewport, 8, "start")).toMatchObject({ top: 492, side: "above" });
    const tall = { width: 306, height: 750 };
    expect(placeCard(low, tall, viewport, 8, "start").side).toBe("below");
  });

  it.each<readonly [string, number, number, Align, number]>([
    ["aligns the end edges for a compact badge", 500, 700, "end", 394],
    ["keeps one offset inside the right edge", 900, 990, "start", 686],
    ["keeps one offset inside the left edge", 2, 40, "end", 8],
  ])("%s", (_name, left, right, align, expected) => {
    expect(placeCard({ ...trigger, left, right }, card, viewport, 8, align).left).toBe(expected);
  });
});

describe("createHoverCard", () => {
  const i18n = englishI18n();
  let timers = fake.queue();
  let frames = fake.queue();
  /** Whether the clamp hides part of a quote, as the card measures it. */
  let overflowing: (quote: HTMLElement) => boolean = () => false;
  let card: HoverCard | undefined;
  const flush = () => {
    timers.run();
  };
  const nextFrame = () => {
    frames.run();
  };

  function start(): HoverCard {
    card = createHoverCard(document, i18n, {
      delay: timers.delay,
      overflows: (quote) => overflowing(quote),
      frame: frames.frame,
    });
    return card;
  }

  /** happy-dom has no layout: give the viewport and one element a box. */
  function layout(element: Element, top: number): void {
    const root = document.documentElement;
    Object.defineProperty(root, "clientWidth", { value: 1000, configurable: true });
    Object.defineProperty(root, "clientHeight", { value: 800, configurable: true });
    element.getBoundingClientRect = () => new DOMRect(100, top, 120, 19);
  }

  function page(): { link: HTMLAnchorElement; badge: HTMLElement; other: HTMLElement; } {
    const label = i18n.t("kind_ai_chip");
    setBody(`
      <a class="row" href="/app/${String(make.appId())}/">
      <span class="title">${make.text.name()}</span>
      <span class="sar-badge" data-sar-kind="ai">
      <span class="sar-badge-label">${label}</span></span></a>
      <a class="other" href="/app/${String(make.appId())}/">${make.text.name()}</a>`);
    const link = document.querySelector<HTMLAnchorElement>(".row");
    const badge = document.querySelector<HTMLElement>(".sar-badge");
    const other = document.querySelector<HTMLElement>(".other");
    if (link === null || badge === null || other === null) {
      throw new TypeError();
    }
    return { link, badge, other };
  }

  function pointerOver(target: Element): void {
    target.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
  }

  function focusIn(target: Element): void {
    target.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  }

  function focusOut(target: Element): void {
    target.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  }

  const shown = () => {
    const node = document.getElementById(HOVER_CARD_ID);
    return node?.hidden === false ? node : null;
  };

  beforeEach(() => {
    timers = fake.queue();
    frames = fake.queue();
    overflowing = () => false;
  });

  afterEach(() => {
    card?.stop();
    card = undefined;
    Reflect.deleteProperty(document.documentElement, "clientWidth");
    Reflect.deleteProperty(document.documentElement, "clientHeight");
  });

  it("opens after the pointer rests on a badge and quotes the notes verbatim", () => {
    const { badge } = page();
    const [first, second] = [make.text.note(), make.text.note()];
    const service = make.text.service();
    start().bind(badge, [
      make.verdict.disclosed("ai", { notes: `${first}\r\n${second}`, service }),
    ]);
    pointerOver(badge.firstElementChild ?? badge);
    expect(shown()).toBeNull();
    flush();
    const node = shown();
    expect(node?.getAttribute("role")).toBe("tooltip");
    expect(node?.querySelector(".sar-hovercard-title")?.textContent)
      .toBe(i18n.t("kind_ai_heading"));
    expect(node?.lastElementChild?.className).toBe("sar-hovercard-source");
    expect(node?.lastElementChild?.textContent).toBe(i18n.t("badge_card_declared"));
    expect(node?.querySelector(".sar-hovercard-notes")?.textContent).toBe(`${first}\n${second}`);
    expect(node?.querySelector(".sar-hovercard-service")?.textContent)
      .toBe(`${i18n.t("badge_card_service_label")} ${service}`);
    expect(node?.getAttribute("data-sar-side")).toBe("below");
  });

  it("shows the card in the top layer on every open, above store popovers opened before it", () => {
    const saved = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "showPopover");
    const showPopover = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "showPopover", {
      value: showPopover,
      configurable: true,
    });
    try {
      const { badge, other } = page();
      const second = triggerIn(other, "sar-badge");
      const hover = start();
      hover.bind(badge, [make.verdict.disclosed("ai")]);
      hover.bind(second, [make.verdict.disclosed("ai")]);
      pointerOver(badge);
      flush();
      pointerOver(second);
      expect(shown()?.getAttribute("popover")).toBe("manual");
      expect(showPopover).toHaveBeenCalledTimes(2);
    } finally {
      if (saved === undefined) {
        Reflect.deleteProperty(HTMLElement.prototype, "showPopover");
      } else {
        Object.defineProperty(HTMLElement.prototype, "showPopover", saved);
      }
    }
  });

  it("keeps a closed card hidden through the reset, which unsets the popover's own rules", () => {
    adoptPageStyles(document);
    const { badge, other } = page();
    start().bind(badge, [make.verdict.disclosed("ai")]);
    pointerOver(badge);
    flush();
    const node = document.getElementById(HOVER_CARD_ID);
    const style = node === null ? undefined : getComputedStyle(node);
    expect([style?.display, style?.position]).toEqual(["flex", "fixed"]);
    pointerOver(other);
    flush();
    expect(node?.hidden).toBe(true);
    expect(node === null ? undefined : getComputedStyle(node).display).toBe("none");
  });

  it("marks the root while open, and the page CSS hides the store's game hover then", () => {
    adoptPageStyles(document);
    const { badge, other } = page();
    const storeHover = document.createElement("div");
    storeHover.id = "global_hover";
    document.body.append(storeHover);
    expect(getComputedStyle(storeHover).visibility).not.toBe("hidden");
    start().bind(badge, [make.verdict.disclosed("ai")]);
    pointerOver(badge);
    flush();
    expect(document.documentElement.getAttribute("data-sar-hovercard")).toBe("open");
    expect(getComputedStyle(storeHover).visibility).toBe("hidden");
    pointerOver(other);
    flush();
    expect(document.documentElement.hasAttribute("data-sar-hovercard")).toBe(false);
  });

  it("clears the root mark on Escape, on pagehide and on stop", () => {
    const { badge, other } = page();
    const hover = start();
    hover.bind(badge, [make.verdict.disclosed("ai")]);
    const marked = () => document.documentElement.hasAttribute("data-sar-hovercard");
    const reopen = () => {
      pointerOver(other);
      pointerOver(badge);
      flush();
      expect(marked()).toBe(true);
    };
    reopen();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(marked()).toBe(false);
    reopen();
    window.dispatchEvent(new Event("pagehide"));
    expect(marked()).toBe(false);
    reopen();
    hover.stop();
    expect(marked()).toBe(false);
  });

  it("leaves out the service line when the developer named none", () => {
    const { badge } = page();
    const { service: _service, ...unnamed } = make.verdict.disclosed("ai");
    start().bind(badge, [unnamed]);
    pointerOver(badge);
    flush();
    expect(shown()?.querySelector(".sar-hovercard-service")).toBeNull();
  });

  it("points to the store page only when the clamp cuts a long note", () => {
    const { badge, other } = page();
    const hover = start();
    overflowing = () => true;
    const notes = make.text.note();
    hover.bind(badge, [make.verdict.disclosed("ai", { notes })]);
    pointerOver(badge);
    flush();
    const more = shown()?.querySelector<HTMLElement>(".sar-hovercard-more");
    expect(more?.hidden).toBe(false);
    expect(more?.textContent).toBe(i18n.t("badge_card_more"));
    expect(shown()?.querySelector(".sar-hovercard-notes")?.textContent).toBe(notes);

    overflowing = () => false;
    const second = triggerIn(other, "sar-badge");
    hover.bind(second, [make.verdict.disclosed("ai", { notes: make.text.note() })]);
    pointerOver(second);
    expect(shown()?.querySelector<HTMLElement>(".sar-hovercard-more")?.hidden).toBe(true);
  });

  it("opens for a focusable chip on the game's own page and closes when focus leaves", () => {
    const { badge, other } = page();
    badge.tabIndex = 0;
    start().bind(badge, [make.verdict.disclosed("ai")], true);
    focusIn(badge);
    expect(shown()).not.toBeNull();
    expect(badge.getAttribute("aria-describedby")).toBe(HOVER_CARD_ID);
    focusOut(badge);
    focusIn(other);
    expect(shown()).toBeNull();
    expect(badge.hasAttribute("aria-describedby")).toBe(false);
  });

  it("leaves out the store page pointer on the game's own page", () => {
    const { badge, other } = page();
    const hover = start();
    overflowing = () => true;
    const verdict = make.verdict.disclosed("ai");
    hover.bind(badge, [verdict], true);
    pointerOver(badge);
    flush();
    expect(shown()?.querySelector<HTMLElement>(".sar-hovercard-more")?.hidden).toBe(true);

    const capsule = triggerIn(other, "sar-compact");
    hover.bind(capsule, [verdict]);
    pointerOver(capsule);
    expect(shown()?.querySelector<HTMLElement>(".sar-hovercard-more")?.hidden).toBe(false);
  });

  it("adds six document listeners and none per badge, however many badges there are", () => {
    const add = vi.spyOn(Node.prototype, "addEventListener");
    setBody(Array.from({ length: 200 }, () => '<span class="sar-badge"></span>').join(""));
    const hover = start();
    for (const badge of document.querySelectorAll(".sar-badge")) {
      hover.bind(badge, [make.verdict.disclosed("ai")]);
    }
    pointerOver(document.querySelectorAll(".sar-badge")[150] ?? document.body);
    flush();
    expect(add.mock.contexts.filter((target) => target === document)).toHaveLength(6);
    expect(add.mock.contexts.filter((target) => target !== document)).toHaveLength(0);
    expect(document.querySelectorAll(".sar-hovercard")).toHaveLength(1);
    add.mockRestore();
  });

  it("stays open while the pointer crosses onto the card, and closes after leaving both", () => {
    const { badge, other } = page();
    start().bind(badge, [make.verdict.disclosed("ai")]);
    pointerOver(badge);
    flush();
    const node = the(`#${HOVER_CARD_ID}`);
    pointerOver(document.body);
    pointerOver(node);
    flush();
    expect(shown()).not.toBeNull();
    pointerOver(other);
    expect(shown()).not.toBeNull();
    flush();
    expect(shown()).toBeNull();
  });

  it("opens nothing when the pointer only passes over a badge", () => {
    const { badge, other } = page();
    start().bind(badge, [make.verdict.disclosed("ai")]);
    pointerOver(badge);
    pointerOver(other);
    flush();
    expect(shown()).toBeNull();
  });

  it("opens at once on focus of a link holding a badge, and describes the link", () => {
    const { link, other } = page();
    link.setAttribute("aria-describedby", STORE_NOTE_ID);
    start().bind(the(".sar-badge", link), [make.verdict.disclosed("ai")]);
    focusIn(link);
    expect(shown()).not.toBeNull();
    expect(link.getAttribute("aria-describedby")).toBe(`${STORE_NOTE_ID} ${HOVER_CARD_ID}`);
    focusOut(link);
    focusIn(other);
    expect(shown()).toBeNull();
    expect(link.getAttribute("aria-describedby")).toBe(STORE_NOTE_ID);
  });

  it("describes a focused link when the pointer opens the card over it, and lets go", () => {
    const { link, badge, other } = page();
    start().bind(badge, [make.verdict.disclosed("ai")]);
    link.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(shown()).toBeNull();
    pointerOver(other);
    pointerOver(badge);
    flush();
    expect(shown()).not.toBeNull();
    expect(link.getAttribute("aria-describedby")).toBe(HOVER_CARD_ID);
    pointerOver(other);
    flush();
    expect(shown()).toBeNull();
    expect(link.hasAttribute("aria-describedby")).toBe(false);
  });

  it("describes nothing when the pointer opens the card and no link holds focus", () => {
    const { link, badge, other } = page();
    start().bind(badge, [make.verdict.disclosed("ai")]);
    other.focus();
    pointerOver(badge);
    flush();
    expect(shown()).not.toBeNull();
    expect(link.hasAttribute("aria-describedby")).toBe(false);
    expect(other.hasAttribute("aria-describedby")).toBe(false);
  });

  it("closes on Escape and stays closed until the pointer leaves the badge", () => {
    const { badge, other } = page();
    start().bind(badge, [make.verdict.disclosed("ai")]);
    pointerOver(badge);
    flush();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(shown()).toBeNull();
    pointerOver(badge.firstElementChild ?? badge);
    flush();
    expect(shown()).toBeNull();
    pointerOver(other);
    pointerOver(badge);
    flush();
    expect(shown()).not.toBeNull();
  });

  it("moves a focus-opened card with its link, once per frame, through a scroll", () => {
    const { link, badge } = page();
    layout(badge, 300);
    start().bind(badge, [make.verdict.disclosed("ai")]);
    focusIn(link);
    layout(badge, 100);
    const moved = vi.spyOn(badge, "getBoundingClientRect");
    document.dispatchEvent(new Event("scroll"));
    document.dispatchEvent(new Event("scroll"));
    document.dispatchEvent(new Event("scroll"));
    expect(frames.size).toBe(1);
    nextFrame();
    expect(moved).toHaveBeenCalledTimes(1);
    // happy-dom resolves no tokens, so the offset is 0: the card sits at the badge's bottom.
    expect(shown()?.style.top).toBe("119px");
    expect(link.getAttribute("aria-describedby")).toBe(HOVER_CARD_ID);
  });

  it("closes a focus-opened card once its link leaves the viewport", () => {
    const { link, badge } = page();
    layout(badge, 300);
    start().bind(badge, [make.verdict.disclosed("ai")]);
    focusIn(link);
    layout(badge, -50);
    document.dispatchEvent(new Event("scroll"));
    nextFrame();
    expect(shown()).toBeNull();
    expect(link.hasAttribute("aria-describedby")).toBe(false);
  });

  it("closes on a page scroll", () => {
    const { badge } = page();
    start().bind(badge, [make.verdict.disclosed("ai")]);
    pointerOver(badge);
    flush();
    document.dispatchEvent(new Event("scroll"));
    expect(shown()).toBeNull();
  });

  it("opens nothing for an unbound element and removes the card on stop", () => {
    const { badge, other } = page();
    const hover = start();
    pointerOver(badge);
    flush();
    expect(shown()).toBeNull();
    hover.bind(badge, [make.verdict.disclosed("ai")]);
    pointerOver(badge);
    flush();
    hover.stop();
    expect(document.getElementById(HOVER_CARD_ID)).toBeNull();
    pointerOver(other);
    pointerOver(badge);
    flush();
    expect(document.getElementById(HOVER_CARD_ID)).toBeNull();
  });

  describe("with several kinds", () => {
    /** Each entry's title and details, as the card shows them. */
    function entries(): string[][] {
      const node = shown();
      return Array.from(
        node?.querySelectorAll(".sar-hovercard-entry") ?? [],
        (entry) => Array.from(entry.children, (line) => line.textContent),
      );
    }

    function open(verdicts: readonly AnyDisclosed[], ownPage = false): void {
      const { badge } = page();
      start().bind(badge, verdicts, ownPage);
      pointerOver(badge);
      flush();
    }

    const heading = (id: KindId) => i18n.t(KIND_BY_ID[id].messages.heading);
    const captured = make.fixture.verdicts;
    const { app } = make.fixture;
    const full = disclosedList(make.verdicts.full());

    function notesOf(verdicts: KindVerdicts): string {
      const { ai } = verdicts;
      if (ai.state !== "disclosed") {
        throw new TypeError(ai.state);
      }
      return ai.notes;
    }

    /** A Unix time as the card writes a date in the catalog's language. */
    const day = (seconds: number) => dateFormat(i18n.locale).format(seconds * 1000);

    /** The developer's Early Access note as the card shows it, with CRLF breaks read as LF. */
    function earlyAccessNote(verdicts: KindVerdicts): string {
      const { earlyaccess } = verdicts;
      if (earlyaccess.state !== "disclosed" || earlyaccess.note === undefined) {
        throw new TypeError(earlyaccess.state);
      }
      const { note } = earlyaccess;
      return note.replaceAll("\r\n", "\n");
    }

    function eulaNames(verdicts: KindVerdicts): string[] {
      const { eula } = verdicts;
      if (eula.state !== "disclosed") {
        throw new TypeError(eula.state);
      }
      return eula.items.map((item) => item.name);
    }

    it("lists every kind in the order given", () => {
      open(full);
      expect(entries().map(([title]) => title)).toEqual(KIND_IDS.map(heading));
      expect(shown()?.querySelectorAll(".sar-hovercard-title")).toHaveLength(KIND_IDS.length);
    });

    it.each(
      [
        ["the developer's entries", ["drm", "ai"], ["badge_card_declared"]],
        ["Valve's entries", ["deck", "machine"], ["badge_card_valve"]],
        ["entries of both", ["deck", "drm"], ["badge_card_declared", "badge_card_valve"]],
        [
          "Valve's kinds with their own lines",
          ["family", "drm", "deck", "machine"],
          ["badge_card_declared", "kind_family_source", "badge_card_valve"],
        ],
      ] as const,
    )("closes %s with the lines that name their source", (_name, kinds, keys) => {
      open(kinds.map((id) => make.verdict.disclosed(id)));
      const lines = [...(shown()?.querySelectorAll(".sar-hovercard-source") ?? [])];
      expect(lines.map((line) => line.textContent)).toEqual(keys.map((key) => i18n.t(key)));
      expect(shown()?.lastElementChild).toBe(lines.at(-1));
    });

    it("marks each entry with its kind, so a custom color reaches its title", () => {
      open(full);
      const kinds = [...(shown()?.querySelectorAll(".sar-hovercard-entry") ?? [])].map((entry) =>
        entry.getAttribute("data-sar-kind")
      );
      expect(kinds).toEqual([...KIND_IDS]);
      expect(shown()?.querySelector(".sar-hovercard-title")?.hasAttribute("style")).toBe(false);
    });

    // Family Sharing as a paid game whose Steam features leave it out shows it.
    const unlisted = [heading("family"), i18n.t("kind_family_unsupported_line")];

    const fullGame = make.verdict.lent;
    const anticheatName = make.text.service();
    const drmText = make.text.service();
    const limit = make.text.note();
    const { name: _kernelName, bootProtection: _boot, ...plainKernel } = make.verdict.disclosed(
      "kernel",
    );
    const { name: _anticheatName, ...unnamedAnticheat } = make.verdict.disclosed("anticheat");
    const note = make.text.note();
    const { released, updated } = make.fixture;
    const noted = make.verdict.disclosed("earlyaccess", { note, released });
    const { note: _note, released: _released, ...bare } = noted;
    const releasedLine = i18n.t("kind_earlyaccess_released", { date: day(released) });
    const updatedLine = i18n.t("kind_earlyaccess_updated", { date: day(updated) });

    // The captured rows come from the batch captured for the tag kinds and from its pages.
    const CASES: readonly (readonly [
      string,
      readonly AnyDisclosed[],
      readonly (readonly string[])[],
    ])[] = [
      ["DRM, a linkable account and a EULA", disclosedList(captured(app.drmAccountEula)), [
        unlisted,
        [heading("iap")],
        [heading("drm"), "Denuvo Anti-tamper"],
        [heading("account"), "Ubisoft Account", i18n.t("kind_account_links")],
        [heading("eula"), ...eulaNames(captured(app.drmAccountEula))],
      ]],
      [
        "kernel anti-cheat with boot protection and no vendor",
        disclosedList(captured(app.kernelBootProtection)),
        [
          unlisted,
          [heading("iap")],
          [heading("pvp"), i18n.t("kind_pvp_category_online")],
          [heading("account"), "EA Account linking required", i18n.t("kind_account_links")],
          [heading("eula"), ...eulaNames(captured(app.kernelBootProtection))],
          [heading("kernel"), i18n.t("kind_kernel_boot")],
        ],
      ],
      [
        "AI notes, a named kernel anti-cheat that stays behind, PvP",
        disclosedList(captured(app.arcRaiders)),
        [
          [heading("ai"), notesOf(captured(app.arcRaiders))],
          // Steam's word for the value is the heading, which the card shows once.
          [heading("family")],
          [heading("iap")],
          [heading("pvp"), i18n.t("kind_pvp_category_online")],
          [heading("eula"), ...eulaNames(captured(app.arcRaiders))],
          [heading("kernel"), "Denuvo", i18n.t("kind_kernel_uninstall")],
        ],
      ],
      [
        "a named anti-cheat that is not kernel level, and IAP alone",
        disclosedList(captured(app.vac)),
        [
          [heading("iap")],
          [heading("anticheat"), "VAC (Valve Anti-Cheat)"],
        ],
      ],
      ["two EULAs", disclosedList(captured(app.pvpOther)), [
        [heading("family")],
        [heading("pvp"), i18n.t("kind_pvp_category_online")],
        [heading("eula"), ...eulaNames(captured(app.pvpOther))],
      ]],
      [
        "a named kernel anti-cheat that stays behind, an account and a EULA",
        disclosedList(captured(app.easyAntiCheat)),
        [
          [heading("iap")],
          [heading("pvp"), i18n.t("kind_pvp_category_online")],
          [heading("account"), "EA Account", i18n.t("kind_account_links")],
          [heading("eula"), ...eulaNames(captured(app.easyAntiCheat))],
          [heading("kernel"), "Easy Anti-Cheat", i18n.t("kind_kernel_uninstall")],
        ],
      ],
      [
        "the developer's note and the release date of a captured early access game",
        disclosedList(captured(app.earlyAccess)),
        [
          [
            heading("earlyaccess"),
            earlyAccessNote(captured(app.earlyAccess)),
            i18n.t("kind_earlyaccess_released", { date: day(make.fixture.released) }),
          ],
          [heading("family")],
        ],
      ],
      [
        "the AI notes read from a captured app page",
        disclosedList(make.fixture.pageVerdicts("5072580-ai-first.html", app.aiWithService)),
        [[
          heading("ai"),
          notesOf(make.fixture.pageVerdicts("5072580-ai-first.html", app.aiWithService)),
        ]],
      ],
      [
        "a rating in Steam's words, and a lent one as rated for the full game",
        [make.verdict.disclosed("deck"), fullGame(make.verdict.disclosed("machine"))],
        [
          [heading("deck"), i18n.t("kind_compat_unsupported")],
          [heading("machine"), i18n.t("kind_full_game_valve"), i18n.t("kind_compat_unsupported")],
        ],
      ],
      ["the family kind's unlisted value in its own line", [make.verdict.disclosed("family")], [
        unlisted,
      ]],
      [
        "the family kind's unlisted value for the full game",
        [fullGame(make.verdict.disclosed("family"))],
        [[
          heading("family"),
          i18n.t("kind_full_game_valve"),
          i18n.t("kind_family_unsupported_line"),
        ]],
      ],
      [
        "the full game's disclosure marked under its heading",
        [
          fullGame(make.verdict.disclosed("anticheat", { name: anticheatName })),
          make.verdict.disclosed("drm", { text: drmText, activationLimit: limit }),
        ],
        [
          [heading("anticheat"), i18n.t("kind_full_game"), anticheatName],
          [heading("drm"), drmText, limit],
        ],
      ],
      [
        "the headings alone for details the data does not carry",
        [plainKernel, unnamedAnticheat, make.verdict.disclosed("pvp", { categoryIds: [1234] })],
        [[heading("kernel")], [heading("anticheat")], [heading("pvp")]],
      ],
      [
        "the early access note, release date and latest update, in that order",
        [{ ...noted, updated }],
        [[heading("earlyaccess"), note, releasedLine, updatedLine]],
      ],
      [
        "the early access note and release date, without an update the page did not give",
        [noted],
        [[heading("earlyaccess"), note, releasedLine]],
      ],
      ["the early access dates without a note", [{ ...bare, released, updated }], [
        [heading("earlyaccess"), releasedLine, updatedLine],
      ]],
      ["the early access heading alone when nothing else is known", [bare], [
        [heading("earlyaccess")],
      ]],
    ];

    it.each(CASES)(
      "shows Steam's lines and the developer's text for %s",
      (_name, verdicts, lines) => {
        open(verdicts);
        expect(entries()).toEqual(lines);
      },
    );

    it("sets the developer's text as text for every kind", () => {
      const markup = make.text.markup();
      const bbcode = `[b]${markup}[/b]`;
      open([
        make.verdict.disclosed("ai", { notes: markup, service: markup }),
        make.verdict.disclosed("drm", { text: markup }),
        make.verdict.disclosed("account", { text: markup }),
        make.verdict.disclosed("eula", { items: [{ name: markup }] }),
        make.verdict.disclosed("anticheat", { name: markup }),
        make.verdict.disclosed("kernel", { name: markup }),
        make.verdict.disclosed("earlyaccess", { note: bbcode }),
      ]);
      expect(document.querySelector(".sar-hovercard b")).toBeNull();
      expect(entries().map((lines) => lines[1])).toEqual([
        markup,
        markup,
        markup,
        markup,
        markup,
        markup,
        bbcode,
      ]);
      expect(shown()?.querySelector(".sar-hovercard-service-name")?.textContent).toBe(markup);
    });

    it("refills the card for other kinds and keeps it for the same verdicts", () => {
      const { badge, other } = page();
      const second = triggerIn(other, "sar-badge");
      const hover = start();
      const first = full.slice(0, 2);
      hover.bind(badge, first);
      hover.bind(second, [...first]);
      pointerOver(badge);
      flush();
      const node = shown()?.firstElementChild;
      pointerOver(second);
      expect(shown()?.firstElementChild).toBe(node);
      hover.bind(second, full.slice(3, 4));
      pointerOver(badge);
      pointerOver(second);
      expect(entries()).toEqual([[heading("iap")]]);
    });

    it("shows the long-text line when a quote other than the first is clamped", () => {
      const note = make.text.note();
      overflowing = (quote) => quote.textContent === note;
      open([make.verdict.disclosed("ai"), make.verdict.disclosed("earlyaccess", { note })]);
      expect(the(".sar-hovercard-more")).toHaveProperty("hidden", false);
    });

    it("opens nothing for a trigger bound to no kind", () => {
      open([]);
      expect(shown()).toBeNull();
    });
  });
});
