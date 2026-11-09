import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearRoot } from "../../../tests/helpers/dom";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { hostView } from "../../../tests/helpers/host-view";
import { englishI18n } from "../../../tests/helpers/i18n";
import { applyFilters } from "../../../tests/helpers/settings";
import { loadPage, nodes, pageTransition, the } from "../../../tests/helpers/surfaces";
import type { KindId } from "../kinds/id";
import type { ListFilter } from "../kinds/kind-settings";
import { HOST_KINDS } from "../scan/marks";
import { createHiddenNotice, type HiddenNotice, REVEAL_ATTRIBUTE } from "./hidden-notice";
import { createHostKindsRenderer } from "./list-filter";

const i18n = englishI18n();
const LIST = "#search_resultsRows";
const STORE_BAR = "#search_results_filtered_warning_persistent";
const BUTTON = ".tks-list-notice-button";
const renderer = createHostKindsRenderer();

let notice: HiddenNotice | undefined;
let frames = fake.queue();
let delays = fake.queue();

/** Marks a host as the list filter's renderer does. */
function mark(host: Element, kinds: readonly KindId[], hideable = true): void {
  renderer.render(hostView(host, { verdicts: make.verdicts.only(kinds), hideable }));
}

const rows = () => [...document.querySelectorAll(`${LIST} a.search_result_row`)];
const rowAt = (index: number): Element => {
  const row = rows()[index];
  if (row === undefined) {
    throw new TypeError(String(index));
  }
  return row;
};
const box = () => document.querySelector(".tks-list-notice");
const shown = () => {
  const element = box();
  return element !== null && !element.hasAttribute("hidden");
};
const line = () => box()?.querySelector(".tks-list-notice-text")?.textContent;
const button = () => {
  const found = document.querySelector<HTMLButtonElement>(BUTTON);
  if (found === null) {
    throw new TypeError(BUTTON);
  }
  return found;
};
const revealed = () => document.documentElement.hasAttribute(REVEAL_ATTRIBUTE);

/** Lets the observer deliver, then runs the frame it asked for. */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => {
    queueMicrotask(resolve);
  });
  frames.run();
}

function start(): void {
  notice = createHiddenNotice({ document, i18n, frame: frames.frame, delay: delays.delay });
  notice.start();
  frames.run();
}

/** The search page with AI on Hide and the first `count` rows carrying AI. */
function hidingRows(count: number): void {
  applyFilters({ ai: "hide" });
  for (const row of rows().slice(0, count)) {
    mark(row, ["ai"]);
  }
  start();
}

/** Appends a row carrying AI to the list, as infinite scroll does. */
function addHiddenRow(): void {
  const row = make.page.searchRow(make.appId());
  the(LIST).append(row);
  mark(row, ["ai"]);
}

beforeEach(() => {
  loadPage(make.page.surface("search"));
  frames = fake.queue();
  delays = fake.queue();
});

afterEach(() => {
  notice?.stop();
  notice = undefined;
  clearRoot();
});

interface CountCase {
  readonly name: string;
  readonly filters: Partial<Record<KindId, ListFilter>>;
  readonly marks: readonly (readonly [kinds: readonly KindId[], hideable: boolean])[];
  readonly expected: number;
}

const COUNTS: readonly CountCase[] = [
  { name: "one hidden row", filters: { ai: "hide" }, marks: [[["ai"], true]], expected: 1 },
  {
    name: "three hidden rows",
    filters: { ai: "hide" },
    marks: [[["ai"], true], [["ai"], true], [["ai"], true]],
    expected: 3,
  },
  {
    name: "a row that cannot hide, which dims",
    filters: { ai: "hide" },
    marks: [[["ai"], false], [["ai"], true]],
    expected: 1,
  },
  {
    name: "a row whose kind only dims",
    filters: { ai: "hide", drm: "dim" },
    marks: [[["drm"], true], [["ai"], true]],
    expected: 1,
  },
  {
    name: "a row with two hiding kinds, counted once",
    filters: { ai: "hide", drm: "hide" },
    marks: [[["ai", "drm"], true]],
    expected: 1,
  },
];

