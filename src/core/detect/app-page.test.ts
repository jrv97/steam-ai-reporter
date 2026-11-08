import { describe, expect, it } from "vitest";
import { detectorContract } from "../../../tests/contracts/detector.contract";
import type { AppPageName } from "../../../tests/helpers/app-page";
import { make } from "../../../tests/helpers/factory";
import type { Reply, Route } from "../../../tests/helpers/fake-http";
import { fake } from "../../../tests/helpers/fakes";
import type { AiVerdict } from "../kinds/ai";
import { KINDS } from "../kinds/registry";
import type { Verdict } from "../types";
import { createAppPageDetector, parseAppPage, parseLiveAppPage } from "./app-page";

const STORE = "https://store.steampowered.com/";
const { aiWithService, arcRaiders, noBlock, lineBreaks, germanNotes, adultOnly, invalid } =
  make.fixture.app;

function doc(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function parseFixture(name: AppPageName, url: string): AiVerdict {
  return parseAppPage(doc(make.page.app(name)), url).ai;
}

/** The app page URL the detector requests for `id`. */
const APP = (id: number): string => `${STORE}app/${String(id)}/?l=english`;
/** The URL of the live ARC Raiders page, with its slug. */
const ARC_LIVE = `${STORE}app/${String(arcRaiders)}/ARC_Raiders/`;

function notesOf(verdict: AiVerdict): string | undefined {
  return verdict.state === "disclosed" ? verdict.notes : undefined;
}

describe("parseAppPage over the captured fixtures", () => {
  it("reads the AI block when it comes first", () => {
    const verdict = parseFixture("5072580-ai-first.html", APP(aiWithService));
    expect(verdict.state).toBe("disclosed");
    expect(notesOf(verdict)).toMatch(/^Generative AI is used in both/);
    expect(notesOf(verdict)).not.toMatch(/dark fantasy/);
    expect(verdict).toMatchObject({ language: "english", source: "html" });
  });

  it("reads the AI block when the mature block comes first", () => {
    const first = parseFixture("5072580-ai-first.html", APP(aiWithService));
    const swapped = parseFixture("synthetic-mature-first.html", APP(aiWithService));
    expect(notesOf(swapped)).toBeDefined();
    expect(notesOf(swapped)).toBe(notesOf(first));
  });

  it("reads a page with only the AI block, with the app name", () => {
    const verdict = parseFixture("1808500-ai-only.html", APP(arcRaiders));
    expect(verdict.state).toBe("disclosed");
    expect(verdict).toHaveProperty("name");
  });

  it("keeps line breaks and trims the outer whitespace", () => {
    const notes = notesOf(parseFixture("4618750-ai-line-breaks.html", APP(lineBreaks)));
    expect(notes).toMatch(/^Some visual assets/);
    expect(notes).toMatch(/\nThe game does not use AI to generate content during gameplay\.$/);
  });

  it("reads the live document after the autocollapse script wrapped the block", () => {
    const verdict = parseFixture("1808500-live-dom.html", ARC_LIVE);
    expect(notesOf(verdict)).toMatch(/^During the development process/);
  });

  it("is not disclosed when the page has no block", () => {
    expect(parseFixture("413150-no-block.html", APP(noBlock))).toStrictEqual(
      make.verdict.notDisclosed("html"),
    );
  });

  it("does not match the heading text inside the game's description", () => {
    expect(parseFixture("synthetic-heading-in-description.html", APP(noBlock)).state).toBe(
      "not-disclosed",
    );
  });

  it.each<readonly [string, AppPageName, string]>([
    [
      "the agecheck redirect",
      "synthetic-agecheck.html",
      `${STORE}agecheck/app/${String(germanNotes)}/`,
    ],
    [
      "the login redirect",
      "339800-login-redirect.html",
      `${STORE}login/?redir=${encodeURIComponent(APP(adultOnly))}`,
    ],
    ["the home redirect", "99999999-home-redirect.html", STORE],
    [
      "an app page body at a URL that is not an app page",
      "5072580-ai-first.html",
      `${STORE}agecheck/app/${String(aiWithService)}/`,
    ],
    ["an app page body at a URL that does not parse", "5072580-ai-first.html", "not a url"],
  ])("is unknown gated for %s", (_name, name, url) => {
    expect(parseFixture(name, url)).toBe(make.verdict.unknown("gated"));
  });

  it("is unknown gated when the app name is missing", () => {
    expect(parseAppPage(doc("<html><body></body></html>"), APP(make.appId()))).toBe(
      make.verdicts.uniform("gated"),
    );
  });
});

describe("parseLiveAppPage", () => {
  const live = make.page.app("1808500-live-dom.html");

  it("parses an English document", () => {
    expect(parseLiveAppPage(doc(live), ARC_LIVE)?.ai.state).toBe("disclosed");
  });

  it("shares the page's unknown reason with every kind", () => {
    expect(parseLiveAppPage(doc('<html lang="en"><body></body></html>'), ARC_LIVE)).toStrictEqual(
      make.verdicts.uniform("gated"),
    );
  });

  it("does not answer on a localized document", () => {
    const html = live.replace('lang="en"', 'lang="de"');
    expect(parseLiveAppPage(doc(html), ARC_LIVE)).toBeUndefined();
  });
});

describe("createAppPageDetector", () => {
  function detector(routes: readonly Route[]) {
    const http = fake.http(routes);
    return { http, detector: createAppPageDetector(http) };
  }

  const fixtureRoutes: readonly Route[] = [
    [`${STORE}app/${String(aiWithService)}/`, { body: make.page.app("5072580-ai-first.html") }],
    [`${STORE}app/${String(noBlock)}/`, { body: make.page.app("413150-no-block.html") }],
    [
      `${STORE}app/${String(invalid)}/`,
      { body: make.page.app("99999999-home-redirect.html"), url: STORE },
    ],
  ];

  detectorContract("app page", () => createAppPageDetector(fake.http(fixtureRoutes)));

  it("fetches /app/<id>/?l=english once per distinct ID, one at a time", async () => {
    const { http, detector: d } = detector(fixtureRoutes);
    const verdicts = await d.detect([aiWithService, noBlock, invalid, aiWithService]);
    expect(http.calls).toStrictEqual([APP(aiWithService), APP(noBlock), APP(invalid)]);
    expect(http.maxInFlight).toBe(1);
    expect([...verdicts.values()].map((verdicts) => verdicts.ai.state)).toStrictEqual([
      "disclosed",
      "not-disclosed",
      "unknown",
    ]);
  });

  it("answers the open page from its document and requests the others", async () => {
    const http = fake.http(fixtureRoutes);
    const open = { id: aiWithService, verdicts: make.verdicts.uniform("error") };
    const found = await createAppPageDetector(http, open).detect([aiWithService, noBlock]);
    expect(found.get(aiWithService)).toBe(open.verdicts);
    expect(found.get(noBlock)?.ai.state).toBe("not-disclosed");
    expect(http.calls).toStrictEqual([APP(noBlock)]);
  });

  it("answers the AI kind only: the other kinds stay unknown", async () => {
    const { detector: d } = detector(fixtureRoutes);
    const found = await d.detect([aiWithService, noBlock, invalid]);
    expect(found.get(aiWithService)?.ai.state).toBe("disclosed");
    for (const kind of KINDS.filter(({ id }) => id !== "ai")) {
      expect(found.get(aiWithService)?.[kind.id]).toBe(make.verdict.unknown("missing"));
      expect(found.get(noBlock)?.[kind.id]).toBe(make.verdict.unknown("missing"));
    }
    expect(found.get(invalid)).toStrictEqual(make.verdicts.uniform("gated"));
  });

  it("reads the page only for the kinds that declare it", () => {
    const readers = KINDS.filter((kind) => kind.fromAppPage !== undefined);
    expect(readers.map((kind) => kind.id)).toStrictEqual(["ai"]);
  });

  it.each<readonly [string, Reply, Verdict]>([
    ["a network error", "network-error", make.verdict.unknown("error")],
    ["a 429", { status: 429 }, make.verdict.unknown("rate-limited")],
    ["a 500", { status: 500 }, make.verdict.unknown("error")],
    ["a 404", { status: 404 }, make.verdict.unknown("error")],
  ])("maps %s to unknown, never to not disclosed", async (_name, reply, expected) => {
    const { detector: d } = detector([["https://", reply]]);
    expect((await d.detect([aiWithService])).get(aiWithService)?.ai).toBe(expected);
  });
});
