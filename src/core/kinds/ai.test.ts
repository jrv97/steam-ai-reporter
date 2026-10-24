import { describe, expect, it } from "vitest";
import { APP_PAGES } from "../../../tests/helpers/app-page";
import { parsedItem } from "../../../tests/helpers/getitems";
import type { SteamLanguage } from "../i18n/locale";
import { UNKNOWN } from "../types";
import { AI_KIND } from "./ai";

function fromItem(
  details: Readonly<Record<string, unknown>>,
  overrides: Readonly<Record<string, unknown>> = {},
  language: SteamLanguage = "english",
) {
  const { item, details: parsed } = parsedItem(details, overrides);
  return AI_KIND.fromGetItems(item, parsed, language);
}

describe("AI_KIND.fromGetItems", () => {
  it("is disclosed with the trimmed notes, the service and the store name", () => {
    const verdict = fromItem({
      content_survey_ai_notes: "\u200b Concept art was generated.\nNo AI text. \n",
      ai_generation_service: { name: " Midjourney " },
    }, { name: " Fixture Game " });
    expect(verdict).toStrictEqual({
      state: "disclosed",
      kind: "ai",
      notes: "Concept art was generated.\nNo AI text.",
      language: "english",
      service: "Midjourney",
      name: "Fixture Game",
      source: "api",
    });
  });

  it("leaves out the service and the name when they are blank or absent", () => {
    const verdict = fromItem({
      content_survey_ai_notes: "Used for textures.",
      ai_generation_service: { name: " " },
    }, { name: "" });
    expect(verdict).toStrictEqual({
      state: "disclosed",
      kind: "ai",
      notes: "Used for textures.",
      language: "english",
      source: "api",
    });
    expect(fromItem({ content_survey_ai_notes: "x" }, { name: undefined })).not.toHaveProperty(
      "name",
    );
  });

  it("keeps the language the request asked for", () => {
    const verdict = fromItem({ content_survey_ai_notes: "Texturas." }, {}, "spanish");
    expect(verdict.state === "disclosed" ? verdict.language : undefined).toBe("spanish");
  });

  it("is not disclosed when the notes are absent or blank", () => {
    for (
      const details of [{}, { content_survey_ai_notes: "" }, {
        content_survey_ai_notes: " \u200b\n",
      }]
    ) {
      expect(fromItem(details)).toStrictEqual({ state: "not-disclosed", source: "api" });
    }
  });

  it("is not disclosed when only a service is named", () => {
    const verdict = fromItem({ ai_generation_service: { name: "Midjourney" } });
    expect(verdict.state).toBe("not-disclosed");
  });

  it("is unknown malformed when a field it reads is malformed", () => {
    const cases: readonly (readonly [Record<string, unknown>, Record<string, unknown>])[] = [
      [{ content_survey_ai_notes: 42 }, {}],
      [{ content_survey_ai_notes: "x", ai_generation_service: { name: 5 } }, {}],
      [{ ai_generation_service: "Midjourney" }, {}],
      [{ content_survey_ai_notes: "x" }, { name: 7 }],
    ];
    for (const [details, overrides] of cases) {
      expect(fromItem(details, overrides)).toBe(UNKNOWN.malformed);
    }
  });

  it("allows 4,000 characters of notes and is unknown malformed at 4,001", () => {
    expect(fromItem({ content_survey_ai_notes: "x".repeat(4000) }).state).toBe("disclosed");
    expect(fromItem({ content_survey_ai_notes: "x".repeat(4001) })).toBe(UNKNOWN.malformed);
  });

  it("keeps the AI kind known when the service is an empty list", () => {
    const verdict = fromItem({ content_survey_ai_notes: "Art.", ai_generation_service: [] });
    expect(verdict).toMatchObject({ state: "disclosed", notes: "Art." });
    expect(verdict).not.toHaveProperty("service");
  });

  it("ignores a malformed field of another kind", () => {
    expect(fromItem({ content_survey_ai_notes: "x", anticheat: 5, eula: "none" }).state).toBe(
      "disclosed",
    );
  });
});

describe("AI_KIND.fromAppPage", () => {
  function fromPage(html: string) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return AI_KIND.fromAppPage?.(doc, "Fixture Game");
  }

  it("reads the notes of the AI block, with the app name and the English language", () => {
    const verdict = fromPage(APP_PAGES["5072580-ai-first.html"]);
    expect(verdict).toMatchObject({
      state: "disclosed",
      kind: "ai",
      language: "english",
      source: "html",
      name: "Fixture Game",
    });
  });

  it("is not disclosed on a page without the block", () => {
    expect(fromPage(APP_PAGES["413150-no-block.html"])).toStrictEqual({
      state: "not-disclosed",
      source: "html",
    });
  });
});
