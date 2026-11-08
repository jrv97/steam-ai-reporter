import type { AiDisclosed, AiVerdict } from "../../src/core/kinds/ai";
import { eulaLink, type EulaUrl } from "../../src/core/kinds/eula";
import type { KindId } from "../../src/core/kinds/id";
import { perKind } from "../../src/core/kinds/registry";
import { type AnyDisclosed, type KindVerdicts, UNKNOWN_KINDS } from "../../src/core/kinds/verdicts";
import {
  type AppId,
  type DisclosedBase,
  NOT_DISCLOSED as TYPES_NOT_DISCLOSED,
  type NotDisclosedVerdict,
  type UnknownReason,
} from "../../src/core/types";
import { EARLY_ACCESS_RELEASED } from "./fixture-ids";

/** The link of a EULA entry, when the address is one the store hosts. */
function linked(address: string): { readonly url?: EulaUrl; } {
  const url = eulaLink(address);
  return url === undefined ? {} : { url };
}

/** The disclosed verdict shape of the kind `Id`. */
export type DisclosedFor<Id extends KindId> = Extract<AnyDisclosed, DisclosedBase<Id>>;

/** One disclosed verdict per kind, in the shape of that kind. */
type DisclosedByKind = { readonly [Id in KindId]: DisclosedFor<Id>; };

/** Each kind's disclosed verdict, with every field of its payload set. */
const DISCLOSED_DEFAULTS: DisclosedByKind = {
  ai: {
    state: "disclosed",
    kind: "ai",
    source: "api",
    notes: "Concept art was generated.\nNo AI text in the game.",
    language: "english",
    service: "Midjourney",
    name: "Fixture Game",
  },
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
      { name: "Game EULA", ...linked("https://store.steampowered.com/eula/1_eula_0") },
      { name: "Publisher terms" },
    ],
  },
  pvp: { state: "disclosed", kind: "pvp", source: "api", categoryIds: [49, 36] },
  iap: { state: "disclosed", kind: "iap", source: "api" },
  deck: { state: "disclosed", kind: "deck", source: "api", facet: "unsupported" },
  machine: { state: "disclosed", kind: "machine", source: "api", facet: "unsupported" },
  family: { state: "disclosed", kind: "family", source: "api", facet: "unsupported" },
  earlyaccess: {
    state: "disclosed",
    kind: "earlyaccess",
    source: "api",
    note: "We ship early to hear from players.\r\nExpect changes.",
    released: EARLY_ACCESS_RELEASED,
  },
};

/** The kind's disclosed verdict with every field set; `overrides` replace what a test needs. */
export function disclosed<Id extends KindId>(
  kind: Id,
  overrides: Partial<DisclosedFor<Id>> = {},
): DisclosedFor<Id> {
  return { ...DISCLOSED_DEFAULTS[kind], ...overrides };
}

/** The kind's disclosed verdict with no payload field but those in `fields`. */
export function bareDisclosed<Id extends KindId>(
  kind: Id,
  fields: Partial<DisclosedFor<Id>> = {},
): DisclosedBase<Id> & Partial<DisclosedFor<Id>> {
  return { state: "disclosed", kind, source: "api", ...fields };
}

/** The payload of the kind `Id`: its disclosed verdict without state, kind, source and mark. */
type PayloadFor<Id extends KindId> = Omit<DisclosedFor<Id>, keyof DisclosedBase | "fullGame">;

/** Each kind's disclosed verdict holding the given payload and no other field. */
const MINIMAL: {
  readonly [Id in KindId]: (payload: PayloadFor<Id>) => DisclosedFor<Id>;
} = {
  ai: (payload) => ({ state: "disclosed", kind: "ai", source: "api", ...payload }),
  kernel: (payload) => ({ state: "disclosed", kind: "kernel", source: "api", ...payload }),
  anticheat: (payload) => ({ state: "disclosed", kind: "anticheat", source: "api", ...payload }),
  drm: (payload) => ({ state: "disclosed", kind: "drm", source: "api", ...payload }),
  account: (payload) => ({ state: "disclosed", kind: "account", source: "api", ...payload }),
  eula: (payload) => ({ state: "disclosed", kind: "eula", source: "api", ...payload }),
  pvp: (payload) => ({ state: "disclosed", kind: "pvp", source: "api", ...payload }),
  iap: (payload) => ({ state: "disclosed", kind: "iap", source: "api", ...payload }),
  deck: (payload) => ({ state: "disclosed", kind: "deck", source: "api", ...payload }),
  machine: (payload) => ({ state: "disclosed", kind: "machine", source: "api", ...payload }),
  family: (payload) => ({ state: "disclosed", kind: "family", source: "api", ...payload }),
  earlyaccess: (payload) => ({
    state: "disclosed",
    kind: "earlyaccess",
    source: "api",
    ...payload,
  }),
};

