import type { Delay } from "../detect/retry";
import type { MessageCatalog } from "../ports";
import type { LoadProgress, ProgressSource } from "../progress";
import { createElement } from "./element";

/** The strip's five states, as its `data-tks-load` attribute names them. */
type StripState = "loading" | "paused" | "done" | "empty" | "none";

/** What one draw shows. */
interface StripView {
  readonly state: StripState;
  readonly message: string;
  /** The countdown inside the message, drawn in bold; empty when there is none. */
  readonly seconds: string;
  readonly count: string;
  readonly answered: number;
  readonly total: number;
}

export interface LoadStripOptions {
  /** The ID prefix of the form, so the bar can name its line. */
  readonly idPrefix: string;
  /** Milliseconds since the Unix epoch; `Date.now` by default. */
  readonly now?: () => number;
  /** Waits before the next draw; `setTimeout` by default. */
  readonly delay?: Delay;
}

export interface LoadStrip {
  readonly element: HTMLElement;
  /** Stops listening and cancels the next draw. */
  stop(): void;
}

const STATE_ATTRIBUTE = "data-tks-load";
/** Fills the bar to its share, from 0 to 1. */
const SHARE_PROPERTY = "--tks-load-share";
const MS_PER_SECOND = 1000;

function timeout(callback: () => void, ms: number): () => void {
  const id = setTimeout(callback, ms);
  return () => {
    clearTimeout(id);
  };
}

/** The view of a progress at `now`; undefined progress is a tab with no store page. */
function viewOf(
  i18n: MessageCatalog,
  numbers: Intl.NumberFormat,
  progress: LoadProgress | undefined,
  now: number,
): StripView {
  if (progress === undefined) {
    const message = i18n.t("options_progress_no_page");
    return { state: "none", message, seconds: "", count: "", answered: 0, total: 0 };
  }
  const { total, answered, unknown, pausedUntil } = progress;
  if (total === 0) {
    const message = i18n.t("options_progress_no_games");
    return { state: "empty", message, seconds: "", count: "", answered: 0, total: 0 };
  }
  const counts = { answered: numbers.format(answered), total: numbers.format(total) };
  const base = { seconds: "", answered, total };
  if (answered < total && pausedUntil !== undefined && pausedUntil > now) {
    const left = numbers.format(Math.ceil((pausedUntil - now) / MS_PER_SECOND));
    const seconds = i18n.t("options_progress_seconds", { seconds: left });
    const message = i18n.t("options_progress_paused", { time: seconds });
    const count = i18n.t("options_progress_count", counts);
    return { ...base, state: "paused", message, seconds, count };
  }
  if (answered < total) {
    const message = i18n.t("options_progress_loading");
    const count = i18n.plural("options_progress_loading_count", total, counts);
    return { ...base, state: "loading", message, count };
  }
  const loaded = total - unknown;
  const message = unknown === 0
    ? i18n.plural("options_progress_done", loaded)
    : i18n.plural("options_progress_done_unknown", loaded, { unknown: numbers.format(unknown) });
  const count = i18n.t("options_progress_count", { ...counts, answered: counts.total });
  return { ...base, state: "done", message, count };
}

/**
 * The load strip of the toolbar popup and the userscript dialog: a status line over a bar. It
 * draws at most once a second, so its `role="status"` line speaks at most once a second, and
 * while Steam's pause runs it draws once a second to count down. It has no timer otherwise.
 */
export function createLoadStrip(
  doc: Document,
  i18n: MessageCatalog,
  source: ProgressSource,
  options: LoadStripOptions,
): LoadStrip {
  const now = options.now ?? (() => Date.now());
  const delay = options.delay ?? timeout;
  const numbers = new Intl.NumberFormat(i18n.locale.replaceAll("_", "-"));

  const element = createElement(doc, "div", "tks-load");
  const line = createElement(doc, "p", "tks-load-line");
  line.setAttribute("role", "status");
  const message = createElement(doc, "span", "tks-load-message");
  message.id = `${options.idPrefix}load-message`;
  const count = createElement(doc, "span", "tks-load-count");
  line.append(message, count);
  const bar = createElement(doc, "div", "tks-load-bar");
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-valuemin", String(0));
  bar.setAttribute("aria-labelledby", message.id);
  bar.append(createElement(doc, "div", "tks-load-fill"));
  element.append(line, bar);

  /** Nothing heard yet: the strip keeps its height and shows no state. */
  let latest: { readonly progress: LoadProgress | undefined; } | undefined;
  let drawnAt = Number.NEGATIVE_INFINITY;
  let cancelDraw: (() => void) | undefined;

  function draw(): void {
    cancelDraw = undefined;
    if (latest === undefined) {
      return;
    }
    drawnAt = now();
    const view = viewOf(i18n, numbers, latest.progress, drawnAt);
    element.setAttribute(STATE_ATTRIBUTE, view.state);
    // The countdown sits inside the message; bold it where the message holds it.
    const at = view.seconds === "" ? -1 : view.message.indexOf(view.seconds);
    if (at < 0) {
      message.replaceChildren(view.message);
    } else {
      message.replaceChildren(
        view.message.slice(0, at),
        createElement(doc, "strong", "", view.seconds),
        view.message.slice(at + view.seconds.length),
      );
    }
    count.textContent = view.count;
    const max = Math.max(view.total, 1);
    bar.setAttribute("aria-valuemax", String(max));
    bar.setAttribute("aria-valuenow", String(view.state === "done" ? max : view.answered));
    const share = view.state === "done" ? 1 : view.answered / max;
    element.style.setProperty(SHARE_PROPERTY, String(share));
    if (view.state === "paused") {
      cancelDraw = delay(draw, MS_PER_SECOND);
    }
  }

  function update(progress: LoadProgress | undefined): void {
    latest = { progress };
    if (cancelDraw === undefined) {
      const wait = drawnAt + MS_PER_SECOND - now();
      if (wait > 0) {
        cancelDraw = delay(draw, wait);
      } else {
        draw();
      }
    }
  }

  const unsubscribe = source.subscribe(update);
  return {
    element,
    stop() {
      unsubscribe();
      cancelDraw?.();
      cancelDraw = undefined;
    },
  };
}
