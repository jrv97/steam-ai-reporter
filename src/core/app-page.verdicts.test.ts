import { describe, expect, it, vi } from "vitest";
import { appId } from "../../tests/helpers/app-ids";
import { APP_PAGES } from "../../tests/helpers/app-page";
import { fakeDetector } from "../../tests/helpers/fake-detector";
import { capturedVerdicts } from "../../tests/helpers/fixture-verdicts";
import { aiVerdicts, disclosedVerdict, NOT_DISCLOSED } from "../../tests/helpers/verdicts";
import { mergeVerdicts, translatedVerdicts } from "./app-page";
import { parseAppPage } from "./detect/app-page";
import { KINDS } from "./kinds/registry";
import { UNKNOWN_KINDS } from "./kinds/verdicts";
import { UNKNOWN } from "./types";

const ID = appId(5072580);
const PAGE_URL = "https://store.steampowered.com/app/5072580/?l=english";

/** What the open English page says about itself: only the AI kind can be read from it. */
function pageOf(name: "5072580-ai-first.html" | "413150-no-block.html") {
  const doc = new DOMParser().parseFromString(APP_PAGES[name], "text/html");
  return parseAppPage(doc, PAGE_URL);
}

const none = () => undefined;

describe("mergeVerdicts", () => {
  it("takes every kind from Steam's data when both disclose", () => {
    const data = capturedVerdicts(1808500);
    const disagree = vi.fn();
    const merged = mergeVerdicts(pageOf("5072580-ai-first.html"), data, disagree);
    for (const kind of KINDS) {
      expect(merged[kind.id]).toBe(data[kind.id]);
    }
    expect(merged.ai).toBe(data.ai);
    expect(disagree).not.toHaveBeenCalled();
  });

  it("prefers a disclosure from Steam's data, which also names the AI service", () => {
    const named = aiVerdicts(disclosedVerdict({ service: "Midjourney" }));
    const merged = mergeVerdicts(pageOf("5072580-ai-first.html"), named, none);
    expect(merged.ai).toMatchObject({ source: "api", service: "Midjourney" });
  });

  it("keeps the page's disclosure when Steam's data has none, and reports the disagreement", () => {
    const disagree = vi.fn();
    const page = pageOf("5072580-ai-first.html");
    const merged = mergeVerdicts(page, aiVerdicts(NOT_DISCLOSED), disagree);
    expect(merged.ai).toBe(page.ai);
    expect(disagree).toHaveBeenCalledWith("ai", page.ai, NOT_DISCLOSED);
  });

  it("keeps Steam's disclosure when the page shows none, and reports the disagreement", () => {
    const disagree = vi.fn();
    const data = aiVerdicts(disclosedVerdict());
    const page = pageOf("413150-no-block.html");
    const merged = mergeVerdicts(page, data, disagree);
    expect(merged.ai).toBe(data.ai);
    expect(disagree).toHaveBeenCalledOnce();
    expect(disagree).toHaveBeenCalledWith("ai", page.ai, data.ai);
  });

  it("keeps Steam's disclosure when the page hid the store, and reports it", () => {
    const disagree = vi.fn();
    const data = aiVerdicts(disclosedVerdict());
    const merged = mergeVerdicts(UNKNOWN_KINDS.gated, data, disagree);
    expect(merged.ai).toBe(data.ai);
    expect(disagree).toHaveBeenCalledWith("ai", UNKNOWN.gated, data.ai);
  });

  it("uses Steam's answer when the page's is unknown, without a report", () => {
    const disagree = vi.fn();
    const data = aiVerdicts(disclosedVerdict());
    expect(mergeVerdicts(UNKNOWN_KINDS.missing, data, disagree).ai).toBe(data.ai);
    expect(disagree).not.toHaveBeenCalled();
  });

  it("keeps the page's answer when Steam's data could not answer", () => {
    const page = pageOf("5072580-ai-first.html");
    expect(mergeVerdicts(page, UNKNOWN_KINDS.error, none).ai).toBe(page.ai);
    const quiet = pageOf("413150-no-block.html");
    expect(mergeVerdicts(quiet, UNKNOWN_KINDS["rate-limited"], none).ai).toBe(quiet.ai);
  });

  it("settles a page that shows none and data that has none as not disclosed", () => {
    const data = aiVerdicts(NOT_DISCLOSED);
    expect(mergeVerdicts(pageOf("413150-no-block.html"), data, none).ai).toBe(NOT_DISCLOSED);
  });

  it("never lets the page speak for a kind that cannot be read from it", () => {
    const data = capturedVerdicts(813230);
    const page = { ...UNKNOWN_KINDS.missing, kernel: capturedVerdicts(1808500).kernel };
    expect(mergeVerdicts(page, data, none).kernel).toBe(data.kernel);
  });

  it("holds a verdict for every kind", () => {
    const merged = mergeVerdicts(UNKNOWN_KINDS.missing, UNKNOWN_KINDS.error, none);
    expect(Object.keys(merged)).toStrictEqual(KINDS.map((kind) => kind.id));
  });
});

describe("translatedVerdicts", () => {
  it("takes Steam's data as it is when the AI notes are in the page's language", async () => {
    const detected = aiVerdicts(disclosedVerdict({ language: "german" }));
    const getItems = fakeDetector(() => UNKNOWN_KINDS.error);
    expect(await translatedVerdicts(ID, "german", detected, getItems)).toBe(detected);
    expect(getItems.calls).toEqual([]);
  });

  it("asks GetItems again when the stored AI notes are in another language", async () => {
    const stored = capturedVerdicts(1808500);
    const fresh = disclosedVerdict({ language: "german", notes: "Deutsche Hinweise." });
    const getItems = fakeDetector(() => aiVerdicts(fresh));

    const verdicts = await translatedVerdicts(ID, "german", stored, getItems);

    expect(verdicts.ai).toBe(fresh);
    expect(verdicts.kernel).toBe(stored.kernel);
    expect(getItems.calls).toEqual([[ID]]);
  });

  it("keeps the stored verdicts when the second answer is no disclosure", async () => {
    const stored = capturedVerdicts(1808500);
    const getItems = fakeDetector(() => UNKNOWN_KINDS.error);
    expect(await translatedVerdicts(ID, "german", stored, getItems)).toBe(stored);
  });
});
