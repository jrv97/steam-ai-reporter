import type { AiVerdict } from "../../src/core/kinds/ai";
import type { KindId } from "../../src/core/kinds/id";
import { perKind } from "../../src/core/kinds/registry";
import type { KindVerdicts } from "../../src/core/kinds/verdicts";
import type { BadgeSlot, HostView } from "../../src/core/ui/host";
import { disclosed, verdictsWith } from "./verdicts";

export interface HostViewOptions {
  /** The AI kind's verdict; disclosed unless a test says otherwise. */
  readonly verdict?: AiVerdict;
  /** Every kind's verdict, instead of the AI verdict and nothing else known. */
  readonly verdicts?: KindVerdicts;
  /** Whether the game is on the allow-list, for every kind. */
  readonly allowed?: boolean;
  /** Kinds the game is ignored for, whatever `allowed` says. */
  readonly ignored?: readonly KindId[];
  /** Kinds whose badges are switched off in the settings. */
  readonly unbadged?: readonly KindId[];
  /** Chips the placement shows before the "+N" chip. */
  readonly maxChips?: number;
  readonly slot?: BadgeSlot | undefined;
  readonly hideable?: boolean;
}

/** Chips a view shows before the "+N" chip unless a test says otherwise. */
const MAX_CHIPS = 3;

/** What a renderer receives for one host, with the AI kind's verdict and nothing else known. */
export function hostView(host: Element, options: HostViewOptions = {}): HostView {
  const { verdict = disclosed("ai"), allowed = false, ignored = [] } = options;
  const { slot, hideable = true, verdicts = verdictsWith({ ai: verdict }) } = options;
  const { unbadged = [], maxChips = MAX_CHIPS } = options;
  return {
    host,
    verdicts,
    allowed: perKind((kind) => allowed || ignored.includes(kind.id)),
    badged: perKind((kind) => !unbadged.includes(kind.id)),
    maxChips,
    slot,
    hideable,
  };
}
