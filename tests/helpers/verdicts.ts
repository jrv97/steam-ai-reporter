import type { AiDisclosed, AiVerdict } from "../../src/core/kinds/ai";
import { perKind } from "../../src/core/kinds/registry";
import { type KindVerdicts, UNKNOWN_KINDS } from "../../src/core/kinds/verdicts";
import type { NotDisclosedVerdict, UnknownReason } from "../../src/core/types";

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

/** Every kind disclosed, with every field of its payload set. */
export const ALL_DISCLOSED: KindVerdicts = {
  ai: disclosedVerdict(),
  kernel: {
    state: "disclosed",
    kind: "kernel",
    source: "api",
    name: "Easy Anti-Cheat",
    nameToken: "#Store_AntiCheat_Type_easyac",
    uninstallsCompletely: true,
    bootProtection: { token: "secureboot_tpm2" },
  },
  anticheat: {
    state: "disclosed",
    kind: "anticheat",
    source: "api",
    name: "VAC (Valve Anti-Cheat)",
    nameToken: "#Store_AntiCheat_Type_vac",
  },
  drm: {
    state: "disclosed",
    kind: "drm",
    source: "api",
    text: "Denuvo Anti-tamper",
    activationLimit: "5 a day",
  },
  account: {
    state: "disclosed",
    kind: "account",
    source: "api",
    text: "Ubisoft Account",
    linksToSteam: true,
  },
  eula: {
    state: "disclosed",
    kind: "eula",
    source: "api",
    items: [
      { name: "Game EULA", url: "https://store.steampowered.com/eula/1_eula_0" },
      { name: "Publisher terms" },
    ],
  },
  pvp: { state: "disclosed", kind: "pvp", source: "api", categoryIds: [49, 36] },
};

/** Every kind in the same state, so a test sees the TTL or the storage of that state alone. */
export function uniformVerdicts(
  state: "disclosed" | "not-disclosed" | UnknownReason,
): KindVerdicts {
  if (state === "disclosed") {
    return ALL_DISCLOSED;
  }
  return state === "not-disclosed" ? perKind(() => NOT_DISCLOSED) : UNKNOWN_KINDS[state];
}
