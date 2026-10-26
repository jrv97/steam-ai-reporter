import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setBody } from "../../../tests/helpers/dom";
import { capturedVerdicts, pageVerdicts } from "../../../tests/helpers/fixture-verdicts";
import { englishI18n } from "../../../tests/helpers/i18n";
import { manualQueue } from "../../../tests/helpers/manual-queue";
import { disclosedVerdict, FULL_DISCLOSED, lent } from "../../../tests/helpers/verdicts";
import { KIND_IDS, type KindId } from "../kinds/id";
import { KIND_BY_ID } from "../kinds/registry";
import type { AnyDisclosed, KindVerdicts } from "../kinds/verdicts";
import { createHoverCard, HOVER_CARD_ID, type HoverCard, placeCard } from "./hover-card";
import { adoptPageStyles } from "./styles";

const XSS = '<img src=x onerror="alert(1)"> art';
/** The id of a description the store already set on a link. */
const STORE_NOTE_ID = "store-note";

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

  it("aligns the end edges for a compact badge", () => {
    expect(placeCard({ ...trigger, left: 500, right: 700 }, card, viewport, 8, "end").left)
      .toBe(394);
  });

  it("flips above near the bottom edge, and stays below when above has no room either", () => {
    const low = { left: 100, top: 700, right: 220, bottom: 719 };
    expect(placeCard(low, card, viewport, 8, "start")).toMatchObject({ top: 492, side: "above" });
    const tall = { width: 306, height: 750 };
    expect(placeCard(low, tall, viewport, 8, "start").side).toBe("below");
  });

  it("keeps one offset inside the left and right edges", () => {
    expect(placeCard({ ...trigger, left: 900, right: 990 }, card, viewport, 8, "start").left)
      .toBe(686);
    expect(placeCard({ ...trigger, left: 2, right: 40 }, card, viewport, 8, "end").left).toBe(8);
  });
});

