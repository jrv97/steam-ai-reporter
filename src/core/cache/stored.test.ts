import { describe, expect, it } from "vitest";
import { disclosedVerdict, NOT_DISCLOSED } from "../../../tests/helpers/verdicts";
import { UNKNOWN, type Verdict } from "../types";
import { decodeVerdict, encodeVerdict } from "./stored";

const T = 1_000_000_000_000;

describe("encodeVerdict and decodeVerdict", () => {
  it("round trip every stored verdict", () => {
    const verdicts: readonly Verdict[] = [
      disclosedVerdict(),
      disclosedVerdict({ language: "german", source: "html" }),
      NOT_DISCLOSED,
      { state: "not-disclosed", source: "html" },
      UNKNOWN.gated,
      UNKNOWN.missing,
    ];
    for (const verdict of verdicts) {
      expect(decodeVerdict(encodeVerdict(verdict, T))).toStrictEqual({ verdict, time: T });
    }
  });

  it("keeps the notes language, service and name, and leaves them out when absent", () => {
    const withAll = disclosedVerdict({ language: "spanish", service: "Suno", name: "Juego" });
    expect(encodeVerdict(withAll, T)).toStrictEqual({
      state: "disclosed",
      time: T,
      notes: withAll.notes,
      language: "spanish",
      service: "Suno",
      name: "Juego",
      source: "api",
    });
    const bare: Verdict = {
      state: "disclosed",
      notes: "x",
      language: "english",
      source: "api",
    };
    expect(encodeVerdict(bare, T)).toStrictEqual({
      state: "disclosed",
      time: T,
      notes: "x",
      language: "english",
      source: "api",
    });
  });

  it("does not encode the verdicts that live in memory only", () => {
    expect(encodeVerdict(UNKNOWN.error, T)).toBeUndefined();
    expect(encodeVerdict(UNKNOWN["rate-limited"], T)).toBeUndefined();
  });

  it("shares the unknown verdict objects", () => {
    expect(decodeVerdict(encodeVerdict(UNKNOWN.gated, T))?.verdict).toBe(UNKNOWN.gated);
  });
});

describe("decodeVerdict", () => {
  const valid = {
    state: "disclosed",
    time: T,
    notes: "text",
    language: "english",
    source: "api",
  };

  it("accepts the valid shape", () => {
    expect(decodeVerdict(valid)?.verdict.state).toBe("disclosed");
  });

  it("discards values of the wrong type", () => {
    for (const stored of [undefined, null, 7, "disclosed", true, [], [valid]]) {
      expect(decodeVerdict(stored)).toBeUndefined();
    }
  });

  it("discards old-schema and malformed entries instead of casting them", () => {
    const bad: readonly unknown[] = [
      { s: "d", t: T, n: "text" },
      { ...valid, state: "maybe" },
      { ...valid, state: undefined },
      { ...valid, time: "yesterday" },
      { ...valid, time: Number.NaN },
      { ...valid, time: undefined },
      { ...valid, notes: "" },
      { ...valid, notes: 5 },
      { ...valid, language: "klingon" },
      { ...valid, language: undefined },
      { ...valid, source: "guess" },
      { ...valid, service: 3 },
      { ...valid, name: null },
      { state: "not-disclosed", time: T },
      { state: "unknown", time: T, reason: "error" },
      { state: "unknown", time: T, reason: "rate-limited" },
      { state: "unknown", time: T },
    ];
    for (const stored of bad) {
      expect(decodeVerdict(stored)).toBeUndefined();
    }
  });

  it("drops unknown keys", () => {
    const decoded = decodeVerdict({ ...valid, extra: "x" });
    expect(decoded?.verdict).toStrictEqual({
      state: "disclosed",
      notes: "text",
      language: "english",
      source: "api",
    });
  });
});
