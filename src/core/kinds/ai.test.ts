import { describe, expect, it } from "vitest";
import type { ExtraDetails } from "../detect/getitems.schema";
import { AI_KIND } from "./ai";
import type { KindInput } from "./kind";

function input(details: ExtraDetails, name?: string): KindInput {
  return { details, name, language: "english" };
}

describe("AI_KIND.fromGetItems", () => {
  it("is disclosed with the trimmed notes, the service and the store name", () => {
    const verdict = AI_KIND.fromGetItems(input({
      content_survey_ai_notes: "\u200b Concept art was generated.\nNo AI text. \n",
      ai_generation_service: { name: " Midjourney " },
    }, " Fixture Game "));
    expect(verdict).toStrictEqual({
      state: "disclosed",
      notes: "Concept art was generated.\nNo AI text.",
      language: "english",
      service: "Midjourney",
      name: "Fixture Game",
      source: "api",
    });
  });

  it("leaves out the service and the name when they are blank or absent", () => {
    const verdict = AI_KIND.fromGetItems(input({
      content_survey_ai_notes: "Used for textures.",
      ai_generation_service: { name: " " },
    }, ""));
    expect(verdict).toStrictEqual({
      state: "disclosed",
      notes: "Used for textures.",
      language: "english",
      source: "api",
    });
  });

  it("keeps the language the request asked for", () => {
    const verdict = AI_KIND.fromGetItems({
      details: { content_survey_ai_notes: "Texturas." },
      name: undefined,
      language: "spanish",
    });
    expect(verdict.state === "disclosed" ? verdict.language : undefined).toBe("spanish");
  });

  it("is not disclosed when the notes are absent or blank", () => {
    for (
      const details of [{}, { content_survey_ai_notes: "" }, {
        content_survey_ai_notes: " \u200b\n",
      }]
    ) {
      expect(AI_KIND.fromGetItems(input(details))).toStrictEqual({
        state: "not-disclosed",
        source: "api",
      });
    }
  });

  it("is not disclosed when only a service is named", () => {
    const verdict = AI_KIND.fromGetItems(input({ ai_generation_service: { name: "Midjourney" } }));
    expect(verdict.state).toBe("not-disclosed");
  });
});
