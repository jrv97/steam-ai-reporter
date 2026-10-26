import { describe, expect, it } from "vitest";
import { withKind } from "../../../tests/helpers/settings";
import { DEFAULT_SETTINGS, type Settings } from "../settings/settings";
import { BASE_SECTIONS, coversSections, requestSections } from "./sections";

const on = (settings: Settings, ...ids: ("deck" | "machine" | "pvp")[]) =>
  ids.reduce((next, id) => withKind(next, id, { enabled: true }), settings);

describe("requestSections", () => {
  it.each(
    [
      ["the settings as installed", DEFAULT_SETTINGS, BASE_SECTIONS],
      ["a kind on that reads no section", on(DEFAULT_SETTINGS, "pvp"), BASE_SECTIONS],
      ["the deck kind on", on(DEFAULT_SETTINGS, "deck"), ["basic_info", "platforms"]],
      ["the machine kind on", on(DEFAULT_SETTINGS, "machine"), ["basic_info", "platforms"]],
      ["both on", on(DEFAULT_SETTINGS, "deck", "machine"), ["basic_info", "platforms"]],
      [
        "the deck kind off with its badge, banner and values set",
        withKind(DEFAULT_SETTINGS, "deck", { badge: true, banner: true, facets: ["verified"] }),
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
      ["fewer sections", ["basic_info"], ["platforms"], false],
      ["no record, an answer without GetItems details", undefined, ["platforms"], true],
      ["nothing needed", ["basic_info"], [], true],
    ] as const,
  )("holds what a request needs after %s: %s", (_name, had, need, covers) => {
    expect(coversSections(had, need)).toBe(covers);
  });
});
