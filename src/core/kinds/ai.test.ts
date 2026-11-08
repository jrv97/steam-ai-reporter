import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import type { SteamLanguage } from "../i18n/locale";
import { AI_KIND } from "./ai";

function fromItem(
  details: Readonly<Record<string, unknown>>,
  overrides: Readonly<Record<string, unknown>> = {},
  language: SteamLanguage = "english",
) {
  const { item, details: parsed } = make.item.parsed(details, overrides);
  return AI_KIND.fromGetItems(item, parsed, language);
}

describe("AI_KIND.fromGetItems", () => {
  it("is disclosed with the trimmed notes, the service and the store name", () => {
    const [first, second] = [make.text.note(), make.text.note()];
    const service = make.text.service();
    const name = make.text.name();
    const verdict = fromItem({
      content_survey_ai_notes: `\u200b ${first}\n${second} \n`,
      ai_generation_service: { name: ` ${service} ` },
    }, { name: ` ${name} ` });
    expect(verdict).toStrictEqual(
      make.verdict.disclosed("ai", { notes: `${first}\n${second}`, service, name }),
    );
  });

  it.each<readonly [string, Readonly<Record<string, unknown>>]>([
    ["blank", { ai_generation_service: { name: " " }, name: "" }],
    ["absent", { name: undefined }],
  ])("leaves out the service and the name when they are %s", (_name, fields) => {
    const { ai_generation_service, ...item } = fields;
    const notes = make.text.note();
    const verdict = fromItem({ content_survey_ai_notes: notes, ai_generation_service }, item);
    expect(verdict).toStrictEqual(make.verdict.bare("ai", { notes, language: "english" }));
  });

  it("keeps the language the request asked for", () => {
    const verdict = fromItem({ content_survey_ai_notes: make.text.note() }, {}, "spanish");
    expect(verdict).toMatchObject({ language: "spanish" });
  });

  it.each<readonly [string, Readonly<Record<string, unknown>>]>([
    ["no notes", {}],
    ["empty notes", { content_survey_ai_notes: "" }],
    ["blank notes", { content_survey_ai_notes: " \u200b\n" }],
    ["a service named alone", { ai_generation_service: { name: make.text.service() } }],
  ])("is not disclosed for %s", (_name, details) => {
    expect(fromItem(details)).toStrictEqual(make.verdict.notDisclosed());
  });

  it.each<readonly [string, Readonly<Record<string, unknown>>, Readonly<Record<string, unknown>>]>([
    ["notes that are a number", { content_survey_ai_notes: 42 }, {}],
    ["a service name that is a number", {
      content_survey_ai_notes: make.text.note(),
      ai_generation_service: { name: 5 },
    }, {}],
    ["a service that is text", { ai_generation_service: make.text.service() }, {}],
    ["a store name that is a number", { content_survey_ai_notes: make.text.note() }, { name: 7 }],
    ["notes over 4,000 characters", { content_survey_ai_notes: "x".repeat(4001) }, {}],
  ])("is unknown malformed for %s", (_name, details, overrides) => {
    expect(fromItem(details, overrides)).toBe(make.verdict.unknown("malformed"));
  });

  it("allows 4,000 characters of notes", () => {
    expect(fromItem({ content_survey_ai_notes: "x".repeat(4000) }).state).toBe("disclosed");
  });

  it("keeps the AI kind known when the service is an empty list", () => {
    const notes = make.text.note();
    const verdict = fromItem({ content_survey_ai_notes: notes, ai_generation_service: [] });
    expect(verdict).toMatchObject({ state: "disclosed", notes });
    expect(verdict).not.toHaveProperty("service");
  });

  it("ignores a malformed field of another kind", () => {
    const details = { content_survey_ai_notes: make.text.note(), anticheat: 5, eula: "none" };
    expect(fromItem(details).state).toBe("disclosed");
  });
});

describe("AI_KIND.fromAppPage", () => {
  const name = make.text.name();

  function fromPage(html: string) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return AI_KIND.fromAppPage?.(doc, name);
  }

  it("reads the notes of the AI block, with the app name and the English language", () => {
    const verdict = fromPage(make.page.app("5072580-ai-first.html"));
    expect(verdict).toMatchObject({
      state: "disclosed",
      kind: "ai",
      language: "english",
      source: "html",
      name,
    });
  });

  it("is not disclosed on a page without the block", () => {
    expect(fromPage(make.page.app("413150-no-block.html"))).toStrictEqual(
      make.verdict.notDisclosed("html"),
    );
  });
});
