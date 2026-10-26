import { KINDS } from "../kinds/registry";
import type { MessageCatalog } from "../ports";
import { HOST_HIDEABLE, HOST_KINDS } from "../scan/marks";
import { LIST_PLACEMENTS } from "../scan/placements";
import { announce, POLITE } from "./announce";
import { filterAttribute } from "./kind-attributes";

/**
 * On the root element while the person shows what the list filter hides, on this page only. The
 * hide rules skip it and the hosts dim instead. Nothing stores it.
 */
export const REVEAL_ATTRIBUTE = "data-sar-reveal";
/** Quiet time after the last change of the notice before the live region speaks. */
export const ANNOUNCE_DELAY_MS = 1000;

const NOTICE_CLASS = "sar-list-notice";
const TEXT_ID = "sar-list-notice-text";
const FILTERS = KINDS.map((kind) => filterAttribute(kind.id));
const MARKED = `[${HOST_KINDS}]`;

export interface HiddenNoticeOptions {
  readonly document: Document;
  readonly i18n: MessageCatalog;
  /** Schedules the read-then-write pass; `requestAnimationFrame` by default. */
  readonly frame?: (callback: () => void) => void;
  /** Runs a callback after a delay and returns its cancel; `setTimeout` by default. */
  readonly delay?: (callback: () => void, ms: number) => () => void;
}

export interface HiddenNotice {
  /** Draws the notice and follows the list, when the page holds a list surface. */
  start(): void;
  /** Disconnects, removes the notice and ends the reveal. */
  stop(): void;
}

/** The hosts the root's filters hide, as one selector list, or undefined when no kind hides. */
export function hiddenSelector(root: Element): string | undefined {
  const parts: string[] = [];
  for (const kind of KINDS) {
    if (root.getAttribute(filterAttribute(kind.id)) === "hide") {
      parts.push(`[${HOST_KINDS}~="${kind.id}"]:not([${HOST_HIDEABLE}="false"])`);
    }
  }
  return parts.length === 0 ? undefined : parts.join(", ");
}

/** A list surface in the page, and the store's own notice the bar follows when there is one. */
interface FoundList {
  readonly list: Element;
  readonly after: Element | null;
}

/** Whether a record can change the count: a mark or a filter, or a marked host leaving. */
function concernsCount(record: MutationRecord): boolean {
  if (record.type === "attributes") {
    return true;
  }
  for (const node of record.removedNodes) {
    if (node instanceof Element && (node.matches(MARKED) || node.querySelector(MARKED) !== null)) {
      return true;
    }
  }
  return false;
}

function setText(element: Element, text: string): void {
  if (element.textContent !== text) {
    element.textContent = text;
  }
}

/**
 * One bar above a list surface, right after the store's own notice bar when the page has one, that
 * counts the results the list filter hides there, with a link-styled button that shows them on
 * this page and hides them again. It counts the hosts the renderers marked, with one selector
 * query per change, and never scans. One observer follows the marks, the root's filters and hosts
 * leaving; it disconnects on `pagehide`. The live region speaks the line once it stays the same
 * for `ANNOUNCE_DELAY_MS`.
 */
