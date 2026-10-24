import type { AiDisclosed, AiVerdict } from "../../src/core/kinds/ai";
import { type KindVerdicts, UNKNOWN_KINDS } from "../../src/core/kinds/verdicts";
import type { NotDisclosedVerdict } from "../../src/core/types";

/** A disclosed verdict with the optional fields filled in; override what a test cares about. */
export function disclosedVerdict(overrides: Partial<AiDisclosed> = {}): AiDisclosed {
  return {
    state: "disclosed",
    kind: "ai",
    notes: "Concept art was generated.\nNo AI text in the game.",
    language: "english",
    service: "Midjourney",
    name: "Fixture Game",
    source: "api",
    ...overrides,
  };
}

export const NOT_DISCLOSED: NotDisclosedVerdict = { state: "not-disclosed", source: "api" };

/** An app's verdicts where the AI kind has this verdict and no other kind has an answer. */
export function aiVerdicts(ai: AiVerdict): KindVerdicts {
  return { ...UNKNOWN_KINDS.missing, ai };
}
