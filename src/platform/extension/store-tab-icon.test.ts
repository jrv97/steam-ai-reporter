import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { STORE_TAB_MESSAGE } from "./store-tab";
import { serveStoreTabs } from "./store-tab-icon";

/** Lets a rejected icon call settle, so an unhandled rejection would fail the run. */
function settled(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("serveStoreTabs", () => {
  const TAB = make.tabId();

  it.each<readonly [string, unknown, number | undefined, readonly number[]]>([
    ["sets the normal icon on the tab a store page names", STORE_TAB_MESSAGE, TAB, [TAB]],
    ["ignores the message from no tab", STORE_TAB_MESSAGE, undefined, []],
    [
      "ignores a message with another field",
      {
        ...STORE_TAB_MESSAGE,
        [make.text.token()]: make.text.token(),
      },
      TAB,
      [],
    ],
    ...make.raw.junk().map((junk): readonly [string, unknown, number, readonly number[]] => [
      "ignores what is no store message",
      junk,
      TAB,
      [],
    ]),
  ])("%s", (_name, message, tabId, expected) => {
    const messages = fake.tabMessages();
    const icon = fake.storeIcon();
    serveStoreTabs(messages.onMessage, icon.show);
    messages.deliver(message, tabId);
    expect(icon.shown).toStrictEqual(expected);
  });

  it("lets the icon of a tab that closed fail quietly", async () => {
    const messages = fake.tabMessages();
    const icon = fake.storeIcon({ fails: true });
    serveStoreTabs(messages.onMessage, icon.show);
    messages.deliver(STORE_TAB_MESSAGE, TAB);
    await settled();
    expect(icon.shown).toStrictEqual([TAB]);
  });
});
