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
const SWITCHED = [
  "ownTabId",
  `activate ${String(TABS.origin)}`,
  `focusWindow ${String(TABS.window)}`,
  `close ${String(TABS.own)}`,
];

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
  const goBack = createGoBack({
    tabs,
    session,
    onChanged: changes.subscribe,
    navigate: (url) => {
      visited.push(url);
    },
  });
  await vi.waitFor(() => {
    expect(changes.size()).toBe(1);
  });
  return { goBack, tabs, visited, changes, session };
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
  expect((await view.session.get([ORIGIN_KEY])).size).toBe(0);
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
    ["opens the store home without an origin", undefined, {}, [], ["ownTabId"], [HOME]],
    [
      "opens the store home when the origin is gone",
      TABS.origin,
      {},
      ["activate"],
      SWITCHED.slice(0, 2),
      [HOME],
    ],
    [
      "opens the store home when the browser returns no tab",
      TABS.origin,
      { window: undefined },
      [],
      SWITCHED.slice(0, 2),
      [HOME],
    ],
    ["still closes itself when focus fails", TABS.origin, {}, ["focusWindow"], SWITCHED, []],
    ["stays on the origin when the close fails", TABS.origin, {}, ["close"], SWITCHED, []],
    [
      "switches but cannot close itself without its own ID",
      TABS.origin,
      {},
      ["ownTabId"],
      SWITCHED.slice(0, -1),
      [],
    ],
    ["drops an origin equal to its own tab", TABS.own, {}, [], ["ownTabId"], [HOME]],
  ])("%s", async (_name, stored, answers, fails, calls, visited) => {
    const view = await page(stored, answers, fails);
    view.goBack();
    await expectWayBack(view, calls, visited);
  });

  it.each(make.raw.badTabIds())("drops a stored %j and opens the store home", async (stored) => {
    const view = await page(stored);
    view.goBack();
    await expectWayBack(view, ["ownTabId"], [HOME]);
  });

  it("takes an origin written after load and keeps it over removals and its own tab", async () => {
    const view = await page();
    await view.session.set(new Map([[ORIGIN_KEY, TABS.origin]]));
    view.changes.fire({ [ORIGIN_KEY]: { newValue: TABS.origin } });
    view.changes.fire({ [ORIGIN_KEY]: {} });
    view.changes.fire({ [ORIGIN_KEY]: { newValue: TABS.own } });
    view.goBack();
    await expectWayBack(view, SWITCHED, []);
  });

  it("runs one click at a time", async () => {
    const view = await page(TABS.origin);
    view.goBack();
    view.goBack();
    await expectWayBack(view, SWITCHED, []);
  });
});
