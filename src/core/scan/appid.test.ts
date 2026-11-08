import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { appIdFromDataAttribute, appIdFromHref } from "./appid";

const STORE = "https://store.steampowered.com/search/?term=roguelike";
const COMMUNITY = "https://steamcommunity.com/id/someone/wishlist/";
const ID = make.appId();

describe("appIdFromDataAttribute", () => {
  it.each([String(ID), ` ${String(ID)} `])("reads a single numeric ID from %j", (value) => {
    expect(appIdFromDataAttribute(value)).toBe(ID);
  });

  it.each([
    // Comma lists belong to packages and bundles.
    make.appIds(2).join(","),
    "",
    "abc",
    "12abc",
    "-5",
    "1.5",
    "0",
    "4294967296",
  ])("skips %j, which is not one app ID", (value) => {
    expect(appIdFromDataAttribute(value)).toBeUndefined();
  });
});

describe("appIdFromHref", () => {
  const path = `/app/${String(ID)}`;

  it.each([
    [path, STORE],
    [`${path}/`, STORE],
    [`https://store.steampowered.com${path}`, STORE],
    [`https://store.steampowered.com${path}/`, COMMUNITY],
    [`//store.steampowered.com${path}`, STORE],
    [`${path}/ARC_Raiders/?snr=1_7_7_151_150_1`, STORE],
    [`${path}?curator_clanid=1`, STORE],
    [`${path}/#app_reviews_hash`, STORE],
    [`${path}#app_reviews_hash`, STORE],
  ])("reads the app ID of %j on %s", (href, base) => {
    expect(appIdFromHref(href, base)).toBe(ID);
  });

  it.each([
    [`https://steamcommunity.com${path}`, STORE],
    [path, COMMUNITY],
    [`${make.text.url()}${path}`, STORE],
    [`/agecheck${path}/`, STORE],
    [`/apps/${String(ID)}`, STORE],
    ["/app/", STORE],
    ["/app/12abc", STORE],
    ["/app/0", STORE],
    [`/sub/${String(ID)}/`, STORE],
    [`/bundle/${String(ID)}/`, STORE],
    ["javascript:void(0)", STORE],
    ["", STORE],
  ])("ignores %j on %s, which is no store app page", (href, base) => {
    expect(appIdFromHref(href, base)).toBeUndefined();
  });
});
