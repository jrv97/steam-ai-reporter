import type { HostState } from "../scan/marks";
import type { Verdict } from "../types";

/** The tier of a compact badge, from the measured image box (see `compactSize`). */
export type CompactSize = "text" | "large";

/**
 * Where a host's badge goes. The placement picks the anchor and the position; for a compact badge
 * the scanner measures the image box in its batched read and passes the tier.
 */
export type BadgeSlot =
  | { readonly kind: "full"; readonly anchor: Element; readonly position: InsertPosition; }
  | {
    readonly kind: "compact";
    readonly anchor: Element;
    readonly position: InsertPosition;
    readonly size: CompactSize;
  };

/** What the renderers need to know about one capsule host. */
export interface HostView {
  readonly host: Element;
  readonly verdict: Verdict;
  /** The game is on the allow-list: nothing marks it, in lists or on badges. */
  readonly allowed: boolean;
  /** Where the badge goes; undefined when the placement shows none (a thumbnail too small). */
  readonly slot: BadgeSlot | undefined;
  /** False where hiding would break the list (virtualized, carousel); hide then dims. */
  readonly hideable: boolean;
}

/**
 * Draws one host. Idempotent: rendering the same view again keeps what is there, a new view
 * replaces it, and a badge a store re-render dropped is put back.
 */
export interface HostRenderer {
  render(view: HostView): void;
}

/** A host's `data-sar-state` once its verdict is known; `allowed` wins over the verdict. */
export function hostState(verdict: Verdict, allowed: boolean): Exclude<HostState, "pending"> {
  return allowed ? "allowed" : verdict.state;
}
