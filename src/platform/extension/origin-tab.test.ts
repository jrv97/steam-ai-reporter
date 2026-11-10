import { describe, expect, it, vi } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { APP_PAGE_ORIGIN } from "../../core/detect/app-page";
import type { JsonValue } from "../../core/json";
import { ORIGIN_KEY } from "../../core/storage-keys";
import type { BrowserTabs } from "./browser-tabs";
import { createGoBack, recordOrigin } from "./origin-tab";

/** What each tab call answers: tab and window IDs, or `undefined` for none. */
type TabAnswers = Parameters<typeof fake.tabs>[0];
type TabCall = keyof BrowserTabs;

const HOME = `${APP_PAGE_ORIGIN}/`;
const TABS = make.tabs();
const FOCUSED = "focusedTabId";
/** Counting the window's tabs, then closing the settings tab: the way out without an origin. */
const COUNTED = "windowTabCount";
const CLOSED = [COUNTED, `close ${String(TABS.own)}`];
const SWITCHED = [
  "ownTabId",
  FOCUSED,
  `activate ${String(TABS.origin)}`,
  `focusWindow ${String(TABS.window)}`,
  `close ${String(TABS.own)}`,
];

/** A focus event on the settings page's window. */
const focus = () => new Event("focus");

/** A settings page over a session store that holds `stored`, if given, when it loads. */
async function page(
  stored?: JsonValue,
  answers: Partial<TabAnswers> = {},
  fails: readonly TabCall[] = [],
) {
  const session = fake.store(new Map(stored === undefined ? [] : [[ORIGIN_KEY, stored]]));
  const changes = fake.changes();
  const tabs = fake.tabs({ ...TABS, ...answers }, fails);
  const visited: string[] = [];
  const location = {
    assign: (url: string) => {
      visited.push(url);
    },
  };
  const view = Object.assign(new EventTarget(), { location });
  const goBack = createGoBack({ tabs, session, onChanged: changes.subscribe, window: view });
  await vi.waitFor(() => {
    expect(changes.size()).toBe(1);
  });
  return { goBack, tabs, visited, changes, session, view };
}

/** The origin the session store holds, if any. */
async function stored(view: Awaited<ReturnType<typeof page>>): Promise<unknown> {
  return (await view.session.get([ORIGIN_KEY])).get(ORIGIN_KEY);
}

/** Writes `value` as the popup does and reports it to the page. */
async function write(view: Awaited<ReturnType<typeof page>>, value: number): Promise<void> {
  await view.session.set(new Map([[ORIGIN_KEY, value]]));
  view.changes.fire({ [ORIGIN_KEY]: { newValue: value } });
}

/** Waits until the tab calls and the visited URLs match, then expects the origin key gone. */
async function expectWayBack(
  view: Awaited<ReturnType<typeof page>>,
  calls: readonly string[],
  visited: readonly string[],
): Promise<void> {
  await vi.waitFor(() => {
    expect([view.tabs.calls, view.visited]).toStrictEqual([calls, visited]);
  });
  expect(await stored(view)).toBeUndefined();
}

describe("recordOrigin", () => {
  it.each<[string, Partial<TabAnswers>, readonly TabCall[], number | undefined]>([
    ["the active tab", {}, [], TABS.origin],
    ["nothing without an ID", { origin: undefined }, [], undefined],
    ["nothing for TAB_ID_NONE", { origin: -1 }, [], undefined],
    ["nothing when the query fails", {}, ["activeTabId"], undefined],
  ])("writes %s", async (_name, answers, fails, expected) => {
    const session = fake.store();
    await recordOrigin(fake.tabs({ ...TABS, ...answers }, fails), session);
    expect((await session.get([ORIGIN_KEY])).get(ORIGIN_KEY)).toBe(expected);
  });

  it("does not reject when the write fails", async () => {
    const session = fake.countingStore(fake.store());
    session.break();
    await expect(recordOrigin(fake.tabs(TABS), session)).resolves.toBeUndefined();
    expect(session.calls.set).toBe(1);
  });
});

