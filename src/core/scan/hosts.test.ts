// @vitest-environment-options {"url":"https://store.steampowered.com/search/?term=roguelike"}
import { afterEach, describe, expect, it } from "vitest";
import { appId } from "../../../tests/helpers/app-ids";
import { setBody, the } from "../../../tests/helpers/surfaces";
import { createHostFinder } from "./hosts";

afterEach(() => {
  document.body.replaceChildren();
});

const APP = appId(10);

describe("createHostFinder", () => {
  it("is a data-ds-appid element's own host", () => {
    setBody(`<main><div data-ds-appid="10"><img></div></main>`);
    expect(createHostFinder(document).hostOf(the("[data-ds-appid]"), APP)).toBe(
      the("[data-ds-appid]"),
    );
  });

  it("climbs from a link to the lowest image ancestor and joins siblings, 3 levels at most", () => {
    setBody(
      `<main><div class="l4"><div class="l3"><div class="l2"><div class="l1">`
        + `<a href="/app/10/"><img></a></div><a href="/app/10/">Title</a></div></div></div></main>`,
    );
    expect(createHostFinder(document).hostOf(the("a"), APP)).toBe(the(".l3"));
  });

  it("stops at the first data-ds-appid element: the item is the largest host", () => {
    setBody(
      `<main><div class="column"><div class="list"><div class="item" data-ds-appid="10">`
        + `<div class="cap"><img></div><a href="/app/10/"><img></a></div></div></div></main>`,
    );
    expect(createHostFinder(document).hostOf(the("a"), APP)).toBe(the(".item"));
  });

  it("does not climb from a host that is a data-ds-appid element", () => {
    setBody(
      `<main><div class="column"><div class="item" data-ds-appid="10"><img>`
        + `<a href="/app/10/"></a></div></div></main>`,
    );
    expect(createHostFinder(document).hostOf(the("a"), APP)).toBe(the(".item"));
  });

  it("still climbs past elements that only link, where nothing marks an item", () => {
    setBody(
      `<main><div class="column"><div class="list"><div class="item">`
        + `<a href="/app/10/"><img></a></div></div></div></main>`,
    );
    expect(createHostFinder(document).hostOf(the("a"), APP)).toBe(the(".column"));
  });
});