describe("createHoverCard", () => {
  const i18n = englishI18n();
  let timers = manualQueue();
  let frames = manualQueue();
  let overflowing = false;
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
      overflows: () => overflowing,
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
      <a class="row" href="/app/10/"><span class="title">Game</span>
      <span class="sar-badge" data-sar-kind="ai">
      <span class="sar-badge-label">${label}</span></span></a>
      <a class="other" href="/app/20/">Other</a>`);
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
    timers = manualQueue();
    frames = manualQueue();
    overflowing = false;
  });

  afterEach(() => {
    card?.stop();
    card = undefined;
    Reflect.deleteProperty(document.documentElement, "clientWidth");
    Reflect.deleteProperty(document.documentElement, "clientHeight");
  });

  it("opens after the pointer rests on a badge and quotes the notes verbatim", () => {
    const { badge } = page();
    start().bind(badge, [
      disclosedVerdict({ notes: "Line one\r\nLine two", service: "Midjourney" }),
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
    expect(node?.querySelector(".sar-hovercard-notes")?.textContent).toBe("Line one\nLine two");
    expect(node?.querySelector(".sar-hovercard-service")?.textContent)
      .toBe(`${i18n.t("badge_card_service_label")} Midjourney`);
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
      const second = document.createElement("span");
      second.className = "sar-badge";
      other.append(second);
      const hover = start();
      hover.bind(badge, [disclosedVerdict()]);
      hover.bind(second, [disclosedVerdict()]);
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
    start().bind(badge, [disclosedVerdict()]);
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
    start().bind(badge, [disclosedVerdict()]);
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
    hover.bind(badge, [disclosedVerdict()]);
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

  it("renders notes with markup as plain text", () => {
    const { badge } = page();
    start().bind(badge, [disclosedVerdict({ notes: XSS, service: XSS })]);
    pointerOver(badge);
    flush();
    expect(shown()?.querySelector(".sar-hovercard-notes")?.textContent).toBe(XSS);
    expect(shown()?.querySelector(".sar-hovercard-service-name")?.textContent).toBe(XSS);
    expect(document.querySelector(".sar-hovercard img")).toBeNull();
  });

  it("leaves out the service line when the developer named none", () => {
    const { badge } = page();
    const { service: _service, ...unnamed } = disclosedVerdict();
    start().bind(badge, [unnamed]);
    pointerOver(badge);
    flush();
    expect(shown()?.querySelector(".sar-hovercard-service")).toBeNull();
  });

  it("points to the store page only when the clamp cuts a long note", () => {
    const { badge, other } = page();
    const hover = start();
    overflowing = true;
    hover.bind(badge, [disclosedVerdict({ notes: "word ".repeat(400) })]);
    pointerOver(badge);
    flush();
    const more = shown()?.querySelector<HTMLElement>(".sar-hovercard-more");
    expect(more?.hidden).toBe(false);
    expect(more?.textContent).toBe(i18n.t("badge_card_more"));
    expect(shown()?.querySelector(".sar-hovercard-notes")?.textContent).toBe("word ".repeat(400));

    overflowing = false;
    const second = document.createElement("span");
    second.className = "sar-badge";
    other.append(second);
    hover.bind(second, [disclosedVerdict({ notes: "Short." })]);
    pointerOver(second);
    expect(shown()?.querySelector<HTMLElement>(".sar-hovercard-more")?.hidden).toBe(true);
  });

  it("opens for a focusable chip on the game's own page and closes when focus leaves", () => {
    const { badge, other } = page();
    badge.tabIndex = 0;
    start().bind(badge, [disclosedVerdict()], true);
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
    overflowing = true;
    const verdict = disclosedVerdict({ notes: "word ".repeat(400) });
    hover.bind(badge, [verdict], true);
    pointerOver(badge);
    flush();
    expect(shown()?.querySelector<HTMLElement>(".sar-hovercard-more")?.hidden).toBe(true);

    const capsule = document.createElement("span");
    capsule.className = "sar-compact";
    other.append(capsule);
    hover.bind(capsule, [verdict]);
    pointerOver(capsule);
    expect(shown()?.querySelector<HTMLElement>(".sar-hovercard-more")?.hidden).toBe(false);
  });

  it("adds six document listeners and none per badge, however many badges there are", () => {
    const add = vi.spyOn(Node.prototype, "addEventListener");
    setBody(Array.from({ length: 200 }, () => '<span class="sar-badge">AI</span>').join(""));
    const hover = start();
    for (const badge of document.querySelectorAll(".sar-badge")) {
      hover.bind(badge, [disclosedVerdict()]);
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
    start().bind(badge, [disclosedVerdict()]);
    pointerOver(badge);
    flush();
    const node = shown();
    pointerOver(document.body);
    if (node !== null) {
      pointerOver(node);
    }
    flush();
    expect(shown()).not.toBeNull();
    pointerOver(other);
    expect(shown()).not.toBeNull();
    flush();
    expect(shown()).toBeNull();
  });

  it("opens nothing when the pointer only passes over a badge", () => {
    const { badge, other } = page();
    start().bind(badge, [disclosedVerdict()]);
    pointerOver(badge);
    pointerOver(other);
    flush();
    expect(shown()).toBeNull();
  });

  it("opens at once on focus of a link holding a badge, and describes the link", () => {
    const { link, other } = page();
    const badge = link.querySelector(".sar-badge");
    link.setAttribute("aria-describedby", STORE_NOTE_ID);
    if (badge !== null) {
      start().bind(badge, [disclosedVerdict()]);
    }
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
    start().bind(badge, [disclosedVerdict()]);
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
    start().bind(badge, [disclosedVerdict()]);
    other.focus();
    pointerOver(badge);
    flush();
    expect(shown()).not.toBeNull();
    expect(link.hasAttribute("aria-describedby")).toBe(false);
    expect(other.hasAttribute("aria-describedby")).toBe(false);
  });

  it("closes on Escape and stays closed until the pointer leaves the badge", () => {
    const { badge, other } = page();
    start().bind(badge, [disclosedVerdict()]);
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
    start().bind(badge, [disclosedVerdict()]);
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
    start().bind(badge, [disclosedVerdict()]);
    focusIn(link);
    layout(badge, -50);
    document.dispatchEvent(new Event("scroll"));
    nextFrame();
    expect(shown()).toBeNull();
    expect(link.hasAttribute("aria-describedby")).toBe(false);
  });

  it("closes on a page scroll", () => {
    const { badge } = page();
    start().bind(badge, [disclosedVerdict()]);
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
    hover.bind(badge, [disclosedVerdict()]);
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

    /** The disclosed verdicts of an app, in registry order. */
    function disclosedOf(verdicts: KindVerdicts): AnyDisclosed[] {
      return KIND_IDS.flatMap((id) => {
        const verdict = verdicts[id];
        return verdict.state === "disclosed" ? [verdict] : [];
      });
    }

    const heading = (id: KindId) => i18n.t(KIND_BY_ID[id].messages.heading);

    function notesOf(verdicts: KindVerdicts): string {
      const { ai } = verdicts;
      return ai.state === "disclosed" ? ai.notes : "";
    }

    function eulaNames(verdicts: KindVerdicts): string[] {
      const { eula } = verdicts;
      return eula.state === "disclosed" ? eula.items.map((item) => item.name) : [];
    }

    it("lists every kind in the order given", () => {
      open(disclosedOf(FULL_DISCLOSED));
      expect(entries().map(([title]) => title)).toEqual(KIND_IDS.map(heading));
      expect(shown()?.querySelectorAll(".sar-hovercard-title")).toHaveLength(KIND_IDS.length);
    });

    it.each(
      [
        ["the developer's entries", ["drm", "ai"], ["badge_card_declared"]],
        ["Valve's entries", ["deck", "machine"], ["badge_card_valve"]],
        ["entries of both", ["deck", "drm"], ["badge_card_declared", "badge_card_valve"]],
      ] as const,
    )("closes %s with the lines that name their source", (_name, kinds, keys) => {
      open(kinds.map((id) => FULL_DISCLOSED[id]));
      const lines = [...(shown()?.querySelectorAll(".sar-hovercard-source") ?? [])];
      expect(lines.map((line) => line.textContent)).toEqual(keys.map((key) => i18n.t(key)));
      expect(shown()?.lastElementChild).toBe(lines.at(-1));
    });

    it("shows a rating in Steam's words, and a lent one as rated for the full game", () => {
      open([FULL_DISCLOSED.deck, lent(FULL_DISCLOSED.machine)]);
      expect(entries()).toEqual([
        [heading("deck"), i18n.t("kind_compat_unsupported")],
        [heading("machine"), i18n.t("kind_full_game_valve"), i18n.t("kind_compat_unsupported")],
      ]);
    });

    it.each(
      [
        ["Steam's words and what its list shows", FULL_DISCLOSED.family, []],
        ["the same for the full game", lent(FULL_DISCLOSED.family), ["kind_full_game_valve"]],
      ] as const,
    )("shows the family kind's unlisted value with %s", (_name, verdict, lead) => {
      open([verdict]);
      expect(entries()).toEqual([
        [
          heading("family"),
          ...lead.map((key) => i18n.t(key)),
          i18n.t("kind_family_unsupported"),
          i18n.t("kind_family_unlisted"),
        ],
      ]);
      expect(shown()?.lastElementChild?.textContent).toBe(i18n.t("badge_card_valve"));
    });

    it("marks each entry with its kind, so a custom color reaches its title", () => {
      open(disclosedOf(FULL_DISCLOSED));
      const kinds = [...(shown()?.querySelectorAll(".sar-hovercard-entry") ?? [])].map((entry) =>
        entry.getAttribute("data-sar-kind")
      );
      expect(kinds).toEqual([...KIND_IDS]);
      expect(shown()?.querySelector(".sar-hovercard-title")?.hasAttribute("style")).toBe(false);
    });

    // Family Sharing as a paid game whose Steam features leave it out shows it.
    const unlisted = [
      heading("family"),
      i18n.t("kind_family_unsupported"),
      i18n.t("kind_family_unlisted"),
    ];

    // The details of each kind, from the batch captured for the tag kinds and from its pages.
    const CASES: readonly (readonly [string, KindVerdicts, readonly (readonly string[])[]])[] = [
      ["DRM, a linkable account and a EULA (3751950)", capturedVerdicts(3751950), [
        [heading("drm"), "Denuvo Anti-tamper"],
        [heading("account"), "Ubisoft Account", i18n.t("kind_account_links")],
        [heading("eula"), ...eulaNames(capturedVerdicts(3751950))],
        [heading("iap")],
        unlisted,
      ]],
      [
        "kernel anti-cheat with boot protection and no vendor (2807960)",
        capturedVerdicts(2807960),
        [
          [heading("kernel"), i18n.t("kind_kernel_boot")],
          [heading("account"), "EA Account linking required", i18n.t("kind_account_links")],
          [heading("eula"), ...eulaNames(capturedVerdicts(2807960))],
          [heading("pvp"), i18n.t("kind_pvp_category_online")],
          [heading("iap")],
          unlisted,
        ],
      ],
      [
        "AI notes, a named kernel anti-cheat that stays behind, PvP (1808500)",
        capturedVerdicts(1808500),
        [
          [heading("ai"), notesOf(capturedVerdicts(1808500))],
          [heading("kernel"), "Denuvo", i18n.t("kind_kernel_uninstall")],
          [heading("eula"), ...eulaNames(capturedVerdicts(1808500))],
          [heading("pvp"), i18n.t("kind_pvp_category_online")],
          [heading("iap")],
          // Steam's word for the value is the heading, which the card shows once.
          [heading("family")],
        ],
      ],
      ["a named anti-cheat that is not kernel level, and IAP alone (730)", capturedVerdicts(730), [
        [heading("anticheat"), "VAC (Valve Anti-Cheat)"],
        [heading("iap")],
      ]],
      ["two EULAs (1245620)", capturedVerdicts(1245620), [
        [heading("eula"), ...eulaNames(capturedVerdicts(1245620))],
        [heading("pvp"), i18n.t("kind_pvp_category_online")],
        [heading("family")],
      ]],
      [
        "a named kernel anti-cheat that stays behind, an account and a EULA (1172470)",
        capturedVerdicts(1172470),
        [
          [heading("kernel"), "Easy Anti-Cheat", i18n.t("kind_kernel_uninstall")],
          [heading("account"), "EA Account", i18n.t("kind_account_links")],
          [heading("eula"), ...eulaNames(capturedVerdicts(1172470))],
          [heading("pvp"), i18n.t("kind_pvp_category_online")],
          [heading("iap")],
        ],
      ],
      [
        "the AI notes read from a captured app page (5072580)",
        pageVerdicts("5072580-ai-first.html", 5072580),
        [[heading("ai"), notesOf(pageVerdicts("5072580-ai-first.html", 5072580))]],
      ],
    ];

    it.each(CASES)(
      "shows Steam's lines and the developer's text for %s",
      (_name, verdicts, lines) => {
        open(disclosedOf(verdicts));
        expect(entries()).toEqual(lines);
      },
    );

    it("sets the developer's text as text for every kind", () => {
      const markup = [
        { ...FULL_DISCLOSED.drm, text: XSS },
        { ...FULL_DISCLOSED.account, text: XSS },
        { ...FULL_DISCLOSED.eula, items: [{ name: XSS }] },
        { ...FULL_DISCLOSED.anticheat, name: XSS },
        { ...FULL_DISCLOSED.kernel, name: XSS },
      ];
      open(markup);
      expect(document.querySelector(".sar-hovercard img")).toBeNull();
      expect(entries().map((lines) => lines[1])).toEqual([XSS, XSS, XSS, XSS, XSS]);
    });

    it("marks the full game's disclosure under its heading, and names the developer", () => {
      const { drm, anticheat } = FULL_DISCLOSED;
      open([lent(anticheat), drm]);
      expect(entries()).toEqual([
        [heading("anticheat"), i18n.t("kind_full_game"), anticheat.name],
        [heading("drm"), drm.text, drm.activationLimit],
      ]);
      expect(shown()?.lastElementChild?.textContent).toBe(i18n.t("badge_card_declared"));
    });

    it("leaves out the details the data does not carry", () => {
      const { name: _kernelName, bootProtection: _boot, ...kernel } = FULL_DISCLOSED.kernel;
      const { name: _anticheatName, ...anticheat } = FULL_DISCLOSED.anticheat;
      open([kernel, anticheat, { ...FULL_DISCLOSED.pvp, categoryIds: [1234] }]);
      expect(entries()).toEqual([[heading("kernel")], [heading("anticheat")], [heading("pvp")]]);
    });

    it("refills the card for other kinds and keeps it for the same verdicts", () => {
      const { badge, other } = page();
      const second = document.createElement("span");
      second.className = "sar-badge";
      other.append(second);
      const hover = start();
      const first = disclosedOf(FULL_DISCLOSED).slice(0, 2);
      hover.bind(badge, first);
      hover.bind(second, [...first]);
      pointerOver(badge);
      flush();
      const node = shown()?.firstElementChild;
      pointerOver(second);
      expect(shown()?.firstElementChild).toBe(node);
      hover.bind(second, disclosedOf(FULL_DISCLOSED).slice(2, 3));
      pointerOver(badge);
      pointerOver(second);
      expect(entries()).toEqual([[heading("anticheat"), FULL_DISCLOSED.anticheat.name]]);
    });

    it("opens nothing for a trigger bound to no kind", () => {
      open([]);
      expect(shown()).toBeNull();
    });

    it("shows the long-text line when any quote is clamped", () => {
      overflowing = true;
      open(disclosedOf(FULL_DISCLOSED));
      expect(shown()?.querySelector<HTMLElement>(".sar-hovercard-more")?.hidden).toBe(false);
    });
  });
});
