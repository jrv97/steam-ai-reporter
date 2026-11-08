import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { DEFAULT_BACKOFF } from "../detect/breaker";
import { RETRY_DELAY_MS } from "../detect/retry";
import { AI_KIND } from "../kinds/ai";
import { EARLY_ACCESS_KIND } from "../kinds/early-access";
import type { KindId } from "../kinds/id";
import { DAY_MS, HOUR_MS, type KindTtl, WEEK_TTL } from "../kinds/kind-ttl";
import { KIND_BY_ID, KINDS } from "../kinds/registry";
import { type KindVerdicts, UNKNOWN_KINDS } from "../kinds/verdicts";
import type { UnknownReason, Verdict } from "../types";
import {
  isFresh,
  isStoredReason,
  isTransient,
  TRANSIENT_TTL_MS,
  ttlMs,
  UNKNOWN_TTL_MS,
} from "./ttl";

const T = make.time();
// An app whose kinds are all disclosed expires with Early Access, the shortest-lived disclosure.
const FULL_TTL_MS = EARLY_ACCESS_KIND.ttl.disclosed;
const FULL = make.verdicts.full();
const NOT_DISCLOSED = make.verdict.notDisclosed();
/** The kinds that keep both answers for a week: all but the AI kind and Early Access. */
const WEEK_KINDS = KINDS.filter((kind) => kind.id !== "ai" && kind.id !== "earlyaccess");
const STORED_UNKNOWN = ["gated", "missing", "malformed"] as const;

describe("kind TTLs", () => {
  it.each<readonly [KindId, KindTtl]>([
    ["ai", { disclosed: 7 * DAY_MS, notDisclosed: 12 * HOUR_MS }],
    ["earlyaccess", { disclosed: 2 * DAY_MS, notDisclosed: 7 * DAY_MS }],
    ...WEEK_KINDS.map((kind): readonly [KindId, KindTtl] => [kind.id, {
      disclosed: 7 * DAY_MS,
      notDisclosed: 7 * DAY_MS,
    }]),
  ])("keep %s verdicts for %o", (id, ttl) => {
    expect(KIND_BY_ID[id].ttl).toStrictEqual(ttl);
  });
});

describe("ttlMs", () => {
  it.each<readonly [string, KindTtl, Verdict, number]>([
    ["an AI disclosure", AI_KIND.ttl, make.verdict.disclosed("ai"), 7 * DAY_MS],
    ["no AI disclosure", AI_KIND.ttl, NOT_DISCLOSED, 12 * HOUR_MS],
    ["no disclosure of a week-long kind", WEEK_TTL, NOT_DISCLOSED, 7 * DAY_MS],
    ...STORED_UNKNOWN.flatMap((reason): (readonly [string, KindTtl, Verdict, number])[] => [
      [`an AI unknown ${reason}`, AI_KIND.ttl, make.verdict.unknown(reason), 6 * HOUR_MS],
      [`a week-long unknown ${reason}`, WEEK_TTL, make.verdict.unknown(reason), 6 * HOUR_MS],
    ]),
    [
      "a section the request left out",
      WEEK_TTL,
      make.verdict.unknown("unrequested"),
      Number.POSITIVE_INFINITY,
    ],
    [
      "an unknown error, never stored",
      AI_KIND.ttl,
      make.verdict.unknown("error"),
      TRANSIENT_TTL_MS,
    ],
    [
      "an unknown rate-limited, never stored",
      AI_KIND.ttl,
      make.verdict.unknown("rate-limited"),
      TRANSIENT_TTL_MS,
    ],
  ])("keeps %s for its TTL", (_name, ttl, verdict, expected) => {
    expect(ttlMs(ttl, verdict)).toBe(expected);
  });

  it("runs out for an unstored verdict before a stored one and before a retry round", () => {
    expect(TRANSIENT_TTL_MS).toBeLessThan(UNKNOWN_TTL_MS);
    expect(TRANSIENT_TTL_MS).toBeLessThan(RETRY_DELAY_MS);
    expect(DEFAULT_BACKOFF.baseMs + DEFAULT_BACKOFF.jitterMs).toBeLessThan(RETRY_DELAY_MS);
  });
});

describe("isStoredReason", () => {
  it.each<readonly [UnknownReason, boolean]>([
    ["gated", true],
    ["missing", true],
    ["malformed", true],
    ["unrequested", true],
    ["error", false],
    ["rate-limited", false],
  ])("%s: %s", (reason, stored) => {
    expect(isStoredReason(reason)).toBe(stored);
  });
});

