import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import type { FakeTabPort } from "../../../tests/helpers/fake-progress";
import { fake } from "../../../tests/helpers/fakes";
import type { LoadProgress } from "../../core/progress";
import type { TabPort } from "./progress-port";
import { tabProgress } from "./tab-progress";

/** Lets a pending connection settle. */
function settled(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("tabProgress", () => {
  const SENT = make.progress();
  const PAUSED = make.progress({ pausedUntil: make.time() });
  const reach = (port: FakeTabPort) => Promise.resolve(port);

  it.each<
    readonly [
      string,
      (port: FakeTabPort) => Promise<TabPort | undefined>,
      (port: FakeTabPort) => void,
      readonly (LoadProgress | undefined)[],
    ]
  >([
    ["no active tab", () => Promise.resolve(undefined), () => undefined, [undefined]],
    ["a failed connection", () => Promise.reject(new Error()), () => undefined, [undefined]],
    ["a tab with no content script", reach, (port) => {
      port.drop();
    }, [undefined]],
    ["a store page, and ignores what is no progress", reach, (port) => {
      port.receive(SENT);
      port.receive({ total: make.text.token() });
    }, [SENT]],
  ])("hears %s", async (_name, connect, act, expected) => {
    const port = fake.tabPort();
    const heard: (LoadProgress | undefined)[] = [];
    tabProgress(() => connect(port)).subscribe((each) => heard.push(each));
    await settled();
    act(port);
    expect(heard).toStrictEqual(expected);
  });

  it.each<readonly [unknown, readonly LoadProgress[]]>([
    ...make.raw.junk().map((junk): [unknown, readonly LoadProgress[]] => [junk, []]),
    [make.progress({ answered: 0, unknown: 1 }), []],
    [make.progress({ total: 0 }), []],
    [make.progress({ total: -1, answered: -1 }), []],
    [make.progress({ answered: 0.5 }), []],
    [SENT, [SENT]],
    [PAUSED, [PAUSED]],
  ])("reads %j as %j", async (message, expected) => {
    const port = fake.tabPort();
    const heard: (LoadProgress | undefined)[] = [];
    tabProgress(() => reach(port)).subscribe((each) => heard.push(each));
    await settled();
    port.receive(message);
    expect(heard).toStrictEqual(expected);
  });

  it("closes the port when the strip stops listening", async () => {
    const port = fake.tabPort();
    const unsubscribe = tabProgress(() => Promise.resolve(port)).subscribe(() => undefined);
    await settled();
    unsubscribe();
    expect(port.closed).toBe(true);
  });
});
