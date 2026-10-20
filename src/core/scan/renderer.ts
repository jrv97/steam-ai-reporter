import type { AppId } from "../types";
import type { Placement } from "./placements";

// The seam between the scanner and the UI. The scanner finds and marks hosts; whatever implements
// `CapsuleRenderer` (the app's verdict and badge code) decides what they show. Neither imports
// the other's internals.

/** A capsule host the scanner marked, with what its placement found during the read phase. */
export interface CapsuleHost {
  /** The host element; it carries `data-sar-appid` and `data-sar-state`. */
  readonly element: Element;
  readonly appId: AppId;
  readonly placement: Placement;
  /** The element the badge attaches to, as `placement.slot` says. */
  readonly anchor: Element;
}

/** What one scan found. Both lists may be empty; a scan with nothing to report is not sent. */
export interface ScanBatch {
  /** Hosts marked for the first time, with `data-sar-state="pending"`. */
  readonly found: readonly CapsuleHost[];
  /**
   * Known hosts that received new content: a re-render may have dropped their badge, or the
   * anchor may be a new element. `anchor` is read again for them.
   */
  readonly changed: readonly CapsuleHost[];
}

/**
 * Receives the scanner's batches. `render` runs in the scan's animation frame after the scanner's
 * own writes, so it must not read layout synchronously; it schedules its own read and write
 * phases. It must be idempotent per host: a host whose badge is in place stays unchanged, and any
 * badge it inserts sits inside the host and carries a `sar-` class.
 */
export interface CapsuleRenderer {
  render(batch: ScanBatch): void;
}
