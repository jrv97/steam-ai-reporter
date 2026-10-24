import type { AiDisclosed } from "../kinds/ai";
import type { TagKind } from "../kinds/kind";
import type { MessageCatalog } from "../ports";
import { normalizeBreaks } from "./notes";

/** The card's id, the target of `aria-describedby` while focus holds it open. */
export const HOVER_CARD_ID = "sar-hovercard";

/** Set to `open` on the root element while the card shows; page CSS hides the store's hover. */
const OPEN_MARK = "data-sar-hovercard";

/** Elements that can open the card. The summary row holds a chip, so lookups climb past it. */
const TRIGGER_SELECTOR = ".sar-summary-row, .sar-badge, .sar-compact";

/** A pointer at rest this long opens the card; a sweep across a grid opens nothing. */
const OPEN_DELAY = 150;
/** Grace after the pointer leaves, so it can cross the offset onto the card. */
const CLOSE_DELAY = 100;

const DESCRIBED_BY = "aria-describedby";
const ESCAPE = "Escape";

/** The token that sets the gap between trigger and card, and the card's viewport margin. */
const OFFSET_TOKEN = "--sar-hovercard-offset";

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Which trigger edge the card lines up with: compact badges hang it back over the capsule. */
export type Align = "start" | "end";

export interface CardPosition {
  readonly left: number;
  readonly top: number;
  readonly side: "below" | "above";
}

/**
 * Where the card goes: `offset` below the trigger, or above it when it would cross the bottom
 * edge and fits there, and at least `offset` inside the left and right edges.
 */
export function placeCard(
  trigger: Box,
  card: Size,
  viewport: Size,
  offset: number,
  align: Align,
): CardPosition {
  const below = trigger.bottom + offset;
  const above = trigger.top - offset - card.height;
  const side = below + card.height + offset <= viewport.height || above < offset
    ? "below"
    : "above";
  const preferred = align === "start" ? trigger.left : trigger.right - card.width;
  const left = Math.max(offset, Math.min(preferred, viewport.width - offset - card.width));
  return { left, top: side === "below" ? below : above, side };
}

/** Elements register here as they render; the card looks them up when an event reaches them. */
export interface CardTriggers {
  /**
   * Makes the element open the card with this kind's verdict. Sets nothing on it. `ownPage` marks
   * a trigger on the game's own store page, where the card does not point to that page.
   */
  bind(trigger: Element, kind: TagKind, verdict: AiDisclosed, ownPage?: boolean): void;
}

export interface HoverCard extends CardTriggers {
  /** Removes the listeners and the card. */
  stop(): void;
}

export interface HoverCardOptions {
  /** Runs a callback after a delay and returns its cancel; `setTimeout` by default. */
  readonly delay?: (callback: () => void, ms: number) => () => void;
  /** Whether the clamped notes hide text; compares scroll and client height by default. */
  readonly overflows?: (notes: HTMLElement) => boolean;
  /** Schedules the follow after a scroll; `requestAnimationFrame` by default. */
  readonly frame?: (callback: () => void) => void;
}

type Via = "pointer" | "focus";

interface Open {
  readonly trigger: Element;
  readonly via: Via;
}

interface Card {
  readonly root: HTMLElement;
  readonly notes: HTMLElement;
  readonly more: HTMLElement;
}

/** What a follow reuses from the last placement, so it reads only the trigger's box. */
interface Placed {
  readonly size: Size;
  readonly offset: number;
  readonly align: Align;
}

interface Binding {
  readonly kind: TagKind;
  readonly verdict: AiDisclosed;
  readonly ownPage: boolean;
}

interface Described {
  readonly element: Element;
  readonly previous: string | null;
}

function asElement(target: EventTarget | null): Element | undefined {
  return target instanceof Element ? target : undefined;
}

/**
 * Shows the card in the browser's top layer, above store popovers opened before it. Hiding and
 * showing again puts it last in the stack. Engines without the Popover API keep the z-index.
 */
