import { describe, expect, it } from "vitest";
import { withKind } from "../../../tests/helpers/settings";
import { DEFAULT_SETTINGS, type Settings } from "../settings/settings";
import { BASE_SECTIONS, coversSections, requestSections } from "./sections";

// The settings as installed ask for Early Access's release section, so most cases start without it.
const NO_EARLY_ACCESS = withKind(DEFAULT_SETTINGS, "earlyaccess", { enabled: false });

const on = (settings: Settings, ...ids: ("deck" | "machine" | "pvp")[]) =>
  ids.reduce((next, id) => withKind(next, id, { enabled: true }), settings);

describe("requestSections", () => {
  it.each(
    [
      ["the settings as installed", DEFAULT_SETTINGS, ["basic_info", "release"]],
      ["the kind off", NO_EARLY_ACCESS, BASE_SECTIONS],
      ["a kind on that reads no section", on(NO_EARLY_ACCESS, "pvp"), BASE_SECTIONS],
      ["the deck kind on", on(NO_EARLY_ACCESS, "deck"), ["basic_info", "platforms"]],
      ["the machine kind on", on(NO_EARLY_ACCESS, "machine"), ["basic_info", "platforms"]],
      ["both on", on(NO_EARLY_ACCESS, "deck", "machine"), ["basic_info", "platforms"]],
      [
        "the deck kind on beside early access",
        on(DEFAULT_SETTINGS, "deck"),
        ["basic_info", "platforms", "release"],
      ],
      [
        "the deck kind off with its badge, banner and values set",
        withKind(NO_EARLY_ACCESS, "deck", { badge: true, banner: true, facets: ["verified"] }),
        BASE_SECTIONS,
      ],
      [
        "the kind off with its badge and banner set",
        withKind(NO_EARLY_ACCESS, "earlyaccess", { badge: true, banner: true }),
        BASE_SECTIONS,
      ],
    ] as const,
  )("asks for basic_info and what the enabled kinds read: %s", (_n, settings, want) => {
    expect(requestSections(settings.kinds)).toStrictEqual(want);
  });
});

describe("coversSections", () => {
  it.each(
    [
      ["the sections asked for", ["basic_info", "platforms"], ["platforms"], true],
      ["no release section", ["basic_info", "platforms"], ["release"], false],
      ["fewer sections", ["basic_info"], ["platforms"], false],
      ["no record, an answer without GetItems details", undefined, ["platforms"], true],
      ["nothing needed", ["basic_info"], [], true],
    ] as const,
  )("holds what a request needs after %s: %s", (_name, had, need, covers) => {
    expect(coversSections(had, need)).toBe(covers);
  });
});
