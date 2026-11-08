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

  it.each([
    [
      "spacing, line breaks and markup",
      " EA online activation required.\n<b>Denuvo</b> Anti-tamper ",
    ],
    ["4,000 characters", "x".repeat(4000)],
  ])("keeps the text verbatim, %s included", (_name, text) => {
    expect(fromDetails({ drm_third_party_type: text })).toMatchObject({ text });
  });

  it("adds the activation limit when Steam sends one", () => {
    const verdict = fromDetails({
      drm_third_party_type: "Denuvo",
      drm_activation_limit: "5 activations within 24 hours",
    });
    expect(verdict).toMatchObject({ activationLimit: "5 activations within 24 hours" });
  });

  it.each<readonly [string, unknown]>([
    ["blank", " "],
    ["a list", []],
    ["a number", 5],
    ["over the text limit", "x".repeat(4001)],
  ])("stays disclosed without an activation limit that is %s", (_name, drm_activation_limit) => {
    const verdict = fromDetails({ drm_third_party_type: "Denuvo", drm_activation_limit });
    expect(verdict).toStrictEqual({
      state: "disclosed",
      kind: "drm",
      source: "api",
      text: "Denuvo",
    });
  });

  it.each<readonly [string, Readonly<Record<string, unknown>>]>([
    ["no text", {}],
    ["empty text", { drm_third_party_type: "" }],
    ["blank text", { drm_third_party_type: " \n" }],
    ["an activation limit alone", { drm_activation_limit: "5 a day" }],
  ])("is not disclosed for %s", (_name, details) => {
    expect(fromDetails(details)).toStrictEqual({ state: "not-disclosed", source: "api" });
  });

  it("is unknown malformed when a field it reads is malformed, and only then", () => {
    expect(fromDetails({ drm_third_party_type: 4 })).toBe(UNKNOWN.malformed);
    expect(fromDetails({ drm_third_party_type: "x".repeat(4001) })).toBe(UNKNOWN.malformed);
    expect(fromDetails({ drm_third_party_type: "Denuvo", anticheat: 5, eula: 6 }).state).toBe(
      "disclosed",
    );
  });
});
