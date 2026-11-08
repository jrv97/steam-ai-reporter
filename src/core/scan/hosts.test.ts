// @vitest-environment-options {"url":"https://store.steampowered.com/search/?term=roguelike"}
import { afterEach, describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { setBody, the } from "../../../tests/helpers/surfaces";
import { createHostFinder } from "./hosts";

afterEach(() => {
  document.body.replaceChildren();
});

const APP = make.appId();
const ITEM = `data-ds-appid="${String(APP)}"`;
const LINK = `href="/app/${String(APP)}/"`;

describe("createHostFinder", () => {
  it.each([
    [
      "is a data-ds-appid element's own host",
      `<main><div class="item" ${ITEM}><img></div></main>`,
      "[data-ds-appid]",
      ".item",
    ],
    [
      "climbs from a link to the lowest image ancestor and joins siblings, 3 levels at most",
      `<main><div class="l4"><div class="l3"><div class="l2"><div class="l1">`
      + `<a ${LINK}><img></a></div><a ${LINK}>Title</a></div></div></div></main>`,
      "a",
      ".l3",
    ],
    [
      "stops at the first data-ds-appid element: the item is the largest host",
      `<main><div class="column"><div class="list"><div class="item" ${ITEM}>`
      + `<div class="cap"><img></div><a ${LINK}><img></a></div></div></div></main>`,
      "a",
      ".item",
    ],
    [
      "does not climb from a host that is a data-ds-appid element",
      `<main><div class="column"><div class="item" ${ITEM}><img><a ${LINK}></a></div></div></main>`,
      "a",
      ".item",
    ],
    [
      "still climbs past elements that only link, where nothing marks an item",
      `<main><div class="column"><div class="list"><div class="item">`
      + `<a ${LINK}><img></a></div></div></div></main>`,
      "a",
      ".column",
    ],
  ])("%s", (_name, markup, from, host) => {
    setBody(markup);
    expect(createHostFinder(document).hostOf(the(from), APP)).toBe(the(host));
  });
});
