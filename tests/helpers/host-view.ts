import { perKind } from "../../src/core/kinds/registry";
import type { Verdict } from "../../src/core/types";
import type { BadgeSlot, HostView } from "../../src/core/ui/host";
import { aiVerdicts, disclosedVerdict } from "./verdicts";

export interface HostViewOptions {
  /** The AI kind's verdict; disclosed unless a test says otherwise. */
  readonly verdict?: Verdict;
  /** Whether the game is on the allow-list, for every kind. */
  readonly allowed?: boolean;
  readonly slot?: BadgeSlot | undefined;
  readonly hideable?: boolean;
}

/** What a renderer receives for one host, with the AI kind's verdict and nothing else known. */
export function hostView(host: Element, options: HostViewOptions = {}): HostView {
  const { verdict = disclosedVerdict(), allowed = false, slot, hideable = true } = options;
  return { host, verdicts: aiVerdicts(verdict), allowed: perKind(() => allowed), slot, hideable };
}