/** The kind's disclosed verdict with its required payload and only the optional fields given. */
export function minimalDisclosed<Id extends KindId>(
  kind: Id,
  payload: PayloadFor<Id>,
): DisclosedFor<Id> {
  return MINIMAL[kind](payload);
}

/** A disclosed AI verdict with the optional fields filled in; override what a test cares about. */
export function disclosedVerdict(overrides: Partial<AiDisclosed> = {}): AiDisclosed {
  return disclosed("ai", overrides);
}

export const NOT_DISCLOSED: NotDisclosedVerdict = TYPES_NOT_DISCLOSED.api;

/** An app's verdicts: the given ones, and unknown `missing` for every other kind. */
export function verdictsWith(given: Partial<KindVerdicts> = {}): KindVerdicts {
  return { ...UNKNOWN_KINDS.missing, ...given };
}

/** An app's verdicts where the AI kind has this verdict and no other kind has an answer. */
export function aiVerdicts(ai: AiVerdict): KindVerdicts {
  return verdictsWith({ ai });
}

/** Each kind's disclosed verdict, with every field of its payload set. */
export const FULL_DISCLOSED: DisclosedByKind = DISCLOSED_DEFAULTS;

/** Every kind in the same state, so a test sees the TTL or the storage of that state alone. */
export function uniformVerdicts(
  state: "disclosed" | "not-disclosed" | UnknownReason,
): KindVerdicts {
  if (state === "disclosed") {
    return FULL_DISCLOSED;
  }
  return state === "not-disclosed" ? perKind(() => NOT_DISCLOSED) : UNKNOWN_KINDS[state];
}

/** The kinds in `kinds` disclosed with a full payload, every other kind not disclosed. */
export function disclosedKinds(kinds: readonly KindId[]): KindVerdicts {
  const pick = <T>(id: KindId, verdict: T) => kinds.includes(id) ? verdict : NOT_DISCLOSED;
  return {
    ai: pick("ai", FULL_DISCLOSED.ai),
    kernel: pick("kernel", FULL_DISCLOSED.kernel),
    anticheat: pick("anticheat", FULL_DISCLOSED.anticheat),
    drm: pick("drm", FULL_DISCLOSED.drm),
    account: pick("account", FULL_DISCLOSED.account),
    eula: pick("eula", FULL_DISCLOSED.eula),
    pvp: pick("pvp", FULL_DISCLOSED.pvp),
    iap: pick("iap", FULL_DISCLOSED.iap),
    deck: pick("deck", FULL_DISCLOSED.deck),
    machine: pick("machine", FULL_DISCLOSED.machine),
    family: pick("family", FULL_DISCLOSED.family),
    earlyaccess: pick("earlyaccess", FULL_DISCLOSED.earlyaccess),
  };
}

/** `verdicts` as those of a demo of `game` (GetItems `type` 1 with `parent_appid`). */
export function demoOf(game: AppId, verdicts: KindVerdicts = disclosedKinds([])): KindVerdicts {
  return { ...verdicts, parent: game, demo: true };
}

/** `verdicts` as those of a DLC of `game`: a parent and no demo mark. */
export function dlcOf(game: AppId, verdicts: KindVerdicts = disclosedKinds([])): KindVerdicts {
  return { ...verdicts, parent: game };
}

/** A full game's disclosure as its demo shows it: the same fields, marked as the game's. */
export function lent<Disclosed extends AnyDisclosed>(verdict: Disclosed): Disclosed {
  return { ...verdict, fullGame: true };
}
