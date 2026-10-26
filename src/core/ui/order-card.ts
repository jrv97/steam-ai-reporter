import { KIND_IDS, type KindId } from "../kinds/id";
import { OVERLAY_CHIPS, sameOrder } from "../kinds/order";
import { KIND_BY_ID } from "../kinds/registry";
import type { MessageCatalog } from "../ports";
import { createElement } from "./element";
import { parseIcon } from "./icon";
import { dropIndex, heldIndex, type Reorder, reorder } from "./reorder";

/** What the Tag order card needs from the form around it. */
export interface OrderCardDeps {
  readonly i18n: MessageCatalog;
  /** Starts every id in the card, so two forms on one page never share one. */
  readonly idPrefix: string;
  /** Says a step through the form's live region. */
  readonly announce: (text: string) => void;
  /** Stores a new order, then says `spoken`; on a failure the form shows `error` and syncs. */
  readonly save: (order: readonly KindId[], spoken: string) => void;
  /** The form's error line for a save that failed. */
  readonly error: HTMLElement;
}

export interface OrderCard {
  readonly section: HTMLElement;
  /** Shows a stored order, unless a row is held. */
  sync(order: readonly KindId[]): void;
  /** Serves a `pointerdown`, `keydown` or `click` the form's root heard; others pass by. */
  handle(event: Event): void;
  /** Lets go of a drag or a held row, as when the form goes away. */
  stop(): void;
}

/** Names the kind a handle moves; the handle is the one control of its row. */
const ORDER_ATTRIBUTE = "data-sar-order";
const RESET_ATTRIBUTE = "data-sar-order-reset";
const HELD_ATTRIBUTE = "data-sar-held";
const DRAGGING_ATTRIBUTE = "data-sar-dragging";
const PRESSED = "aria-pressed";
/** How far a pressed pointer moves before the press is a drag, in CSS pixels. */
const DRAG_THRESHOLD = 4;
/** An original grip: six squares in two columns. */
const GRIP_SVG = '<svg viewBox="0 0 10 16" aria-hidden="true" focusable="false">'
  + '<path d="M2 1h2v2H2zm4 0h2v2H6zM2 7h2v2H2zm4 0h2v2H6zM2 13h2v2H2zm4 0h2v2H6z"/></svg>';
const DRAG_EVENTS = ["pointermove", "pointerup", "pointercancel"] as const;

/** The place a key gives the held row, from its place and the length of the list. */
const KEY_STEPS: ReadonlyMap<string, (at: number, count: number) => number> = new Map([
  ["ArrowUp", (at: number) => at - 1],
  ["ArrowDown", (at: number) => at + 1],
  ["Home", () => 0],
  ["End", (_at: number, count: number) => count - 1],
]);

interface Row {
  readonly element: HTMLElement;
  readonly handle: HTMLButtonElement;
  /** The marker of the rows a small image shows. */
  readonly small: HTMLElement;
}

/** A pointer drag of one row, from its press to its release. */
interface Drag {
  readonly handle: HTMLElement;
  readonly pointer: number;
  readonly id: KindId;
  readonly startY: number;
  /** The rows in their order when the press began, and their middles then. */
  readonly rows: readonly HTMLElement[];
  readonly middles: readonly number[];
  readonly from: number;
  /** How far the other rows shift to open the gap: the dragged row's pitch. */
  readonly step: number;
  /** Past the threshold: a press that never gets there is a click. */
  readonly moving: boolean;
}

/**
 * The Tag order card: one list of the kinds, each row with a grip handle, its chip word and
 * Steam's line. A row moves by a pointer drag on its handle, by keys (Space or Enter picks it up,
 * the arrows, Home and End move it, Space or Enter drops it and Escape puts it back), or by a click
 * on its handle and then on the handle of the place it goes to. The form's one listener per event
 * type hands it the events (`handle`); a drag's own listeners live on its handle while it lasts.
 */