describe("createHiddenNotice", () => {
  it.each(COUNTS.map((each) => [each.name, each] as const))(
    "counts the results the filter hides: %s",
    (_name, { filters, marks, expected }) => {
      applyFilters(filters);
      marks.forEach(([kinds, hideable], index) => {
        mark(rowAt(index), kinds, hideable);
      });
      start();
      expect(shown()).toBe(true);
      expect(line()).toBe(i18n.plural("notice_list_hidden", expected));
      expect(button().textContent).toBe(i18n.plural("notice_list_show", expected));
    },
  );

  it("shows no notice while no kind is on Hide", () => {
    applyFilters({ ai: "dim" });
    mark(rowAt(0), ["ai"]);
    start();
    expect(shown()).toBe(false);
  });

  it("counts no host outside the list", () => {
    const outside = make.page.searchRow(make.appId());
    document.body.append(outside);
    mark(outside, ["ai"]);
    hidingRows(2);
    expect(line()).toBe(i18n.plural("notice_list_hidden", 2));
  });

  const PLACES = [
    {
      name: "right before the list",
      page: () => undefined,
      slot: () => the(LIST).previousElementSibling,
    },
    {
      name: "right after the store's own notice bar when the page has one",
      // Another element between the store's bar and the rows tells the two places apart
      page: () => {
        the(LIST).before(...nodes(`<div id="${STORE_BAR.slice(1)}"></div><div></div>`));
      },
      slot: () => the(STORE_BAR).nextElementSibling,
    },
  ];

  it.each(PLACES.map((each) => [each.name, each] as const))("sits %s", (_name, { page, slot }) => {
    page();
    hidingRows(1);
    expect(slot()).toBe(box());
  });

  const CHANGES = [
    {
      name: "infinite scroll adds a hidden row",
      change: addHiddenRow,
      expected: 3,
    },
    {
      name: "the game of a row is ignored",
      change: () => {
        rowAt(0).removeAttribute(HOST_KINDS);
      },
      expected: 1,
    },
    {
      name: "a hidden row leaves the page",
      change: () => {
        rowAt(0).remove();
      },
      expected: 1,
    },
  ];

  it.each(CHANGES.map((each) => [each.name, each] as const))(
    "follows the list when %s",
    async (_name, { change, expected }) => {
      hidingRows(2);
      change();
      await settle();
      expect(shown()).toBe(true);
      expect(line()).toBe(i18n.plural("notice_list_hidden", expected));
    },
  );

  it("shows the hidden results on this page with one click and hides them with the next", () => {
    hidingRows(2);
    button().click();
    expect(revealed()).toBe(true);
    expect(line()).toBe(i18n.plural("notice_list_revealed", 2));
    expect(button().textContent).toBe(i18n.plural("notice_list_hide", 2));
    button().click();
    expect(revealed()).toBe(false);
    expect(line()).toBe(i18n.plural("notice_list_hidden", 2));
  });

  it("hides the notice and ends the reveal once nothing is left to hide", async () => {
    hidingRows(1);
    button().click();
    applyFilters({});
    await settle();
    expect([shown(), revealed()]).toEqual([false, false]);
    applyFilters({ ai: "hide" });
    await settle();
    expect(line()).toBe(i18n.plural("notice_list_hidden", 1));
  });

  it("ends the reveal when the store replaces the list", async () => {
    hidingRows(1);
    button().click();
    const list = document.createElement("div");
    list.id = LIST.slice(1);
    const row = make.page.searchRow(make.appId());
    list.append(row);
    mark(row, ["ai"]);
    the(LIST).replaceWith(list);
    await settle();
    expect(revealed()).toBe(false);
    expect(list.previousElementSibling).toBe(box());
    expect(line()).toBe(i18n.plural("notice_list_hidden", 1));
  });

  it("announces the line once it stops changing", async () => {
    hidingRows(1);
    addHiddenRow();
    await settle();
    expect(delays.size).toBe(1);
    delays.run();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(box()?.querySelector("[aria-live='polite']")?.textContent).toBe(
      i18n.plural("notice_list_hidden", 2),
    );
  });

  it("stops on pagehide, ending the reveal, and resumes on a bfcache pageshow", async () => {
    hidingRows(1);
    button().click();
    window.dispatchEvent(pageTransition("pagehide"));
    expect([revealed(), shown()]).toEqual([false, false]);
    addHiddenRow();
    await settle();
    expect(shown()).toBe(false);
    window.dispatchEvent(pageTransition("pageshow"));
    frames.run();
    expect(line()).toBe(i18n.plural("notice_list_hidden", 2));
  });

  it("draws nothing on a page without a list surface", () => {
    loadPage(make.page.surface("home"));
    applyFilters({ ai: "hide" });
    const host = make.page.searchRow(make.appId());
    document.body.append(host);
    mark(host, ["ai"]);
    start();
    expect(box()).toBeNull();
  });

  it("removes the notice and ends the reveal when stopped", () => {
    hidingRows(1);
    button().click();
    notice?.stop();
    expect([box(), revealed()]).toEqual([null, false]);
  });
});