export function createHiddenNotice(options: HiddenNoticeOptions): HiddenNotice {
  const { document: doc, i18n } = options;
  const view = doc.defaultView;
  const root = doc.documentElement;
  const frame = options.frame ?? ((callback: () => void) => {
    if (view === null) {
      callback();
    } else {
      view.requestAnimationFrame(callback);
    }
  });
  const delay = options.delay ?? ((callback: () => void, ms: number) => {
    const id = setTimeout(callback, ms);
    return () => {
      clearTimeout(id);
    };
  });
  const observer = new MutationObserver((records) => {
    if (records.some(concernsCount)) {
      schedule();
    }
  });

  const box = doc.createElement("div");
  box.className = NOTICE_CLASS;
  box.hidden = true;
  const text = doc.createElement("span");
  text.className = "sar-list-notice-text";
  text.id = TEXT_ID;
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "sar-list-notice-button";
  button.setAttribute("aria-describedby", TEXT_ID);
  const live = doc.createElement("span");
  live.className = "sar-vh";
  live.setAttribute("aria-live", POLITE);
  box.append(text, button, live);

  /** The list the count was last drawn for; another one ends the reveal. */
  let shownList: Element | undefined;
  let scheduled = false;
  let connected = false;
  let spoken: string | undefined;
  let cancelSpeech: (() => void) | undefined;

  function findList(): FoundList | undefined {
    for (const placement of LIST_PLACEMENTS) {
      const list = doc.querySelector(placement.list);
      if (list !== null) {
        const after = placement.after === undefined ? null : doc.querySelector(placement.after);
        return { list, after };
      }
    }
    return undefined;
  }

  function speak(line: string): void {
    cancelSpeech?.();
    cancelSpeech = undefined;
    if (line !== spoken) {
      cancelSpeech = delay(() => {
        cancelSpeech = undefined;
        spoken = line;
        announce(doc, live, line);
      }, ANNOUNCE_DELAY_MS);
    }
  }

  function hide(): void {
    root.removeAttribute(REVEAL_ATTRIBUTE);
    if (box.hidden !== true) {
      box.hidden = true;
    }
    cancelSpeech?.();
    cancelSpeech = undefined;
    spoken = undefined;
    setText(live, "");
  }

  function draw(): void {
    // Read phase: the list, the filters, the count and where the notice sits.
    const found = findList();
    const list = found?.list;
    const after = found?.after ?? null;
    const selector = hiddenSelector(root);
    const count = list === undefined || selector === undefined
      ? 0
      : list.querySelectorAll(selector).length;
    const placed = after === null
      ? list?.previousElementSibling === box
      : after.nextElementSibling === box;
    const moved = list !== shownList;
    const revealed = !moved && root.hasAttribute(REVEAL_ATTRIBUTE);
    shownList = list;
    // Write phase.
    if (moved) {
      root.removeAttribute(REVEAL_ATTRIBUTE);
    }
    if (list === undefined || count === 0) {
      hide();
      return;
    }
    const line = i18n.plural(revealed ? "notice_list_revealed" : "notice_list_hidden", count);
    setText(text, line);
    setText(button, i18n.plural(revealed ? "notice_list_hide" : "notice_list_show", count));
    if (box.hidden !== false) {
      box.hidden = false;
    }
    if (!placed) {
      if (after === null) {
        list.before(box);
      } else {
        after.after(box);
      }
    }
    speak(line);
  }

  function schedule(): void {
    if (!scheduled) {
      scheduled = true;
      frame(() => {
        scheduled = false;
        if (connected) {
          draw();
        }
      });
    }
  }

  function onClick(): void {
    if (root.hasAttribute(REVEAL_ATTRIBUTE)) {
      root.removeAttribute(REVEAL_ATTRIBUTE);
    } else {
      root.setAttribute(REVEAL_ATTRIBUTE, String(true));
    }
    draw();
  }

  function connect(): void {
    if (findList() === undefined) {
      return;
    }
    connected = true;
    observer.observe(root, { attributes: true, attributeFilter: FILTERS });
    observer.observe(doc.body, {
      attributes: true,
      attributeFilter: [HOST_KINDS],
      childList: true,
      subtree: true,
    });
    schedule();
  }

  function disconnect(): void {
    connected = false;
    observer.disconnect();
    hide();
  }

  function onPageShow(event: PageTransitionEvent): void {
    if (event.persisted) {
      connect();
    }
  }

  return {
    start() {
      disconnect();
      button.addEventListener("click", onClick);
      view?.addEventListener("pagehide", disconnect);
      view?.addEventListener("pageshow", onPageShow);
      connect();
    },
    stop() {
      disconnect();
      box.remove();
      button.removeEventListener("click", onClick);
      view?.removeEventListener("pagehide", disconnect);
      view?.removeEventListener("pageshow", onPageShow);
    },
  };
}
