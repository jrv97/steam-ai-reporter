import { describe, expect, it } from "vitest";
import {
  disclosedVerdict,
  FULL_DISCLOSED,
  NOT_DISCLOSED,
  uniformVerdicts,
} from "../../../tests/helpers/verdicts";
import { AI_KIND } from "../kinds/ai";
import { DAY_MS, HOUR_MS, WEEK_TTL } from "../kinds/kind-ttl";
import { KINDS } from "../kinds/registry";
import type { KindVerdicts } from "../kinds/verdicts";
import { UNKNOWN } from "../types";
import { isFresh, isStoredReason, TRANSIENT_TTL_MS, ttlMs, UNKNOWN_TTL_MS } from "./ttl";

const T = 1_000_000_000_000;

describe("kind TTLs", () => {
  it("keep the AI notes for 7 days and a missing disclosure for 12 hours", () => {
    expect(AI_KIND.ttl).toStrictEqual({ disclosed: 7 * DAY_MS, notDisclosed: 12 * HOUR_MS });
  });

  it("keep every other kind for 7 days, disclosed or not", () => {
    for (const kind of KINDS) {
      if (kind.id !== "ai") {
        expect(kind.ttl).toBe(WEEK_TTL);
      }
    }
    expect(WEEK_TTL).toStrictEqual({ disclosed: 7 * DAY_MS, notDisclosed: 7 * DAY_MS });
  });
});

describe("ttlMs", () => {
  it("takes disclosed and not disclosed from the kind's TTLs", () => {
    expect(ttlMs(AI_KIND.ttl, disclosedVerdict())).toBe(7 * DAY_MS);
    expect(ttlMs(AI_KIND.ttl, NOT_DISCLOSED)).toBe(12 * HOUR_MS);
    expect(ttlMs(WEEK_TTL, NOT_DISCLOSED)).toBe(7 * DAY_MS);
  });

  it("is 6 hours for gated, missing and malformed, whatever the kind", () => {
    for (const reason of ["gated", "missing", "malformed"] as const) {
      expect(ttlMs(AI_KIND.ttl, UNKNOWN[reason])).toBe(6 * HOUR_MS);
      expect(ttlMs(WEEK_TTL, UNKNOWN[reason])).toBe(6 * HOUR_MS);
    }
  });

  it("is short for the verdicts that are not stored", () => {
    expect(ttlMs(AI_KIND.ttl, UNKNOWN.error)).toBe(TRANSIENT_TTL_MS);
    expect(ttlMs(AI_KIND.ttl, UNKNOWN["rate-limited"])).toBe(TRANSIENT_TTL_MS);
    expect(TRANSIENT_TTL_MS).toBeLessThan(UNKNOWN_TTL_MS);
  });
});

describe("isStoredReason", () => {
  it("stores gated, missing and malformed only", () => {
    expect(isStoredReason("gated")).toBe(true);
    expect(isStoredReason("missing")).toBe(true);
    expect(isStoredReason("malformed")).toBe(true);
    expect(isStoredReason("error")).toBe(false);
    expect(isStoredReason("rate-limited")).toBe(false);
  });
});

describe("isFresh", () => {
  const cases: readonly (readonly [string, KindVerdicts, number])[] = [
    ["disclosed", uniformVerdicts("disclosed"), 7 * DAY_MS],
    ["not disclosed", uniformVerdicts("not-disclosed"), 12 * HOUR_MS],
    ["unknown gated", uniformVerdicts("gated"), UNKNOWN_TTL_MS],
    ["unknown missing", uniformVerdicts("missing"), UNKNOWN_TTL_MS],
    ["unknown malformed", uniformVerdicts("malformed"), UNKNOWN_TTL_MS],
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
  const notDisclosed = uniformVerdicts("not-disclosed");

  function expiresAt(verdicts: KindVerdicts, ttl: number): void {
    expect(isFresh(verdicts, T, T + ttl - 1)).toBe(true);
    expect(isFresh(verdicts, T, T + ttl)).toBe(false);
  }

  it("keeps the AI notes for 7 days while every other kind is not disclosed", () => {
    expiresAt({ ...notDisclosed, ai: FULL_DISCLOSED.ai }, 7 * DAY_MS);
  });

  it("keeps a game that disclosed nothing for 12 hours, the AI kind's TTL", () => {
    expiresAt(notDisclosed, 12 * HOUR_MS);
  });

  it("does not shorten an app because a non-AI kind is not disclosed", () => {
    for (const kind of KINDS) {
      if (kind.id !== "ai") {
        expiresAt({ ...FULL_DISCLOSED, [kind.id]: NOT_DISCLOSED }, 7 * DAY_MS);
      }
    }
  });

  it("expires with the AI kind when it is not disclosed, whatever the others are", () => {
    expiresAt({ ...FULL_DISCLOSED, ai: NOT_DISCLOSED }, 12 * HOUR_MS);
  });

  it("expires after 6 hours when any kind is gated, missing or malformed", () => {
    const aiNotes = { ...notDisclosed, ai: FULL_DISCLOSED.ai };
    for (const kind of KINDS) {
      for (const reason of ["gated", "missing", "malformed"] as const) {
        expiresAt({ ...aiNotes, [kind.id]: UNKNOWN[reason] }, UNKNOWN_TTL_MS);
      }
    }
  });

  it("expires at once with a verdict that is not stored", () => {
    for (const kind of KINDS) {
      const failed = { ...FULL_DISCLOSED, [kind.id]: UNKNOWN.error };
      expect(isFresh(failed, T, T + TRANSIENT_TTL_MS - 1)).toBe(true);
      expect(isFresh(failed, T, T + TRANSIENT_TTL_MS)).toBe(false);
    }
  });

  it("keeps disclosed kinds for 7 days when no kind is shorter", () => {
    expiresAt(FULL_DISCLOSED, 7 * DAY_MS);
  });
});
