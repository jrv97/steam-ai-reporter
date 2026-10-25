// @vitest-environment-options {"url":"https://store.steampowered.com/app/5072580/"}
import { afterEach, describe, expect, it } from "vitest";
import { appId } from "../../tests/helpers/app-ids";
import { APP_PAGES } from "../../tests/helpers/app-page";
import { fakeDetector } from "../../tests/helpers/fake-detector";
import { capturedVerdicts } from "../../tests/helpers/fixture-verdicts";
import { loadPage } from "../../tests/helpers/surfaces";
import { aiVerdicts, disclosedVerdict } from "../../tests/helpers/verdicts";
import { pageVerdicts } from "./app-page";
import type { KindVerdicts } from "./kinds/verdicts";
import { UNKNOWN_KINDS } from "./kinds/verdicts";

const ID = appId(5072580);

afterEach(() => {
  document.documentElement.lang = "";
});

function detectors(verdicts: KindVerdicts) {
  return { getItems: fakeDetector(() => verdicts), detector: fakeDetector(() => verdicts) };
}

describe("pageVerdicts on an English page", () => {
  it("takes the AI kind from the page and every other kind from the detector", async () => {
    loadPage(APP_PAGES["5072580-ai-first.html"]);
    document.documentElement.lang = "en";
    const found = detectors(capturedVerdicts(1808500));

    const verdicts = await pageVerdicts(document, ID, "english", found);

    expect(verdicts.ai).toMatchObject({ state: "disclosed", source: "html" });
    expect(verdicts.kernel).toBe(capturedVerdicts(1808500).kernel);
    expect(verdicts.eula).toBe(capturedVerdicts(1808500).eula);
    expect(verdicts.pvp).toBe(capturedVerdicts(1808500).pvp);
    expect(found.detector.calls).toEqual([[ID]]);
    expect(found.getItems.calls).toEqual([]);
  });

  it("adds the AI service GetItems named to the notes the page gave", async () => {
    loadPage(APP_PAGES["5072580-ai-first.html"]);
    document.documentElement.lang = "en";
    const named = aiVerdicts(disclosedVerdict({ service: "Midjourney" }));
    const { service: _service, ...plain } = disclosedVerdict();
    const unnamed = aiVerdicts(plain);

    const withService = await pageVerdicts(document, ID, "english", detectors(named));
    const without = await pageVerdicts(document, ID, "english", detectors(unnamed));

    expect(withService.ai).toMatchObject({
      state: "disclosed",
      source: "html",
      service: "Midjourney",
    });
    expect(without.ai).not.toHaveProperty("service");
  });

  it("keeps the kinds the detector found for a game whose page has no AI block", async () => {
    loadPage(APP_PAGES["3751950-drm-account-eula.html"]);
    document.documentElement.lang = "en";
    const detected = capturedVerdicts(3751950);

    const verdicts = await pageVerdicts(document, appId(3751950), "english", detectors(detected));

    expect(verdicts.ai).toMatchObject({ state: "not-disclosed", source: "html" });
    expect(verdicts.drm).toBe(detected.drm);
    expect(verdicts.account).toBe(detected.account);
    expect(verdicts.eula).toBe(detected.eula);
  });

  it("keeps the page's answer for AI when the page hid the store", async () => {
    loadPage(APP_PAGES["339800-login-redirect.html"]);
    document.documentElement.lang = "en";
    const detected = capturedVerdicts(3751950);

    const verdicts = await pageVerdicts(document, ID, "english", detectors(detected));

    expect(verdicts.ai).toBe(UNKNOWN_KINDS.gated.ai);
    expect(verdicts.drm).toBe(detected.drm);
  });

  it("leaves the other kinds unknown when the detector cannot answer", async () => {
    loadPage(APP_PAGES["5072580-ai-first.html"]);
    document.documentElement.lang = "en";

    const verdicts = await pageVerdicts(
      document,
      ID,
      "english",
      detectors(UNKNOWN_KINDS.error),
    );

    expect(verdicts.ai.state).toBe("disclosed");
    expect(verdicts.drm).toBe(UNKNOWN_KINDS.error.drm);
  });
});

describe("pageVerdicts on a page in another language", () => {
  it("takes every kind from the detector and never reads the page", async () => {
    loadPage(APP_PAGES["5072580-ai-first.html"]);
    document.documentElement.lang = "de";
    const detected = aiVerdicts(disclosedVerdict({ language: "german" }));
    const found = detectors(detected);

    const verdicts = await pageVerdicts(document, ID, "german", found);

    expect(verdicts).toBe(detected);
    expect(found.getItems.calls).toEqual([]);
  });

  it("asks GetItems again when the stored AI notes are in another language", async () => {
    loadPage(APP_PAGES["5072580-ai-first.html"]);
    document.documentElement.lang = "de";
    const stored = capturedVerdicts(1808500);
    const fresh = disclosedVerdict({ language: "german", notes: "Deutsche Hinweise." });
    const found = {
      detector: fakeDetector(() => stored),
      getItems: fakeDetector(() => aiVerdicts(fresh)),
    };

    const verdicts = await pageVerdicts(document, ID, "german", found);

    expect(verdicts.ai).toBe(fresh);
    expect(verdicts.kernel).toBe(stored.kernel);
    expect(found.getItems.calls).toEqual([[ID]]);
  });

  it("keeps the stored verdicts when the second answer is no disclosure", async () => {
    loadPage(APP_PAGES["5072580-ai-first.html"]);
    document.documentElement.lang = "de";
    const stored = capturedVerdicts(1808500);
    const found = {
      detector: fakeDetector(() => stored),
      getItems: fakeDetector(() => UNKNOWN_KINDS.error),
    };

    expect(await pageVerdicts(document, ID, "german", found)).toBe(stored);
  });
});