export function createOrderCard(doc: Document, deps: OrderCardDeps): OrderCard {
  const { i18n, idPrefix } = deps;
  const section = createElement(doc, "section", "sar-card");
  const title = createElement(doc, "h3", "sar-card-title", i18n.t("options_order_title"));
  title.id = `${idPrefix}order`;
  title.tabIndex = -1;
  section.setAttribute("aria-labelledby", title.id);
  const how = createElement(doc, "p", "sar-field-help", i18n.t("options_order_how"));
  how.id = `${idPrefix}order-how`;
  const list = createElement(doc, "ul", "sar-order-list");
  const grip = parseIcon(doc, GRIP_SVG);
  const rows = new Map<KindId, Row>();
  for (const id of KIND_IDS) {
    const { messages } = KIND_BY_ID[id];
    const chip = i18n.t(messages.chip);
    const heading = i18n.t(messages.heading);
    const handle = createElement(doc, "button", "sar-order-handle");
    handle.type = "button";
    handle.setAttribute(ORDER_ATTRIBUTE, id);
    handle.setAttribute("aria-label", i18n.t("options_order_handle", { name: chip }));
    handle.setAttribute("aria-describedby", how.id);
    if (grip !== undefined) {
      handle.append(grip.cloneNode(true));
    }
    const small = createElement(doc, "span", "sar-order-small", i18n.t("options_order_small"));
    const element = createElement(doc, "li", "sar-order-row");
    element.append(handle, createElement(doc, "span", "sar-order-chip", chip));
    // PvP's heading is its chip word, said once
    if (heading !== chip) {
      element.append(createElement(doc, "span", "sar-order-heading", heading));
    }
    element.append(small);
    rows.set(id, { element, handle, small });
  }
  const reset = createElement(doc, "button", "sar-button", i18n.t("options_order_reset"));
  reset.type = "button";
  reset.setAttribute("data-sar-variant", "quiet");
  reset.setAttribute(RESET_ATTRIBUTE, "");
  section.append(
    title,
    createElement(
      doc,
      "p",
      "sar-field-help",
      i18n.t("options_order_help", { count: String(OVERLAY_CHIPS) }),
    ),
    how,
    list,
    reset,
    deps.error,
  );

  let state: Reorder<KindId> = { mode: "idle", order: KIND_IDS };
  let drag: Drag | undefined;
  /** Set when a drag ends, so the click its release fires picks nothing up. */
  let swallowClick = false;

  function nameOf(id: KindId): string {
    return i18n.t(KIND_BY_ID[id].messages.chip);
  }

  function focused(): Element | null {
    const scope = section.getRootNode();
    return scope instanceof Document || scope instanceof ShadowRoot ? scope.activeElement : null;
  }

  /** Puts the rows in the state's order, keeping focus, and marks the held and the small rows. */
  function place(): void {
    const { order } = state;
    const placed = order.every((id, index) => list.children[index] === rows.get(id)?.element);
    if (!placed) {
      const active = focused();
      list.append(...order.flatMap((id) => rows.get(id)?.element ?? []));
      if (active instanceof HTMLElement && list.contains(active)) {
        active.focus();
      }
    }
    order.forEach((id, index) => {
      const row = rows.get(id);
      const held = state.mode === "held" && state.held === id;
      row?.small.toggleAttribute("hidden", index >= OVERLAY_CHIPS);
      row?.element.toggleAttribute(HELD_ATTRIBUTE, held);
      row?.handle.setAttribute(PRESSED, String(held));
    });
  }

  function positionText(): { readonly position: string; readonly count: string; } {
    return { position: String(heldIndex(state) + 1), count: String(state.order.length) };
  }

  function pick(id: KindId): void {
    state = reorder(state, { type: "pick", id });
    if (state.mode === "held") {
      place();
      deps.announce(i18n.t("options_order_picked", { name: nameOf(id), ...positionText() }));
    }
  }

  /** Moves the held row and says where it went; whether it moved at all. */
  function moveHeld(to: number): boolean {
    const from = heldIndex(state);
    state = reorder(state, { type: "move", to });
    if (heldIndex(state) === from) {
      return false;
    }
    deps.announce(i18n.t("options_order_moved", positionText()));
    return true;
  }

  function drop(): void {
    if (state.mode !== "held") {
      return;
    }
    const { held, before } = state;
    const spoken = i18n.t("options_order_dropped", { name: nameOf(held), ...positionText() });
    state = reorder(state, { type: "drop" });
    place();
    if (sameOrder(state.order, before)) {
      deps.announce(spoken);
    } else {
      deps.save(state.order, spoken);
    }
  }

  function cancel(): void {
    if (state.mode !== "held") {
      return;
    }
    const { held } = state;
    state = reorder(state, { type: "cancel" });
    place();
    deps.announce(
      i18n.t("options_order_cancelled", {
        name: nameOf(held),
        position: String(state.order.indexOf(held) + 1),
      }),
    );
  }

  function handleOf(target: EventTarget | null): {
    readonly handle: HTMLElement;
    readonly id: KindId;
  } | undefined {
    const handle = target instanceof Element
      ? target.closest<HTMLElement>(`[${ORDER_ATTRIBUTE}]`)
      : null;
    const id = KIND_IDS.find((each) => each === handle?.getAttribute(ORDER_ATTRIBUTE));
    return handle === null || id === undefined ? undefined : { handle, id };
  }

  /** A click on a handle: picks its row up, drops the held row there, or drops it in place. */
  function onClick(target: EventTarget | null): void {
    if (target instanceof Element && target.closest(`[${RESET_ATTRIBUTE}]`) !== null) {
      state = reorder(reorder(state, { type: "cancel" }), { type: "load", order: KIND_IDS });
      place();
      deps.save(KIND_IDS, i18n.t("options_order_reset_done"));
      return;
    }
    const found = handleOf(target);
    if (found === undefined || drag !== undefined) {
      return;
    }
    if (swallowClick) {
      swallowClick = false;
      return;
    }
    if (state.mode === "idle") {
      pick(found.id);
      return;
    }
    state = reorder(state, { type: "move", to: state.order.indexOf(found.id) });
    drop();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (state.mode !== "held" || drag !== undefined || handleOf(event.target) === undefined) {
      return;
    }
    // Also keeps the userscript dialog open: a cancelled Escape is no close request
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
      return;
    }
    const step = KEY_STEPS.get(event.key);
    if (step !== undefined) {
      event.preventDefault();
      if (moveHeld(step(heldIndex(state), state.order.length))) {
        place();
      }
    }
  }

  /** Shifts the dragged row with the pointer and the rows between to open its gap. */
  function shift(current: Drag, offset: number): void {
    const to = heldIndex(state);
    current.rows.forEach((row, index) => {
      let by = 0;
      if (index === current.from) {
        by = offset;
      } else if (index > current.from && index <= to) {
        by = -current.step;
      } else if (index < current.from && index >= to) {
        by = current.step;
      }
      row.style.transform = by === 0 ? "" : `translateY(${String(by)}px)`;
    });
  }

  function endDrag(): void {
    if (drag === undefined) {
      return;
    }
    for (const type of DRAG_EVENTS) {
      drag.handle.removeEventListener(type, onDragEvent);
    }
    doc.defaultView?.removeEventListener("pagehide", onDragEvent);
    if (drag.handle.hasPointerCapture(drag.pointer)) {
      drag.handle.releasePointerCapture(drag.pointer);
    }
    for (const row of drag.rows) {
      row.style.removeProperty("transform");
    }
    list.removeAttribute(DRAGGING_ATTRIBUTE);
    drag = undefined;
  }

  function onPointerdown(event: PointerEvent): void {
    swallowClick = false;
    const found = handleOf(event.target);
    if (
      found === undefined || !event.isPrimary || event.button !== 0 || state.mode === "held"
      || drag !== undefined
    ) {
      return;
    }
    // Read every box before anything is written
    const elements = state.order.flatMap((id) => rows.get(id)?.element ?? []);
    const boxes = elements.map((row) => row.getBoundingClientRect());
    const from = state.order.indexOf(found.id);
    const box = boxes[from];
    const near = boxes[from + 1] ?? boxes[from - 1];
    drag = {
      handle: found.handle,
      pointer: event.pointerId,
      id: found.id,
      startY: event.clientY,
      rows: elements,
      middles: boxes.map((each) => each.top + each.height / 2),
      from,
      step: box === undefined || near === undefined ? 0 : Math.abs(near.top - box.top),
      moving: false,
    };
    found.handle.setPointerCapture(event.pointerId);
    for (const type of DRAG_EVENTS) {
      found.handle.addEventListener(type, onDragEvent);
    }
    doc.defaultView?.addEventListener("pagehide", onDragEvent);
  }

  function onPointermove(current: Drag, offset: number): void {
    let moving = current;
    if (!current.moving) {
      if (Math.abs(offset) < DRAG_THRESHOLD) {
        return;
      }
      moving = { ...current, moving: true };
      drag = moving;
      list.setAttribute(DRAGGING_ATTRIBUTE, "");
      pick(current.id);
    }
    const middle = (moving.middles[moving.from] ?? 0) + offset;
    moveHeld(dropIndex(moving.middles, moving.from, middle));
    shift(moving, offset);
  }

  /** The drag's own events: a move, the release that drops, or a cancel or `pagehide`. */
  function onDragEvent(event: Event): void {
    const current = drag;
    if (current === undefined) {
      return;
    }
    if (event instanceof PointerEvent && event.type === "pointermove") {
      onPointermove(current, event.clientY - current.startY);
      return;
    }
    endDrag();
    if (!current.moving) {
      return;
    }
    if (event.type === "pointerup") {
      swallowClick = true;
      drop();
    } else {
      cancel();
    }
  }

  place();

  return {
    section,
    sync(order) {
      state = reorder(state, { type: "load", order });
      place();
    },
    handle(event) {
      if (event instanceof PointerEvent && event.type === "pointerdown") {
        onPointerdown(event);
      } else if (event instanceof KeyboardEvent && event.type === "keydown") {
        onKeydown(event);
      } else if (event.type === "click") {
        onClick(event.target);
      }
    },
    stop() {
      endDrag();
      state = reorder(state, { type: "cancel" });
      place();
    },
  };
}