describe("createGoBack", () => {
  it.each<
    [string, JsonValue | undefined, Partial<TabAnswers>, readonly TabCall[], string[], string[]]
  >([
    ["switches to the origin and closes itself", TABS.origin, {}, [], SWITCHED, []],
    ["closes itself without an origin", undefined, {}, [], ["ownTabId", ...CLOSED], []],
    [
      "closes itself when the origin is gone",
      TABS.origin,
      {},
      ["activate"],
      [...SWITCHED.slice(0, 3), ...CLOSED],
      [],
    ],
    [
      "closes itself when the browser returns no tab",
      TABS.origin,
      { window: undefined },
      [],
      [...SWITCHED.slice(0, 3), ...CLOSED],
      [],
    ],
    [
      "opens the store home without an origin in the window's only tab",
      undefined,
      { count: 1 },
      [],
      ["ownTabId", COUNTED],
      [HOME],
    ],
    [
      "opens the store home when it cannot count the window's tabs",
      undefined,
      {},
      ["windowTabCount"],
      ["ownTabId", COUNTED],
      [HOME],
    ],
    [
      "opens the store home when it cannot close itself",
      undefined,
      {},
      ["close"],
      ["ownTabId", ...CLOSED],
      [HOME],
    ],
    [
      "opens the store home when it cannot read its own tab",
      undefined,
      {},
      ["ownTabId"],
      ["ownTabId"],
      [HOME],
    ],
    ["still closes itself when focus fails", TABS.origin, {}, ["focusWindow"], SWITCHED, []],
    ["stays on the origin when the close fails", TABS.origin, {}, ["close"], SWITCHED, []],
    [
      "switches but cannot close itself when it cannot read its tabs",
      TABS.origin,
      {},
      ["ownTabId", "focusedTabId"],
      SWITCHED.slice(0, -1),
      [],
    ],
    [
      "drops an origin equal to its own tab",
      TABS.own,
      {},
      [],
      [...SWITCHED.slice(0, 2), ...CLOSED],
      [],
    ],
  ])("%s", async (_name, stored, answers, fails, calls, visited) => {
    const view = await page(stored, answers, fails);
    view.goBack();
    await expectWayBack(view, calls, visited);
  });

  it.each(make.raw.badTabIds())("drops a stored %j and closes itself", async (stored) => {
    const view = await page(stored);
    view.goBack();
    await expectWayBack(view, [...SWITCHED.slice(0, 2), ...CLOSED], []);
  });

  it("takes an origin written after load and keeps it over removals and its own tab", async () => {
    const view = await page();
    await write(view, TABS.origin);
    await vi.waitFor(async () => {
      expect(await stored(view)).toBeUndefined();
    });
    view.changes.fire({ [ORIGIN_KEY]: {} });
    await write(view, TABS.own);
    view.goBack();
    await expectWayBack(view, [...SWITCHED.slice(0, 2), ...SWITCHED.slice(1)], []);
  });

  it("keeps its origin and leaves a newer one while another tab is in front", async () => {
    const view = await page(TABS.origin);
    const { origin: newer } = make.tabs();
    view.tabs.toFront(newer);
    await write(view, newer);
    view.view.dispatchEvent(focus());
    view.goBack();
    await vi.waitFor(() => {
      expect([view.tabs.calls, view.visited]).toStrictEqual([
        [...SWITCHED.slice(0, 2), FOCUSED, FOCUSED, ...SWITCHED.slice(2)],
        [],
      ]);
    });
    expect(await stored(view)).toBe(newer);
  });

  it("takes an origin left for it once its window gains focus with its tab in front", async () => {
    const view = await page();
    view.tabs.toFront(TABS.origin);
    await write(view, TABS.origin);
    await vi.waitFor(() => {
      expect(view.tabs.calls).toContain(FOCUSED);
    });
    view.tabs.toFront(TABS.own);
    view.view.dispatchEvent(focus());
    view.goBack();
    await expectWayBack(view, [...SWITCHED.slice(0, 2), ...SWITCHED.slice(1)], []);
  });

  it("runs one click at a time", async () => {
    const view = await page(TABS.origin);
    view.goBack();
    view.goBack();
    await expectWayBack(view, SWITCHED, []);
  });
});
