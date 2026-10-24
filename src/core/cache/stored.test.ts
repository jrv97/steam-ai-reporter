import { describe, expect, it } from "vitest";
import { aiVerdicts, disclosedVerdict, NOT_DISCLOSED } from "../../../tests/helpers/verdicts";
import type { AiVerdict } from "../kinds/ai";
import { UNKNOWN_KINDS } from "../kinds/verdicts";
import { UNKNOWN } from "../types";
import { decodeVerdicts, encodeVerdicts } from "./stored";

const T = 1_000_000_000_000;

describe("encodeVerdicts and decodeVerdicts", () => {
  it("round trip every stored verdict", () => {
    const verdicts: readonly AiVerdict[] = [
      disclosedVerdict(),
      disclosedVerdict({ language: "german", source: "html" }),
      NOT_DISCLOSED,
      { state: "not-disclosed", source: "html" },
      UNKNOWN.gated,
      UNKNOWN.missing,
    ];
    for (const ai of verdicts) {
      expect(decodeVerdicts(encodeVerdicts(aiVerdicts(ai), T))).toStrictEqual({
        verdicts: aiVerdicts(ai),
        time: T,
      });
    }
  });

  it("stores the fetch time once and one entry for each kind", () => {
    expect(encodeVerdicts(aiVerdicts(NOT_DISCLOSED), T)).toStrictEqual({
      time: T,
      kinds: { ai: { state: "not-disclosed", source: "api" } },
    });
  });

  it("keeps the notes language, service and name, and leaves them out when absent", () => {
    const withAll = disclosedVerdict({ language: "spanish", service: "Suno", name: "Juego" });
    expect(encodeVerdicts(aiVerdicts(withAll), T)).toStrictEqual({
      time: T,
      kinds: {
        ai: {
          state: "disclosed",
          kind: "ai",
          notes: withAll.notes,
          language: "spanish",
          service: "Suno",
          name: "Juego",
          source: "api",
        },
      },
    });
    const bare: AiVerdict = {
      state: "disclosed",
      kind: "ai",
      notes: "x",
      language: "english",
      source: "api",
    };
    expect(encodeVerdicts(aiVerdicts(bare), T)).toStrictEqual({
      time: T,
      kinds: {
        ai: { state: "disclosed", kind: "ai", notes: "x", language: "english", source: "api" },
      },
    });
  });

  it("does not encode an app that has a verdict living in memory only", () => {
    expect(encodeVerdicts(UNKNOWN_KINDS.error, T)).toBeUndefined();
    expect(encodeVerdicts(UNKNOWN_KINDS["rate-limited"], T)).toBeUndefined();
    expect(encodeVerdicts(aiVerdicts(UNKNOWN.error), T)).toBeUndefined();
  });

  it("shares the unknown verdict objects", () => {
    const decoded = decodeVerdicts(encodeVerdicts(UNKNOWN_KINDS.gated, T));
    expect(decoded?.verdicts.ai).toBe(UNKNOWN.gated);
  });
});

describe("decodeVerdicts", () => {
  const valid = {
    time: T,
    kinds: {
      ai: { state: "disclosed", kind: "ai", notes: "text", language: "english", source: "api" },
    },
  };

  function withAi(ai: unknown, time: unknown = T): unknown {
    return { time, kinds: { ai } };
  }

  const withoutTime = { kinds: { ai: valid.kinds.ai } };

  it("accepts the valid shape", () => {
    expect(decodeVerdicts(valid)?.verdicts.ai.state).toBe("disclosed");
    expect(decodeVerdicts(valid)?.time).toBe(T);
  });

  it("discards values of the wrong type", () => {
    for (const stored of [undefined, null, 7, "disclosed", true, [], [valid]]) {
      expect(decodeVerdicts(stored)).toBeUndefined();
    }
  });

  it("discards an entry written before the kind existed or with a kind missing", () => {
    expect(decodeVerdicts({ time: T, kinds: {} })).toBeUndefined();
    expect(decodeVerdicts({ time: T })).toBeUndefined();
    expect(decodeVerdicts({ time: T, kinds: { other: valid.kinds.ai } })).toBeUndefined();
  });

  it("discards the v1 shape, which kept one verdict flat under the key", () => {
    const v1 = { state: "disclosed", time: T, notes: "text", language: "english", source: "api" };
    expect(decodeVerdicts(v1)).toBeUndefined();
    expect(decodeVerdicts({ state: "not-disclosed", time: T, source: "api" })).toBeUndefined();
  });

  it("discards malformed entries instead of casting them", () => {
    const ai = valid.kinds.ai;
    const bad: readonly unknown[] = [
      withAi({ ...ai, state: "maybe" }),
      withAi({ ...ai, state: undefined }),
      withAi({ ...ai, kind: "drm" }),
      withAi({ ...ai, kind: undefined }),
      withAi(ai, "yesterday"),
      withAi(ai, Number.NaN),
      withoutTime,
      withAi({ ...ai, notes: "" }),
      withAi({ ...ai, notes: 5 }),
      withAi({ ...ai, language: "klingon" }),
      withAi({ ...ai, language: undefined }),
      withAi({ ...ai, source: "guess" }),
      withAi({ ...ai, service: 3 }),
      withAi({ ...ai, name: null }),
      withAi({ state: "not-disclosed" }),
      withAi({ state: "unknown", reason: "error" }),
      withAi({ state: "unknown", reason: "rate-limited" }),
      withAi({ state: "unknown" }),
      withAi(null),
    ];
    for (const stored of bad) {
      expect(decodeVerdicts(stored)).toBeUndefined();
    }
  });

  it("drops unknown keys and kinds", () => {
    const decoded = decodeVerdicts({
      time: T,
      extra: "x",
      kinds: { ai: { ...valid.kinds.ai, extra: "x" }, other: { state: "unknown" } },
    });
    expect(decoded?.verdicts).toStrictEqual(
      aiVerdicts({
        state: "disclosed",
        kind: "ai",
        notes: "text",
        language: "english",
        source: "api",
      }),
    );
  });
});
