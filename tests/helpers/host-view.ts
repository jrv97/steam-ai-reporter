import type { AiVerdict } from "../../src/core/kinds/ai";
import type { KindId } from "../../src/core/kinds/id";
import { perKind } from "../../src/core/kinds/registry";
import type { KindVerdicts } from "../../src/core/kinds/verdicts";
import type { BadgeSlot, HostView } from "../../src/core/ui/host";
import { aiVerdicts, disclosedVerdict } from "./verdicts";

export interface HostViewOptions {
  /** The AI kind's verdict; disclosed unless a test says otherwise. */
  readonly verdict?: AiVerdict;
  /** Every kind's verdict, instead of the AI verdict and nothing else known. */
  readonly verdicts?: KindVerdicts;
  /** Whether the game is on the allow-list, for every kind. */
  readonly allowed?: boolean;
  /** Kinds the game is ignored for, whatever `allowed` says. */
  readonly ignored?: readonly KindId[];
  readonly slot?: BadgeSlot | undefined;
  readonly hideable?: boolean;
}

/** What a renderer receives for one host, with the AI kind's verdict and nothing else known. */
export function hostView(host: Element, options: HostViewOptions = {}): HostView {
  const { verdict = disclosedVerdict(), allowed = false, ignored = [] } = options;
  const { slot, hideable = true, verdicts = aiVerdicts(verdict) } = options;
  return {
    host,
    verdicts,
    allowed: perKind((kind) => allowed || ignored.includes(kind.id)),
    slot,
    hideable,
  };
}
