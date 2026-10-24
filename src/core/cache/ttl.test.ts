import { describe, expect, it } from "vitest";
import {
  ALL_DISCLOSED,
  disclosedVerdict,
  NOT_DISCLOSED,
  uniformVerdicts,
} from "../../../tests/helpers/verdicts";
import { KINDS } from "../kinds/registry";
import type { KindVerdicts } from "../kinds/verdicts";
import { UNKNOWN } from "../types";
import {
  DAY_MS,
  DISCLOSED_TTL_MS,
  isFresh,
  isStoredReason,
  NOT_DISCLOSED_TTL_MS,
  TRANSIENT_TTL_MS,
  ttlMs,
  UNKNOWN_TTL_MS,
} from "./ttl";

const HOUR_MS = DAY_MS / 24;
const T = 1_000_000_000_000;

describe("ttlMs", () => {
  it("is 7 days for disclosed, 12 hours for not disclosed, 6 hours for gated and missing", () => {
    expect(ttlMs(disclosedVerdict())).toBe(7 * DAY_MS);
    expect(ttlMs(NOT_DISCLOSED)).toBe(12 * HOUR_MS);
    expect(ttlMs(UNKNOWN.gated)).toBe(6 * HOUR_MS);
    expect(ttlMs(UNKNOWN.missing)).toBe(6 * HOUR_MS);
  });

  it("is short for the verdicts that are not stored", () => {
    expect(ttlMs(UNKNOWN.error)).toBe(TRANSIENT_TTL_MS);
    expect(ttlMs(UNKNOWN["rate-limited"])).toBe(TRANSIENT_TTL_MS);
    expect(TRANSIENT_TTL_MS).toBeLessThan(UNKNOWN_TTL_MS);
  });
});

describe("isStoredReason", () => {
  it("stores gated and missing only", () => {
    expect(isStoredReason("gated")).toBe(true);
    expect(isStoredReason("missing")).toBe(true);
    expect(isStoredReason("error")).toBe(false);
    expect(isStoredReason("rate-limited")).toBe(false);
  });
});

describe("isFresh", () => {
  const cases: readonly (readonly [string, KindVerdicts, number])[] = [
    ["disclosed", uniformVerdicts("disclosed"), DISCLOSED_TTL_MS],
    ["not disclosed", uniformVerdicts("not-disclosed"), NOT_DISCLOSED_TTL_MS],
    ["unknown gated", uniformVerdicts("gated"), UNKNOWN_TTL_MS],
    ["unknown missing", uniformVerdicts("missing"), UNKNOWN_TTL_MS],
    ["unknown error", uniformVerdicts("error"), TRANSIENT_TTL_MS],
    ["unknown rate-limited", uniformVerdicts("rate-limited"), TRANSIENT_TTL_MS],
  ];

  it.each(cases)("%s: fresh until exactly its TTL", (_name, verdicts, ttl) => {
    expect(isFresh(verdicts, T, T)).toBe(true);
    expect(isFresh(verdicts, T, T + ttl - 1)).toBe(true);
    expect(isFresh(verdicts, T, T + ttl)).toBe(false);
    expect(isFresh(verdicts, T, T + ttl + 1)).toBe(false);
  });

  it("treats a fetch time in the future as stale", () => {
    expect(isFresh(uniformVerdicts("not-disclosed"), T + 1, T)).toBe(false);
  });
});

describe("isFresh across kinds", () => {
  /** Every kind disclosed except `id`, which holds `verdict`. */
  function oneKindIs(id: (typeof KINDS)[number]["id"], verdict: KindVerdicts[typeof id]) {
    return { ...ALL_DISCLOSED, [id]: verdict };
  }

  it("expires with the kind that lives shortest, whichever kind it is", () => {
    for (const kind of KINDS) {
      const notDisclosed = oneKindIs(kind.id, NOT_DISCLOSED);
      expect(isFresh(notDisclosed, T, T + NOT_DISCLOSED_TTL_MS - 1)).toBe(true);
      expect(isFresh(notDisclosed, T, T + NOT_DISCLOSED_TTL_MS)).toBe(false);
      const missing = oneKindIs(kind.id, UNKNOWN.missing);
      expect(isFresh(missing, T, T + UNKNOWN_TTL_MS - 1)).toBe(true);
      expect(isFresh(missing, T, T + UNKNOWN_TTL_MS)).toBe(false);
      const failed = oneKindIs(kind.id, UNKNOWN.error);
      expect(isFresh(failed, T, T + TRANSIENT_TTL_MS)).toBe(false);
    }
  });

  it("keeps disclosed kinds for their own TTL when no kind is shorter", () => {
    expect(isFresh(ALL_DISCLOSED, T, T + DISCLOSED_TTL_MS - 1)).toBe(true);
    expect(isFresh(ALL_DISCLOSED, T, T + DISCLOSED_TTL_MS)).toBe(false);
  });
});
