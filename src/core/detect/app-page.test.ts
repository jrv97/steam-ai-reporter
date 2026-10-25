import { describe, expect, it } from "vitest";
import { detectorContract } from "../../../tests/contracts/detector.contract";
import { appId, appIds } from "../../../tests/helpers/app-ids";
import { APP_PAGES, type AppPageName } from "../../../tests/helpers/app-page";
import { fakeHttp, type Reply } from "../../../tests/helpers/fake-http";
import type { AiVerdict } from "../kinds/ai";
import { KINDS } from "../kinds/registry";
import { UNKNOWN_KINDS } from "../kinds/verdicts";
import { UNKNOWN, type Verdict } from "../types";
import { createAppPageDetector, parseAppPage, parseLiveAppPage } from "./app-page";

function fixture(name: AppPageName): string {
  return APP_PAGES[name];
}

function doc(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function parseFixture(name: AppPageName, url: string): AiVerdict {
  return parseAppPage(doc(fixture(name)), url).ai;
}

const APP = (id: number): string => `https://store.steampowered.com/app/${id}/?l=english`;

function notesOf(verdict: AiVerdict): string | undefined {
  return verdict.state === "disclosed" ? verdict.notes : undefined;
}

describe("parseAppPage over the captured fixtures", () => {
  it("reads the AI block when it comes first", () => {
    const verdict = parseFixture("5072580-ai-first.html", APP(5072580));
    expect(verdict.state).toBe("disclosed");
    expect(notesOf(verdict)).toMatch(/^Generative AI is used in both/);
    expect(notesOf(verdict)).not.toMatch(/dark fantasy/);
    expect(verdict).toMatchObject({ language: "english", source: "html" });
  });

  it("reads the AI block when the mature block comes first", () => {
    const first = parseFixture("5072580-ai-first.html", APP(5072580));
    const swapped = parseFixture("synthetic-mature-first.html", APP(5072580));
    expect(notesOf(swapped)).toBeDefined();
    expect(notesOf(swapped)).toBe(notesOf(first));
  });

  it("reads a page with only the AI block, with the app name", () => {
    const verdict = parseFixture("1808500-ai-only.html", APP(1808500));
    expect(verdict.state).toBe("disclosed");
    expect(verdict).toHaveProperty("name");
  });

  it("keeps line breaks and trims the outer whitespace", () => {
    const notes = notesOf(parseFixture("4618750-ai-line-breaks.html", APP(4618750)));
    expect(notes).toMatch(/^Some visual assets/);
    expect(notes).toMatch(/\nThe game does not use AI to generate content during gameplay\.$/);
  });

  it("reads the live document after the autocollapse script wrapped the block", () => {
    const verdict = parseFixture(
      "1808500-live-dom.html",
      "https://store.steampowered.com/app/1808500/ARC_Raiders/",
    );
    expect(notesOf(verdict)).toMatch(/^During the development process/);
  });

  it("is not disclosed when the page has no block", () => {
    expect(parseFixture("413150-no-block.html", APP(413150))).toStrictEqual({
      state: "not-disclosed",
      source: "html",
    });
  });

  it("does not match the heading text inside the game's description", () => {
    expect(parseFixture("synthetic-heading-in-description.html", APP(413150)).state).toBe(
      "not-disclosed",
    );
  });

  it("is unknown gated for the agecheck, login and home redirects", () => {
    const cases = [
      ["synthetic-agecheck.html", "https://store.steampowered.com/agecheck/app/1938090/"],
      [
        "339800-login-redirect.html",
        "https://store.steampowered.com/login/?redir=" + encodeURIComponent(APP(339800)),
      ],
      ["99999999-home-redirect.html", "https://store.steampowered.com/"],
    ] as const;
    for (const [name, url] of cases) {
      expect(parseFixture(name, url)).toBe(UNKNOWN.gated);
    }
  });

  it("is unknown gated when the URL is not an app page, even with an app page body", () => {
    expect(
      parseFixture("5072580-ai-first.html", "https://store.steampowered.com/agecheck/app/5072580/"),
    )
      .toBe(UNKNOWN.gated);
    expect(parseFixture("5072580-ai-first.html", "not a url")).toBe(UNKNOWN.gated);
  });

  it("is unknown gated when the app name is missing", () => {
    expect(parseAppPage(doc("<html><body></body></html>"), APP(1))).toBe(UNKNOWN_KINDS.gated);
  });
});

describe("parseLiveAppPage", () => {
  const url = "https://store.steampowered.com/app/1808500/ARC_Raiders/";

  it("parses an English document", () => {
    expect(parseLiveAppPage(doc(fixture("1808500-live-dom.html")), url)?.ai.state).toBe(
      "disclosed",
    );
  });

  it("shares the page's unknown reason with every kind", () => {
    expect(parseLiveAppPage(doc('<html lang="en"><body></body></html>'), url)).toStrictEqual(
      UNKNOWN_KINDS.gated,
    );
  });

  it("does not answer on a localized document", () => {
    const html = fixture("1808500-live-dom.html").replace('lang="en"', 'lang="de"');
    expect(parseLiveAppPage(doc(html), url)).toBeUndefined();
  });
});

describe("createAppPageDetector", () => {
  const ai = appIds(5072580);
  const aiId = appId(5072580);

  function detector(routes: Parameters<typeof fakeHttp>[0]) {
    const http = fakeHttp(routes);
    return { http, detector: createAppPageDetector(http) };
  }

  const fixtureRoutes = [
    ["https://store.steampowered.com/app/5072580/", { body: fixture("5072580-ai-first.html") }],
    ["https://store.steampowered.com/app/413150/", { body: fixture("413150-no-block.html") }],
    [
      "https://store.steampowered.com/app/99999999/",
      { body: fixture("99999999-home-redirect.html"), url: "https://store.steampowered.com/" },
    ],
  ] as const;

  detectorContract("app page", () => createAppPageDetector(fakeHttp(fixtureRoutes)));

  it("fetches /app/<id>/?l=english once per distinct ID, one at a time", async () => {
    const { http, detector: d } = detector(fixtureRoutes);
    const verdicts = await d.detect(appIds(5072580, 413150, 99999999, 5072580));
    expect(http.calls).toStrictEqual([APP(5072580), APP(413150), APP(99999999)]);
    expect(http.maxInFlight).toBe(1);
    expect([...verdicts.values()].map((verdicts) => verdicts.ai.state)).toStrictEqual([
      "disclosed",
      "not-disclosed",
      "unknown",
    ]);
  });

  it("answers the open page from its document and requests the others", async () => {
    const http = fakeHttp(fixtureRoutes);
    const open = { id: aiId, verdicts: UNKNOWN_KINDS.error };
    const found = await createAppPageDetector(http, open).detect(appIds(5072580, 413150));
    expect(found.get(aiId)).toBe(open.verdicts);
    expect(found.get(appId(413150))?.ai.state).toBe("not-disclosed");
    expect(http.calls).toStrictEqual([APP(413150)]);
  });

  it("answers the AI kind only: the other kinds stay unknown", async () => {
    const { detector: d } = detector(fixtureRoutes);
    const found = await d.detect(appIds(5072580, 413150, 99999999));
    expect(found.get(aiId)?.ai.state).toBe("disclosed");
    for (const kind of KINDS) {
      if (kind.id !== "ai") {
        expect(found.get(aiId)?.[kind.id]).toBe(UNKNOWN.missing);
        expect(found.get(appId(413150))?.[kind.id]).toBe(UNKNOWN.missing);
      }
    }
    expect(found.get(appId(99999999))).toStrictEqual(UNKNOWN_KINDS.gated);
  });

  it("reads the page only for the kinds that declare it", () => {
    const readers = KINDS.filter((kind) => kind.fromAppPage !== undefined);
    expect(readers.map((kind) => kind.id)).toStrictEqual(["ai"]);
  });

  it("maps failures to unknown, never to not disclosed", async () => {
    const cases: readonly (readonly [Reply, Verdict])[] = [
      ["network-error", UNKNOWN.error],
      [{ status: 429 }, UNKNOWN["rate-limited"]],
      [{ status: 500 }, UNKNOWN.error],
      [{ status: 404 }, UNKNOWN.error],
    ];
    for (const [reply, expected] of cases) {
      const { detector: d } = detector([["https://", reply]]);
      expect((await d.detect(ai)).get(aiId)?.ai).toBe(expected);
    }
  });
});
