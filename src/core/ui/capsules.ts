import type { KindId } from "../kinds/id";
import { KINDS, perKind } from "../kinds/registry";
import type { KindVerdicts, Relations } from "../kinds/verdicts";
import type { Detector } from "../ports";
import { HOST_APPID } from "../scan/marks";
import type { RowPlacement } from "../scan/placements";
import type { CapsuleHost, CapsuleRenderer, ScanBatch } from "../scan/renderer";
import type { AppId } from "../types";
import { compactSize } from "./badge";
import type { BadgeSlot, HostRenderer } from "./host";

/** Where a full badge goes for each row slot, relative to its anchor. */
const ROW_POSITION = {
  after: "afterend",
  end: "beforeend",
} as const satisfies Record<RowPlacement["slot"], InsertPosition>;
/** Set on a capsule image box that computes to `position: static`; CSS makes it relative. */
const ANCHOR_MARK = "data-sar-anchor";
/** Positions that already contain an absolutely placed badge. */
const POSITIONED: ReadonlySet<string> = new Set(["relative", "absolute", "fixed", "sticky"]);

/** Watches elements until they get a size; `ResizeObserver` fits it as is. */
export interface SizeWatch {
  observe(element: Element): void;
  unobserve(element: Element): void;
  /** Stops watching every element. */
  disconnect(): void;
}

/** Makes a size watch that reports elements whose box became non-empty. */
export type SizeWatchFactory = (onSized: (elements: readonly Element[]) => void) => SizeWatch;

/** One `ResizeObserver` for the page; a no-op where the document has no window. */
function resizeWatch(doc: Document): SizeWatchFactory {
  return (onSized) => {
    const view = doc.defaultView;
    if (view === null) {
      return { observe: () => undefined, unobserve: () => undefined, disconnect: () => undefined };
    }
    return new view.ResizeObserver((entries) => {
      onSized(
        entries.filter((entry) => entry.contentRect.width > 0 && entry.contentRect.height > 0)
          .map((entry) => entry.target),
      );
    });
  };
}

export interface CapsuleUiOptions {
  readonly document: Document;
  readonly detector: Detector;
  /** Drawn in order for every host: state marks, badges. */
  readonly renderers: readonly HostRenderer[];
  /** Whether the game is ignored for the kind now, given what Valve's data relates it to. */
  readonly isAllowed: (id: AppId, kind: KindId, related: Relations) => boolean;
  /** Whether the kind's badges show now, by its settings. */
  readonly isBadged: (kind: KindId) => boolean;
  /** Schedules a read-then-write pass; `requestAnimationFrame` by default. */
  readonly frame?: (callback: () => void) => void;
  /** Watches image boxes that had no size when drawn; one `ResizeObserver` by default. */
  readonly watchSize?: SizeWatchFactory;
}

/** The scanner's renderer, plus a way to draw known hosts again after a change. */
export interface CapsuleUi extends CapsuleRenderer {
  /**
   * Draws every known host again, or only those of `ids` and the DLC whose base game is in `ids`,
   * as after an allow-list change.
   */
  refresh(ids?: ReadonlySet<AppId>): void;
  /** Stops watching image boxes and listening for `pagehide`. */
  stop(): void;
}

interface HostRecord {
  host: CapsuleHost;
  verdicts: KindVerdicts | undefined;
  /** Per kind: the game is ignored. Each draw refreshes it, so drawing allocates nothing. */
  readonly allowed: Record<KindId, boolean>;
  /** Per kind: the badge shows. Refreshed by each draw like `allowed`. */
  readonly badged: Record<KindId, boolean>;
}

const NOT_ALLOWED: Readonly<Record<KindId, boolean>> = perKind(() => false);
const ALL_BADGED: Readonly<Record<KindId, boolean>> = perKind(() => true);

/** One host's draw, decided in the read phase. */
interface Draw {
  readonly record: HostRecord;
  readonly verdicts: KindVerdicts;
  readonly allowed: Readonly<Record<KindId, boolean>>;
  readonly badged: Readonly<Record<KindId, boolean>>;
  readonly slot: BadgeSlot | undefined;
  readonly markAnchor: boolean;
}

/** Where a host's badge goes; `unsized` when its image box had no size to measure. */
interface SlotRead {
  readonly slot: BadgeSlot | undefined;
  readonly markAnchor: boolean;
  readonly unsized: boolean;
}

const NO_SLOT: SlotRead = { slot: undefined, markAnchor: false, unsized: false };

/**
 * The adapter between the scanner and the renderers. Found hosts are detected in one call per
 * scan batch (the detector batches and caches); changed hosts are drawn again from their known
 * verdicts. Drawing reads every image box first and writes after, in one frame per pass. Records
 * live in a `WeakMap` keyed by host, and a refresh walks the marked hosts in the page, so no host
 * outlives its element. An image box with no size waits in one shared size watch until a compact
 * badge fits. Showing a hidden tab changes no node the scanner sees, and tabs fade in.
 */