function raise(root: HTMLElement): void {
  try {
    leaveTopLayer(root);
    root.showPopover();
  } catch {
    // No Popover API: the card stays in the page at its z-index.
  }
}

function leaveTopLayer(root: HTMLElement): void {
  try {
    if (root.matches(":popover-open")) {
      root.hidePopover();
    }
  } catch {
    // No Popover API.
  }
}

function defaultOverflows(notes: HTMLElement): boolean {
  return notes.scrollHeight > notes.clientHeight;
}

/**
 * The hover card: one panel per page, built like the store's game hover popup, that quotes the
 * developer's notes for the badge or summary row under the pointer or focus. Triggers register
 * in a `WeakMap`; six delegated listeners on the document serve every trigger on the page. The
 * card closes on `pagehide`.
 */
export function createHoverCard(
  doc: Document,
  i18n: MessageCatalog,
  options: HoverCardOptions = {},
): HoverCard {
  const view = doc.defaultView;
  const delay = options.delay ?? ((callback: () => void, ms: number) => {
    if (view === null) {
      return () => undefined;
    }
    const id = view.setTimeout(callback, ms);
    return () => {
      view.clearTimeout(id);
    };
  });
  const overflows = options.overflows ?? defaultOverflows;
  const frame = options.frame ?? ((callback: () => void) => {
    if (view === null) {
      callback();
    } else {
      view.requestAnimationFrame(callback);
    }
  });
  const bindings = new WeakMap<Element, Binding>();

  let card: Card | undefined;
  let filled: AiDisclosed | undefined;
  /** Whether the clamp hides part of the filled notes. */
  let clamped = false;
  let open: Open | undefined;
  let described: Described | undefined;
  /** The trigger a pending open is for, so moves inside it do not restart the delay. */
  let pending: Element | undefined;
  let cancel: (() => void) | undefined;
  /** Closed with Escape: stays closed until the pointer leaves it or focus moves. */
  let dismissed: Element | undefined;
  let placed: Placed | undefined;
  /** A follow is queued for the next frame. */
  let following = false;

  function line(className: string, text: string): HTMLElement {
    const node = doc.createElement("p");
    node.className = className;
    node.textContent = text;
    return node;
  }

  function ensureCard(): Card {
    if (card !== undefined) {
      if (!card.root.isConnected) {
        doc.body.append(card.root);
      }
      return card;
    }
    const root = doc.createElement("div");
    root.className = "sar-hovercard";
    root.id = HOVER_CARD_ID;
    root.setAttribute("role", "tooltip");
    root.setAttribute("popover", "manual");
    root.hidden = true;
    const notes = line("sar-hovercard-notes", "");
    const more = line("sar-hovercard-more", i18n.t("badge_card_more"));
    more.hidden = true;
    doc.body.append(root);
    card = { root, notes, more };
    return card;
  }

  /** Rebuilds the shown card for another verdict; the same verdict keeps what is there. */
  function fill(target: Card, { kind, verdict, ownPage }: Binding): void {
    if (filled === verdict) {
      target.more.hidden = ownPage || !clamped;
      return;
    }
    filled = verdict;
    target.notes.textContent = normalizeBreaks(verdict.notes);
    const parts: HTMLElement[] = [
      line("sar-hovercard-title", i18n.t(kind.messages.label)),
      line("sar-hovercard-source", i18n.t("badge_card_source")),
      target.notes,
    ];
    if (verdict.service !== undefined && verdict.service !== "") {
      const service = line("sar-hovercard-service", i18n.t(kind.messages.cardService));
      const name = doc.createElement("span");
      name.className = "sar-hovercard-service-name";
      name.textContent = verdict.service;
      service.append(" ", name);
      parts.push(service);
    }
    parts.push(target.more);
    target.root.replaceChildren(...parts);
    // Measured once per verdict, on the shown card: the clamp depends on the text and the width.
    target.more.hidden = true;
    clamped = overflows(target.notes);
    target.more.hidden = ownPage || !clamped;
  }

  function release(): void {
    if (described === undefined) {
      return;
    }
    const { element, previous } = described;
    described = undefined;
    if (previous === null) {
      element.removeAttribute(DESCRIBED_BY);
    } else {
      element.setAttribute(DESCRIBED_BY, previous);
    }
  }

  function describe(element: Element): void {
    const previous = element.getAttribute(DESCRIBED_BY);
    described = { element, previous };
    element.setAttribute(
      DESCRIBED_BY,
      previous === null || previous === "" ? HOVER_CARD_ID : `${previous} ${HOVER_CARD_ID}`,
    );
  }

  function clearTimer(): void {
    cancel?.();
    cancel = undefined;
    pending = undefined;
  }

  function schedule(ms: number, callback: () => void): void {
    clearTimer();
    cancel = delay(() => {
      cancel = undefined;
      pending = undefined;
      callback();
    }, ms);
  }

  function close(): void {
    clearTimer();
    release();
    open = undefined;
    doc.documentElement.removeAttribute(OPEN_MARK);
    if (card !== undefined) {
      card.root.hidden = true;
      leaveTopLayer(card.root);
    }
  }

  function show(trigger: Element, via: Via, focused?: Element): void {
    const binding = bindings.get(trigger);
    if (
      binding === undefined || !trigger.isConnected
      || doc.documentElement.getAttribute("data-sar-badges") === "off"
    ) {
      close();
      return;
    }
    clearTimer();
    release();
    const target = ensureCard();
    target.root.hidden = false;
    raise(target.root);
    fill(target, binding);
    if (focused !== undefined) {
      describe(focused);
    }
    place(target, trigger);
    doc.documentElement.setAttribute(OPEN_MARK, "open");
    open = { trigger, via };
  }

  /** Puts the card next to its trigger: reads trigger, card, viewport and offset, then writes. */
  function place(target: Card, trigger: Element): void {
    const box = trigger.getBoundingClientRect();
    const size = target.root.getBoundingClientRect();
    const token = Number.parseFloat(
      view?.getComputedStyle(target.root).getPropertyValue(OFFSET_TOKEN) ?? "",
    );
    placed = {
      size: { width: size.width, height: size.height },
      offset: Number.isFinite(token) ? token : 0,
      align: trigger.classList.contains("sar-compact") ? "end" : "start",
    };
    write(target, placeCard(box, placed.size, viewportSize(), placed.offset, placed.align));
  }

  function viewportSize(): Size {
    return { width: doc.documentElement.clientWidth, height: doc.documentElement.clientHeight };
  }

  function write(target: Card, position: CardPosition): void {
    target.root.style.left = `${position.left}px`;
    target.root.style.top = `${position.top}px`;
    target.root.setAttribute("data-sar-side", position.side);
  }

  /**
   * Moves a focus-opened card with its trigger, once per frame and with one read of the trigger's
   * box. A trigger that left the viewport closes the card.
   */
  function follow(): void {
    if (following) {
      return;
    }
    following = true;
    frame(() => {
      following = false;
      if (open?.via !== "focus" || card === undefined || placed === undefined) {
        return;
      }
      const box = open.trigger.getBoundingClientRect();
      const viewport = viewportSize();
      const outside = box.bottom <= 0 || box.top >= viewport.height || box.right <= 0
        || box.left >= viewport.width;
      if (!open.trigger.isConnected || outside) {
        close();
        return;
      }
      write(card, placeCard(box, placed.size, viewport, placed.offset, placed.align));
    });
  }

  /** The registered trigger at or around an element, climbing past the summary row's chip. */
  function triggerAt(element: Element): Element | undefined {
    let node = element.closest(TRIGGER_SELECTOR);
    while (node !== null) {
      if (bindings.has(node)) {
        return node;
      }
      node = node.parentElement?.closest(TRIGGER_SELECTOR) ?? null;
    }
    return undefined;
  }

  /** A focused store link that holds a badge: a search row or a capsule link. */
  function triggerIn(element: Element): Element | undefined {
    if (element.tagName !== "A") {
      return undefined;
    }
    for (const node of element.querySelectorAll(TRIGGER_SELECTOR)) {
      if (bindings.has(node)) {
        return node;
      }
    }
    return undefined;
  }

  function onPointerOver(event: Event): void {
    const element = asElement(event.target);
    if (element === undefined) {
      return;
    }
    if (card?.root.contains(element) === true) {
      if (open !== undefined) {
        clearTimer();
      }
      return;
    }
    const trigger = triggerAt(element);
    if (trigger === undefined) {
      dismissed = undefined;
      if (open === undefined) {
        clearTimer();
      } else if (open.via === "pointer" && pending === undefined && cancel === undefined) {
        schedule(CLOSE_DELAY, close);
      }
      return;
    }
    if (trigger === dismissed) {
      return;
    }
    dismissed = undefined;
    if (open?.trigger === trigger) {
      clearTimer();
    } else if (open !== undefined) {
      show(trigger, "pointer");
    } else if (pending !== trigger) {
      schedule(OPEN_DELAY, () => {
        show(trigger, "pointer");
      });
      pending = trigger;
    }
  }

  function onPointerOut(event: Event): void {
    if (!("relatedTarget" in event) || event.relatedTarget !== null) {
      return;
    }
    // The pointer left the window.
    dismissed = undefined;
    if (open?.via === "focus") {
      clearTimer();
    } else {
      close();
    }
  }

  function onFocusIn(event: Event): void {
    const element = asElement(event.target);
    if (element === undefined || card?.root.contains(element) === true) {
      return;
    }
    dismissed = undefined;
    const trigger = triggerAt(element) ?? triggerIn(element);
    if (trigger !== undefined) {
      show(trigger, "focus", element);
    } else if (open?.via === "focus") {
      close();
    }
  }

  function onFocusOut(event: Event): void {
    if (open?.via !== "focus") {
      return;
    }
    const next = "relatedTarget" in event ? event.relatedTarget : null;
    const element = next instanceof Element ? next : undefined;
    if (element === undefined || card?.root.contains(element) !== true) {
      close();
    }
  }

  function onKeyDown(event: Event): void {
    if (!("key" in event) || event.key !== ESCAPE) {
      return;
    }
    if (open !== undefined) {
      dismissed = open.trigger;
    }
    close();
  }

  function onScroll(event: Event): void {
    if (open === undefined && pending === undefined) {
      return;
    }
    const element = asElement(event.target);
    if (card !== undefined && element !== undefined && card.root.contains(element)) {
      return;
    }
    // Focus scrolls its target into view, so a focus-opened card follows it instead of closing.
    if (open?.via === "focus") {
      follow();
    } else {
      close();
    }
  }

  const listeners = [
    ["pointerover", onPointerOver],
    ["pointerout", onPointerOut],
    ["focusin", onFocusIn],
    ["focusout", onFocusOut],
    ["keydown", onKeyDown],
    ["scroll", onScroll],
  ] as const;
  const capture = { capture: true, passive: true } as const;
  for (const [type, listener] of listeners) {
    doc.addEventListener(type, listener, capture);
  }
  view?.addEventListener("pagehide", close);

  return {
    bind(trigger, kind, verdict, ownPage = false) {
      bindings.set(trigger, { kind, verdict, ownPage });
    },
    stop() {
      close();
      for (const [type, listener] of listeners) {
        doc.removeEventListener(type, listener, capture);
      }
      view?.removeEventListener("pagehide", close);
      card?.root.remove();
      card = undefined;
      filled = undefined;
    },
  };
}
