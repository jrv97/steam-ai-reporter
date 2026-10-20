import { describe, expect, it } from "vitest";
import { disclosedVerdict, NOT_DISCLOSED } from "../../../tests/helpers/verdicts";
import { UNKNOWN, type Verdict } from "../types";
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
  const cases: readonly (readonly [string, Verdict, number])[] = [
    ["disclosed", disclosedVerdict(), DISCLOSED_TTL_MS],
    ["not disclosed", NOT_DISCLOSED, NOT_DISCLOSED_TTL_MS],
    ["unknown gated", UNKNOWN.gated, UNKNOWN_TTL_MS],
    ["unknown missing", UNKNOWN.missing, UNKNOWN_TTL_MS],
    ["unknown error", UNKNOWN.error, TRANSIENT_TTL_MS],
    ["unknown rate-limited", UNKNOWN["rate-limited"], TRANSIENT_TTL_MS],
  ];

  it.each(cases)("%s: fresh until exactly its TTL", (_name, verdict, ttl) => {
    expect(isFresh(verdict, T, T)).toBe(true);
    expect(isFresh(verdict, T, T + ttl - 1)).toBe(true);
    expect(isFresh(verdict, T, T + ttl)).toBe(false);
    expect(isFresh(verdict, T, T + ttl + 1)).toBe(false);
  });

  it("treats a fetch time in the future as stale", () => {
    expect(isFresh(NOT_DISCLOSED, T + 1, T)).toBe(false);
  });
});