export function createCapsuleUi(options: CapsuleUiOptions): CapsuleUi {
  const { document: doc, detector, renderers, isAllowed, isBadged } = options;
  const frame = options.frame ?? ((callback: () => void) => {
    const view = doc.defaultView;
    if (view === null) {
      callback();
    } else {
      view.requestAnimationFrame(callback);
    }
  });
  const records = new WeakMap<Element, HostRecord>();
  /** Image boxes waiting for a size that fits a compact badge, with the host to draw again. */
  let unsized = new WeakMap<Element, HostRecord>();
  const watchSize = options.watchSize ?? resizeWatch(doc);
  let sizeWatch: SizeWatch | undefined;
  let queued = new Set<HostRecord>();

  function slotOf(host: CapsuleHost): SlotRead {
    const { placement, anchor } = host;
    if (placement.badge === "full") {
      return {
        slot: { kind: "full", anchor, position: ROW_POSITION[placement.slot] },
        markAnchor: false,
        unsized: false,
      };
    }
    const box = anchor.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) {
      return { ...NO_SLOT, unsized: true };
    }
    const size = compactSize(box.width, box.height);
    if (size === undefined) {
      return NO_SLOT;
    }
    const position = doc.defaultView?.getComputedStyle(anchor).position ?? "";
    const markAnchor = !anchor.hasAttribute(ANCHOR_MARK) && !POSITIONED.has(position);
    return {
      slot: { kind: "compact", anchor, position: "beforeend", size },
      markAnchor,
      unsized: false,
    };
  }

  /** Draws a watched host again when its image box resizes, while that box is still its anchor. */
  function onSized(elements: readonly Element[]): void {
    for (const element of elements) {
      const record = unsized.get(element);
      if (record?.host.anchor === element) {
        queue(record);
      } else {
        unwatch(element);
      }
    }
  }

  function watch(record: HostRecord): void {
    const { anchor } = record.host;
    if (!unsized.has(anchor)) {
      sizeWatch ??= watchSize(onSized);
      unsized.set(anchor, record);
      sizeWatch.observe(anchor);
    }
  }

  function unwatch(anchor: Element): void {
    if (unsized.delete(anchor)) {
      sizeWatch?.unobserve(anchor);
    }
  }

  /** Lets go of the size watch, as on `pagehide`; a later draw starts a new one if it needs it. */
  function disconnect(): void {
    sizeWatch?.disconnect();
    sizeWatch = undefined;
    unsized = new WeakMap();
  }

  function drawQueued(): void {
    const batch = queued;
    queued = new Set();
    const draws: Draw[] = [];
    // Read phase: image boxes and computed positions, only for hosts that will show a badge.
    for (const record of batch) {
      const { host, verdicts, allowed, badged } = record;
      if (verdicts === undefined || !host.element.isConnected) {
        continue;
      }
      let shows = false;
      for (const kind of KINDS) {
        allowed[kind.id] = isAllowed(host.appId, kind.id, verdicts);
        badged[kind.id] = isBadged(kind.id);
        shows ||= verdicts[kind.id].state === "disclosed" && !allowed[kind.id]
          && badged[kind.id];
      }
      const { slot, markAnchor, unsized: waits } = shows ? slotOf(host) : NO_SLOT;
      if (waits) {
        watch(record);
      } else if (slot !== undefined) {
        unwatch(slot.anchor);
      }
      draws.push({ record, verdicts, allowed, badged, slot, markAnchor });
    }
    // Write phase.
    for (const { record, verdicts, allowed, badged, slot, markAnchor } of draws) {
      if (markAnchor && slot !== undefined) {
        slot.anchor.setAttribute(ANCHOR_MARK, "");
      }
      const view = {
        host: record.host.element,
        verdicts,
        allowed,
        badged,
        maxChips: record.host.placement.maxChips,
        slot,
        hideable: record.host.placement.hideable,
      };
      for (const renderer of renderers) {
        renderer.render(view);
      }
    }
  }

  /** Whether the host shows one of `ids` or a DLC of one of them. */
  function concerns(ids: ReadonlySet<AppId>, record: HostRecord): boolean {
    const parent = record.verdicts?.parent;
    return ids.has(record.host.appId) || (parent !== undefined && ids.has(parent));
  }

  function queue(record: HostRecord): void {
    if (queued.size === 0) {
      frame(drawQueued);
    }
    queued.add(record);
  }

  async function detect(found: readonly HostRecord[]): Promise<void> {
    const verdicts = await detector.detect(found.map((record) => record.host.appId));
    for (const record of found) {
      record.verdicts = verdicts.get(record.host.appId);
      queue(record);
    }
  }

  doc.defaultView?.addEventListener("pagehide", disconnect);

  return {
    render(batch: ScanBatch) {
      for (const host of batch.changed) {
        const record = records.get(host.element);
        if (record !== undefined) {
          record.host = host;
          if (record.verdicts !== undefined) {
            queue(record);
          }
        }
      }
      const found: HostRecord[] = [];
      for (const host of batch.found) {
        const record: HostRecord = {
          host,
          verdicts: undefined,
          allowed: { ...NOT_ALLOWED },
          badged: { ...ALL_BADGED },
        };
        records.set(host.element, record);
        found.push(record);
      }
      if (found.length > 0) {
        void detect(found);
      }
    },

    refresh(ids) {
      for (const element of doc.querySelectorAll(`[${HOST_APPID}]`)) {
        const record = records.get(element);
        if (record?.verdicts !== undefined && (ids === undefined || concerns(ids, record))) {
          queue(record);
        }
      }
    },

    stop() {
      disconnect();
      doc.defaultView?.removeEventListener("pagehide", disconnect);
    },
  };
}
