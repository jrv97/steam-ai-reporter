import { describe, expect, it } from "vitest";
import { verdictOf } from "../../../tests/helpers/getitems";
import { UNKNOWN } from "../types";
import { DRM_KIND } from "./drm";

function fromDetails(details: Readonly<Record<string, unknown>>) {
  return verdictOf(DRM_KIND, details);
}

describe("DRM_KIND.fromGetItems", () => {
  it("is disclosed with the developer's text", () => {
    expect(fromDetails({ drm_third_party_type: "Denuvo Anti-tamper" })).toStrictEqual({
      state: "disclosed",
      kind: "drm",
      source: "api",
      text: "Denuvo Anti-tamper",
    });
  });

  it("keeps the text verbatim: spacing, line breaks and markup stay", () => {
    const text = " EA online activation required.\n<b>Denuvo</b> Anti-tamper ";
    expect(fromDetails({ drm_third_party_type: text })).toMatchObject({ text });
  });

  it("adds the activation limit when Steam sends one", () => {
    const verdict = fromDetails({
      drm_third_party_type: "Denuvo",
      drm_activation_limit: "5 activations within 24 hours",
    });
    expect(verdict).toMatchObject({ activationLimit: "5 activations within 24 hours" });
    expect(fromDetails({ drm_third_party_type: "Denuvo", drm_activation_limit: " " })).not
      .toHaveProperty("activationLimit");
  });

  it("is not disclosed when the field is absent or holds only blanks", () => {
    for (const details of [{}, { drm_third_party_type: "" }, { drm_third_party_type: " \n" }]) {
      expect(fromDetails(details)).toStrictEqual({ state: "not-disclosed", source: "api" });
    }
  });

  it("is not disclosed on an activation limit alone", () => {
    expect(fromDetails({ drm_activation_limit: "5 a day" }).state).toBe("not-disclosed");
  });

  it("is unknown malformed when a field it reads is malformed, and only then", () => {
    expect(fromDetails({ drm_third_party_type: 4 })).toBe(UNKNOWN.malformed);
    expect(fromDetails({ drm_third_party_type: "x".repeat(4001) })).toBe(UNKNOWN.malformed);
    expect(fromDetails({ drm_third_party_type: "Denuvo", anticheat: 5, eula: 6 }).state).toBe(
      "disclosed",
    );
  });

  it("allows 4,000 characters of text", () => {
    const text = "x".repeat(4000);
    expect(fromDetails({ drm_third_party_type: text })).toMatchObject({ text });
  });

  it("stays disclosed without the activation limit when that field is malformed", () => {
    for (const drm_activation_limit of [[], 5, "x".repeat(4001)]) {
      const verdict = fromDetails({ drm_third_party_type: "Denuvo", drm_activation_limit });
      expect(verdict).toStrictEqual({
        state: "disclosed",
        kind: "drm",
        source: "api",
        text: "Denuvo",
      });
    }
  });
});
