import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { nextTask } from "../../../tests/helpers/tasks";
import { STORE_TAB_MESSAGE } from "./store-tab";
import { type IconPaths, serveStoreTabs, STORE_TAB_ICON } from "./store-tab-icon";

interface IconCall {
  readonly tabId: number;
  readonly paths: IconPaths;
}
type Row = readonly [string, unknown, number | undefined, readonly IconCall[]];

describe("serveStoreTabs", () => {
  const TAB = make.tabId();

  it.each<Row>([
    ["sets the normal icon on the tab a store page names", STORE_TAB_MESSAGE, TAB, [{
      tabId: TAB,
      paths: STORE_TAB_ICON,
    }]],
    ["ignores the message from no tab", STORE_TAB_MESSAGE, undefined, []],
    ...make.raw.junk().map((junk, index): Row => [
      `ignores junk value ${String(index)}`,
      junk,
      TAB,
      [],
    ]),
  ])("%s", (_name, message, tabId, expected) => {
    const messages = fake.tabMessages();
    const icon = fake.tabIcon();
    serveStoreTabs(messages.onMessage, icon.set);
    messages.deliver(message, tabId);
    expect(icon.calls).toStrictEqual(expected);
  });

  it("lets the icon of a tab that closed fail quietly", async () => {
    const messages = fake.tabMessages();
    const icon = fake.tabIcon({ fails: true });
    serveStoreTabs(messages.onMessage, icon.set);
    messages.deliver(STORE_TAB_MESSAGE, TAB);
    await nextTask();
    expect(icon.calls).toHaveLength(1);
  });
});
