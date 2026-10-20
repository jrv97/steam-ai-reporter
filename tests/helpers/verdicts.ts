import type { DisclosedVerdict, NotDisclosedVerdict } from "../../src/core/types";

/** A disclosed verdict with the optional fields filled in; override what a test cares about. */
export function disclosedVerdict(overrides: Partial<DisclosedVerdict> = {}): DisclosedVerdict {
  return {
    state: "disclosed",
    notes: "Concept art was generated.\nNo AI text in the game.",
    language: "english",
    service: "Midjourney",
    name: "Fixture Game",
    source: "api",
    ...overrides,
  };
}

export const NOT_DISCLOSED: NotDisclosedVerdict = { state: "not-disclosed", source: "api" };
