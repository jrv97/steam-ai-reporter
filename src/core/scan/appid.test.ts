import { describe, expect, it } from "vitest";
import { appIdFromDataAttribute, appIdFromHref } from "./appid";

const STORE = "https://store.steampowered.com/search/?term=roguelike";
const COMMUNITY = "https://steamcommunity.com/id/someone/wishlist/";

describe("appIdFromDataAttribute", () => {
  it("reads a single numeric ID", () => {
    expect(appIdFromDataAttribute("5072580")).toBe(5072580);
    expect(appIdFromDataAttribute(" 413150 ")).toBe(413150);
  });

  it("skips comma lists, which belong to packages and bundles", () => {
    expect(appIdFromDataAttribute("1245620,2778580")).toBeUndefined();
  });

  it("skips values that are not app IDs", () => {
    for (const value of ["", "abc", "12abc", "-5", "1.5", "0", "4294967296"]) {
      expect(appIdFromDataAttribute(value)).toBeUndefined();
    }
  });
});

describe("appIdFromHref", () => {
  it("reads relative and absolute store links, with or without a trailing slash", () => {
    expect(appIdFromHref("/app/1808500", STORE)).toBe(1808500);
    expect(appIdFromHref("/app/1808500/", STORE)).toBe(1808500);
    expect(appIdFromHref("https://store.steampowered.com/app/1808500", STORE)).toBe(1808500);
    expect(appIdFromHref("https://store.steampowered.com/app/1808500/", COMMUNITY)).toBe(1808500);
    expect(appIdFromHref("//store.steampowered.com/app/1808500", STORE)).toBe(1808500);
  });

  it("allows a slug, a query and a hash after the ID", () => {
    expect(appIdFromHref("/app/1808500/ARC_Raiders/?snr=1_7_7_151_150_1", STORE)).toBe(1808500);
    expect(appIdFromHref("/app/1808500?curator_clanid=1", STORE)).toBe(1808500);
    expect(appIdFromHref("/app/1808500/#app_reviews_hash", STORE)).toBe(1808500);
    expect(appIdFromHref("/app/1808500#app_reviews_hash", STORE)).toBe(1808500);
  });

  it("ignores steamcommunity.com and other hosts", () => {
    expect(appIdFromHref("https://steamcommunity.com/app/1808500", STORE)).toBeUndefined();
    expect(appIdFromHref("/app/1808500", COMMUNITY)).toBeUndefined();
    expect(appIdFromHref("https://example.com/app/1808500", STORE)).toBeUndefined();
  });

  it("ignores store paths that are not an app page", () => {
    for (
      const href of [
        "/agecheck/app/1808500/",
        "/apps/1808500",
        "/app/",
        "/app/12abc",
        "/app/0",
        "/sub/12345/",
        "/bundle/232/",
        "javascript:void(0)",
        "",
      ]
    ) {
      expect(appIdFromHref(href, STORE)).toBeUndefined();
    }
  });
});