describe("isTransient", () => {
  it.each(
    [
      ["unknown error", true, make.verdicts.uniform("error")],
      ["unknown rate-limited", true, make.verdicts.uniform("rate-limited")],
      ["error and rate-limited mixed", true, {
        ...UNKNOWN_KINDS.error,
        ai: make.verdict.unknown("rate-limited"),
      }],
      ["unknown gated", false, make.verdicts.uniform("gated")],
      ["unknown missing", false, make.verdicts.uniform("missing")],
      ["unknown malformed", false, make.verdicts.uniform("malformed")],
      ["one kind answered", false, { ...UNKNOWN_KINDS.error, ai: NOT_DISCLOSED }],
      ["disclosed", false, make.verdicts.uniform("disclosed")],
      ["a demo's own disclosure beside its failed full game", true, {
        ...UNKNOWN_KINDS.error,
        drm: FULL.drm,
      }],
      ["a demo's own disclosure beside a stored unknown", false, {
        ...UNKNOWN_KINDS.missing,
        drm: FULL.drm,
      }],
      ["a section left out beside a failed lookup", true, {
        ...UNKNOWN_KINDS.error,
        pvp: make.verdict.unknown("unrequested"),
      }],
      ["a section left out beside answers", false, {
        ...make.verdicts.uniform("not-disclosed"),
        pvp: make.verdict.unknown("unrequested"),
      }],
    ] as const,
  )("%s: %s", (_name, transient, verdicts) => {
    expect(isTransient(verdicts)).toBe(transient);
  });
});

describe("isFresh", () => {
  const notDisclosed = make.verdicts.uniform("not-disclosed");
  const unrequested = make.verdict.unknown("unrequested");

  it.each<readonly [string, KindVerdicts, number]>([
    ["disclosed", make.verdicts.uniform("disclosed"), FULL_TTL_MS],
    ["not disclosed", notDisclosed, 12 * HOUR_MS],
    ["unknown gated", make.verdicts.uniform("gated"), UNKNOWN_TTL_MS],
    ["unknown missing", make.verdicts.uniform("missing"), UNKNOWN_TTL_MS],
    ["unknown malformed", make.verdicts.uniform("malformed"), UNKNOWN_TTL_MS],
    ["unknown error", make.verdicts.uniform("error"), TRANSIENT_TTL_MS],
    ["unknown rate-limited", make.verdicts.uniform("rate-limited"), TRANSIENT_TTL_MS],
    ["AI notes beside kinds not disclosed", { ...notDisclosed, ai: FULL.ai }, 7 * DAY_MS],
    ["AI not disclosed beside disclosed kinds", { ...FULL, ai: NOT_DISCLOSED }, 12 * HOUR_MS],
    ["early access no longer flagged", { ...FULL, earlyaccess: NOT_DISCLOSED }, 7 * DAY_MS],
    [
      "a section left out beside kinds not disclosed",
      { ...notDisclosed, pvp: unrequested },
      12 * HOUR_MS,
    ],
    ["a section left out beside disclosed kinds", { ...FULL, pvp: unrequested }, FULL_TTL_MS],
  ])("%s: fresh until exactly its TTL", (_name, verdicts, ttl) => {
    expect(isFresh(verdicts, T, T)).toBe(true);
    expect(isFresh(verdicts, T, T + ttl - 1)).toBe(true);
    expect(isFresh(verdicts, T, T + ttl)).toBe(false);
    expect(isFresh(verdicts, T, T + ttl + 1)).toBe(false);
  });

  it("treats a fetch time in the future as stale", () => {
    expect(isFresh(notDisclosed, T + 1, T)).toBe(false);
  });
});

describe("isFresh across kinds", () => {
  function expiresAt(verdicts: KindVerdicts, ttl: number): void {
    expect(isFresh(verdicts, T, T + ttl - 1)).toBe(true);
    expect(isFresh(verdicts, T, T + ttl)).toBe(false);
  }

  it.each(WEEK_KINDS.map((kind) => kind.id))(
    "does not shorten an app because %s is not disclosed",
    (id) => {
      expiresAt({ ...FULL, [id]: NOT_DISCLOSED }, FULL_TTL_MS);
    },
  );

  it.each(KINDS.flatMap((kind) => STORED_UNKNOWN.map((reason) => [kind.id, reason] as const)))(
    "expires after 6 hours when %s is unknown %s",
    (id, reason) => {
      const aiNotes = { ...make.verdicts.uniform("not-disclosed"), ai: FULL.ai };
      expiresAt({ ...aiNotes, [id]: make.verdict.unknown(reason) }, UNKNOWN_TTL_MS);
    },
  );

  it.each(KINDS.map((kind) => kind.id))("expires at once when %s failed", (id) => {
    expiresAt({ ...FULL, [id]: make.verdict.unknown("error") }, TRANSIENT_TTL_MS);
  });
});
