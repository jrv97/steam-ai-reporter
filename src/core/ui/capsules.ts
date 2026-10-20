import { HOST_APPID } from "../scan/marks";
import type { CapsuleHost, CapsuleRenderer, ScanBatch } from "../scan/renderer";
import type { AppId, Detector, Verdict } from "../types";
import { compactSize } from "./badge";
import type { BadgeSlot, HostRenderer } from "./host";

/** Set on a capsule image box that computes to `position: static`; CSS makes it relative. */
const ANCHOR_MARK = "data-sar-anchor";
/** Positions that already contain an absolutely placed badge. */
const POSITIONED: ReadonlySet<string> = new Set(["relative", "absolute", "fixed", "sticky"]);

export interface CapsuleUiOptions {
  readonly document: Document;
  readonly detector: Detector;
  /** Drawn in order for every host: state marks, badges. */
  readonly renderers: readonly HostRenderer[];
  /** Whether the game is on the allow-list now. */
  readonly isAllowed: (id: AppId) => boolean;
  /** Schedules a read-then-write pass; `requestAnimationFrame` by default. */
  readonly frame?: (callback: () => void) => void;
}

/** The scanner's renderer, plus a way to draw known hosts again after a change. */
export interface CapsuleUi extends CapsuleRenderer {
  /** Draws every known host again, or only those of `ids`, as after an allow-list change. */
  refresh(ids?: ReadonlySet<AppId>): void;
}

interface HostRecord {
  host: CapsuleHost;
  verdict: Verdict | undefined;
}

/** One host's draw, decided in the read phase. */
interface Draw {
  readonly record: HostRecord;
  readonly verdict: Verdict;
  readonly allowed: boolean;
  readonly slot: BadgeSlot | undefined;
  readonly markAnchor: boolean;
}

/**
 * The adapter between the scanner and the renderers. Found hosts are detected in one call per
 * scan batch (the detector batches and caches); changed hosts are drawn again from their known
 * verdict. Drawing reads every image box first and writes after, in one frame per pass. Records
 * live in a `WeakMap` keyed by host, and a refresh walks the marked hosts in the page, so no host
 * outlives its element.
 */
export function createCapsuleUi(options: CapsuleUiOptions): CapsuleUi {
  const { document: doc, detector, renderers, isAllowed } = options;
  const frame = options.frame ?? ((callback: () => void) => {
    const view = doc.defaultView;
    if (view === null) {
      callback();
    } else {
      view.requestAnimationFrame(callback);
    }
  });
  const records = new WeakMap<Element, HostRecord>();
  let queued = new Set<HostRecord>();

  function slotOf(host: CapsuleHost): { slot: BadgeSlot | undefined; markAnchor: boolean; } {
    const { placement, anchor } = host;
    if (placement.badge === "full") {
      const position = placement.slot === "first-child" ? "afterbegin" : "afterend";
      return { slot: { kind: "full", anchor, position }, markAnchor: false };
    }
    const box = anchor.getBoundingClientRect();
    const size = compactSize(box.width, box.height);
    if (size === undefined) {
      return { slot: undefined, markAnchor: false };
    }
    const position = doc.defaultView?.getComputedStyle(anchor).position ?? "";
    const markAnchor = !anchor.hasAttribute(ANCHOR_MARK) && !POSITIONED.has(position);
    return { slot: { kind: "compact", anchor, position: "beforeend", size }, markAnchor };
  }

  function drawQueued(): void {
    const batch = queued;
    queued = new Set();
    const draws: Draw[] = [];
    // Read phase: image boxes and computed positions, only for hosts that will show a badge.
    for (const record of batch) {
      const { host, verdict } = record;
      if (verdict === undefined || !host.element.isConnected) {
        continue;
      }
      const allowed = isAllowed(host.appId);
      const shows = verdict.state === "disclosed" && !allowed;
      const { slot, markAnchor } = shows ? slotOf(host) : { slot: undefined, markAnchor: false };
      draws.push({ record, verdict, allowed, slot, markAnchor });
    }
    // Write phase.
    for (const { record, verdict, allowed, slot, markAnchor } of draws) {
      if (markAnchor && slot !== undefined) {
        slot.anchor.setAttribute(ANCHOR_MARK, "");
      }
      const view = {
        host: record.host.element,
        verdict,
        allowed,
        slot,
        hideable: record.host.placement.hideable,
      };
      for (const renderer of renderers) {
        renderer.render(view);
      }
    }
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
      record.verdict = verdicts.get(record.host.appId);
      queue(record);
    }
  }

  return {
    render(batch: ScanBatch) {
      for (const host of batch.changed) {
        const record = records.get(host.element);
        if (record !== undefined) {
          record.host = host;
          if (record.verdict !== undefined) {
            queue(record);
          }
        }
      }
      const found: HostRecord[] = [];
      for (const host of batch.found) {
        const record: HostRecord = { host, verdict: undefined };
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
        if (record?.verdict !== undefined && (ids === undefined || ids.has(record.host.appId))) {
          queue(record);
        }
      }
    },
  };
}
