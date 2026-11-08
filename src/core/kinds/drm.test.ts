import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { verdictOf } from "../../../tests/helpers/getitems";
import { DRM_KIND } from "./drm";

function fromDetails(details: Readonly<Record<string, unknown>>) {
  return verdictOf(DRM_KIND, details);
}

describe("DRM_KIND.fromGetItems", () => {
  it("is disclosed with the developer's text", () => {
    const text = make.text.service();
    expect(fromDetails({ drm_third_party_type: text })).toStrictEqual(
      make.verdict.bare("drm", { text }),
    );
  });

  it.each<readonly [string, () => string]>([
    ["spacing, line breaks and markup", () => ` ${make.text.note()}\n${make.text.markup()} `],
    ["4,000 characters", () => "x".repeat(4000)],
  ])("keeps the text verbatim, %s included", (_name, textOf) => {
    const text = textOf();
    expect(fromDetails({ drm_third_party_type: text })).toMatchObject({ text });
  });

  it("adds the activation limit when Steam sends one", () => {
    const activationLimit = make.text.note();
    const verdict = fromDetails({
      drm_third_party_type: make.text.service(),
      drm_activation_limit: activationLimit,
    });
    expect(verdict).toMatchObject({ activationLimit });
  });

  it.each<readonly [string, unknown]>([
    ["blank", " "],
    ["a list", []],
    ["a number", 5],
    ["over the text limit", "x".repeat(4001)],
  ])("stays disclosed without an activation limit that is %s", (_name, drm_activation_limit) => {
    const text = make.text.service();
    const verdict = fromDetails({ drm_third_party_type: text, drm_activation_limit });
    expect(verdict).toStrictEqual(make.verdict.bare("drm", { text }));
  });

  it.each<readonly [string, Readonly<Record<string, unknown>>]>([
    ["no text", {}],
    ["empty text", { drm_third_party_type: "" }],
    ["blank text", { drm_third_party_type: " \n" }],
    ["an activation limit alone", { drm_activation_limit: make.text.note() }],
  ])("is not disclosed for %s", (_name, details) => {
    expect(fromDetails(details)).toStrictEqual(make.verdict.notDisclosed());
  });

  it.each<readonly [string, unknown]>([
    ["a number", 4],
    ["text over 4,000 characters", "x".repeat(4001)],
  ])("is unknown malformed for text that is %s", (_name, text) => {
    expect(fromDetails({ drm_third_party_type: text })).toBe(make.verdict.unknown("malformed"));
  });

  it("ignores malformed fields of other kinds", () => {
    const details = { drm_third_party_type: make.text.service(), anticheat: 5, eula: 6 };
    expect(fromDetails(details).state).toBe("disclosed");
  });
});
