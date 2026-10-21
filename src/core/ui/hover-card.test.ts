import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setBody } from "../../../tests/helpers/dom";
import { englishI18n } from "../../../tests/helpers/i18n";
import { disclosedVerdict } from "../../../tests/helpers/verdicts";
import { createHoverCard, HOVER_CARD_ID, type HoverCard, placeCard } from "./hover-card";

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
  let timers: (() => void)[] = [];
  let overflowing = false;
  let card: HoverCard | undefined;

  function delay(callback: () => void): () => void {
    timers.push(callback);
    return () => {
      timers = timers.filter((timer) => timer !== callback);
    };
  }

  function flush(): void {
    const due = timers;
    timers = [];
    for (const timer of due) {
      timer();
    }
  }

  function start(): HoverCard {
    card = createHoverCard(document, i18n, { delay, overflows: () => overflowing });
    return card;
  }

  function page(): { link: HTMLAnchorElement; badge: HTMLElement; other: HTMLElement; } {
    setBody(`
      <a class="row" href="/app/10/"><span class="title">Game</span>
      <span class="sar-badge"><span class="sar-badge-label">AI use disclosed</span></span></a>
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
    timers = [];
    overflowing = false;
  });

  afterEach(() => {
    card?.stop();
    card = undefined;
    document.documentElement.removeAttribute("data-sar-badges");
  });

  it("opens after the pointer rests on a badge and quotes the notes verbatim", () => {
    const { badge } = page();
    start().bind(badge, disclosedVerdict({ notes: "Line one\r\nLine two", service: "Midjourney" }));
    pointerOver(badge.firstElementChild ?? badge);
    expect(shown()).toBeNull();
    flush();
    const node = shown();
    expect(node?.getAttribute("role")).toBe("tooltip");
    expect(node?.querySelector(".sar-hovercard-title")?.textContent).toBe("AI use disclosed");
    expect(node?.querySelector(".sar-hovercard-source")?.textContent)
      .toBe("In the developer's own words:");
    expect(node?.querySelector(".sar-hovercard-notes")?.textContent).toBe("Line one\nLine two");
    expect(node?.querySelector(".sar-hovercard-service")?.textContent)
      .toBe("AI service named by the developer: Midjourney");
    expect(node?.getAttribute("data-sar-side")).toBe("below");
  });

  it("renders notes with markup as plain text", () => {
    const { badge } = page();
    start().bind(badge, disclosedVerdict({ notes: XSS, service: XSS }));
    pointerOver(badge);
    flush();
    expect(shown()?.querySelector(".sar-hovercard-notes")?.textContent).toBe(XSS);
    expect(shown()?.querySelector(".sar-hovercard-service-name")?.textContent).toBe(XSS);
    expect(document.querySelector(".sar-hovercard img")).toBeNull();
  });

  it("leaves out the service line when the developer named none", () => {
    const { badge } = page();
    const { service: _service, ...unnamed } = disclosedVerdict();
    start().bind(badge, unnamed);
    pointerOver(badge);
    flush();
    expect(shown()?.querySelector(".sar-hovercard-service")).toBeNull();
  });

  it("points to the store page only when the clamp cuts a long note", () => {
    const { badge, other } = page();
    const hover = start();
    overflowing = true;
    hover.bind(badge, disclosedVerdict({ notes: "word ".repeat(400) }));
    pointerOver(badge);
    flush();
    const more = shown()?.querySelector<HTMLElement>(".sar-hovercard-more");
    expect(more?.hidden).toBe(false);
    expect(more?.textContent).toBe("The full text is on the game's store page.");
    expect(shown()?.querySelector(".sar-hovercard-notes")?.textContent).toBe("word ".repeat(400));

    overflowing = false;
    const second = document.createElement("span");
    second.className = "sar-badge";
    other.append(second);
    hover.bind(second, disclosedVerdict({ notes: "Short." }));
    pointerOver(second);
    expect(shown()?.querySelector<HTMLElement>(".sar-hovercard-more")?.hidden).toBe(true);
  });

  it("leaves out the store page pointer on the game's own page", () => {
    const { badge, other } = page();
    const hover = start();
    overflowing = true;
    const verdict = disclosedVerdict({ notes: "word ".repeat(400) });
    hover.bind(badge, verdict, true);
    pointerOver(badge);
    flush();
    expect(shown()?.querySelector<HTMLElement>(".sar-hovercard-more")?.hidden).toBe(true);

    const capsule = document.createElement("span");
    capsule.className = "sar-compact";
    other.append(capsule);
    hover.bind(capsule, verdict);
    pointerOver(capsule);
    expect(shown()?.querySelector<HTMLElement>(".sar-hovercard-more")?.hidden).toBe(false);
  });

  it("adds six document listeners and none per badge, however many badges there are", () => {
    const add = vi.spyOn(Node.prototype, "addEventListener");
    setBody(Array.from({ length: 200 }, () => '<span class="sar-badge">AI</span>').join(""));
    const hover = start();
    for (const badge of document.querySelectorAll(".sar-badge")) {
      hover.bind(badge, disclosedVerdict());
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
    start().bind(badge, disclosedVerdict());
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
    start().bind(badge, disclosedVerdict());
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
      start().bind(badge, disclosedVerdict());
    }
    focusIn(link);
    expect(shown()).not.toBeNull();
    expect(link.getAttribute("aria-describedby")).toBe(`${STORE_NOTE_ID} ${HOVER_CARD_ID}`);
    focusOut(link);
    focusIn(other);
    expect(shown()).toBeNull();
    expect(link.getAttribute("aria-describedby")).toBe(STORE_NOTE_ID);
  });

  it("closes on Escape and stays closed until the pointer leaves the badge", () => {
    const { badge, other } = page();
    start().bind(badge, disclosedVerdict());
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

  it("closes on a page scroll", () => {
    const { badge } = page();
    start().bind(badge, disclosedVerdict());
    pointerOver(badge);
    flush();
    document.dispatchEvent(new Event("scroll"));
    expect(shown()).toBeNull();
  });

  it("opens nothing while badges are turned off", () => {
    const { badge } = page();
    document.documentElement.setAttribute("data-sar-badges", "off");
    start().bind(badge, disclosedVerdict());
    pointerOver(badge);
    flush();
    expect(shown()).toBeNull();
  });

  it("opens nothing for an unbound element and removes the card on stop", () => {
    const { badge, other } = page();
    const hover = start();
    pointerOver(badge);
    flush();
    expect(shown()).toBeNull();
    hover.bind(badge, disclosedVerdict());
    pointerOver(badge);
    flush();
    hover.stop();
    expect(document.getElementById(HOVER_CARD_ID)).toBeNull();
    pointerOver(other);
    pointerOver(badge);
    flush();
    expect(document.getElementById(HOVER_CARD_ID)).toBeNull();
  });
});
