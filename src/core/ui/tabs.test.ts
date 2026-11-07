import { afterEach, describe, expect, it, vi } from "vitest";
import { createTabs, TAB_ATTRIBUTE } from "./tabs";

const IDS = ["one", "two", "three", "four"] as const;
type Id = (typeof IDS)[number];

/** Tabs over the four ids, in the document, with `selected` shown. */
function mounted(selected: Id = "one", onActivate?: (id: Id) => void) {
  const tabs = createTabs({
    doc: document,
    ids: IDS,
    idPrefix: "t-",
    label: "label",
    ...(onActivate === undefined ? {} : { onActivate }),
  });
  tabs.select(selected);
  document.body.append(tabs.list, ...IDS.map((id) => tabs.panel(id)));
  return tabs;
}

function key(target: Element, name: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: name,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the tab list", () => {
  it("is a named tablist of tab buttons, each controlling its own labelled panel", () => {
    const tabs = mounted();
    expect(tabs.list.getAttribute("role")).toBe("tablist");
    expect(tabs.list.getAttribute("aria-label")).toBe("label");
    for (const id of IDS) {
      const tab = tabs.tab(id);
      const panel = tabs.panel(id);
      expect([tab.tagName, tab.type, tab.getAttribute("role")]).toEqual(
        ["BUTTON", "button", "tab"],
      );
      expect(tab.getAttribute("aria-controls")).toBe(panel.id);
      expect(panel.getAttribute("role")).toBe("tabpanel");
      expect(panel.getAttribute("aria-labelledby")).toBe(tab.id);
      expect(panel.hasAttribute("tabindex")).toBe(false);
    }
    expect(new Set(IDS.map((id) => tabs.tab(id).id)).size).toBe(IDS.length);
  });

  it("starts on the first tab", () => {
    const tabs = createTabs({ doc: document, ids: IDS, idPrefix: "s-", label: "label" });
    expect(tabs.selected()).toBe("one");
    expect(tabs.tab("one").getAttribute("aria-selected")).toBe("true");
  });

  it.each(IDS)("shows %s alone: one selected tab, one tab stop, one panel", (id) => {
    const tabs = mounted(id);
    for (const each of IDS) {
      const on = each === id;
      expect(tabs.tab(each).getAttribute("aria-selected")).toBe(String(on));
      expect(tabs.tab(each).tabIndex).toBe(on ? 0 : -1);
      expect(tabs.panel(each).hidden).toBe(!on);
    }
    expect(tabs.selected()).toBe(id);
  });

  it("says whether a selection changed anything", () => {
    const tabs = mounted("two");
    expect(tabs.select("two")).toBe(false);
    expect(tabs.select("three")).toBe(true);
  });

  it("names the tab of a tab's content and of a button that points at one", () => {
    const tabs = mounted();
    const label = document.createElement("span");
    tabs.tab("three").append(label);
    const jump = document.createElement("button");
    jump.setAttribute(TAB_ATTRIBUTE, "four");
    const elsewhere = document.createElement("button");
    tabs.panel("one").append(jump, elsewhere);
    expect(tabs.idOf(label)).toBe("three");
    expect(tabs.idOf(jump)).toBe("four");
    expect(tabs.idOf(elsewhere)).toBeUndefined();
  });
});

/** The tab stops and the focused tab after a key, as a person sees them. */
function stops(tabs: ReturnType<typeof mounted>) {
  return {
    focused: IDS.find((id) => tabs.tab(id) === document.activeElement),
    stop: IDS.filter((id) => tabs.tab(id).tabIndex === 0),
    selected: tabs.selected(),
  };
}

describe("the keys on a tab", () => {
  it.each(
    [
      ["ArrowRight", "one", "two"],
      ["ArrowDown", "two", "three"],
      ["ArrowLeft", "three", "two"],
      ["ArrowUp", "two", "one"],
      ["ArrowRight", "four", "one"],
      ["ArrowDown", "four", "one"],
      ["ArrowLeft", "one", "four"],
      ["ArrowUp", "one", "four"],
      ["Home", "three", "one"],
      ["End", "two", "four"],
    ] as const,
  )("%s from %s moves focus and the tab stop to %s, and selects nothing", (name, from, to) => {
    const onActivate = vi.fn();
    const tabs = mounted(from, onActivate);
    tabs.tab(from).focus();
    expect(key(tabs.tab(from), name).defaultPrevented).toBe(true);
    expect(stops(tabs)).toEqual({ focused: to, stop: [to], selected: from });
    expect(tabs.tab(to).getAttribute("aria-selected")).toBe("false");
    expect(onActivate).not.toHaveBeenCalled();
  });

  it.each([["Enter"], [" "]])("%j activates the focused tab, not the selected one", (name) => {
    const onActivate = vi.fn();
    const tabs = mounted("one", onActivate);
    tabs.tab("three").focus();
    expect(key(tabs.tab("three"), name).defaultPrevented).toBe(true);
    expect(onActivate.mock.calls).toEqual([["three"]]);
  });

  it("shows the activated tab when nothing else hears it; the tab stop follows", () => {
    const tabs = mounted();
    key(tabs.tab("one"), "ArrowRight");
    key(tabs.tab("two"), "Enter");
    expect(stops(tabs)).toEqual({ focused: "two", stop: ["two"], selected: "two" });
    expect(tabs.panel("two").hidden).toBe(false);
    tabs.tab("two").focus();
    key(tabs.tab("two"), "End");
    tabs.select("one");
    expect(stops(tabs).stop).toEqual(["one"]);
  });

  it.each([
    ["a key it does not use", "a", {}],
    ["an arrow with a modifier", "ArrowRight", { altKey: true }],
    ["an arrow with control", "ArrowRight", { ctrlKey: true }],
    ["an arrow with the meta key", "ArrowLeft", { metaKey: true }],
    ["Enter with control", "Enter", { ctrlKey: true }],
  ])("ignores %s", (_case, name, init) => {
    const onActivate = vi.fn();
    const tabs = mounted("one", onActivate);
    tabs.tab("one").focus();
    expect(key(tabs.tab("one"), name, init).defaultPrevented).toBe(false);
    expect(stops(tabs)).toEqual({ focused: "one", stop: ["one"], selected: "one" });
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("ignores keys outside its tabs, even on a button that points at one", () => {
    const onActivate = vi.fn();
    const tabs = mounted("one", onActivate);
    const jump = document.createElement("button");
    jump.setAttribute(TAB_ATTRIBUTE, "two");
    tabs.panel("one").append(jump);
    for (const name of ["ArrowRight", "Home", "Enter"]) {
      expect(key(jump, name).defaultPrevented).toBe(false);
      expect(key(tabs.panel("one"), name).defaultPrevented).toBe(false);
    }
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("hears no key after stop", () => {
    const onActivate = vi.fn();
    const tabs = mounted("one", onActivate);
    tabs.stop();
    tabs.tab("two").focus();
    for (const name of ["Enter", "ArrowRight", "End"]) {
      expect(key(tabs.tab("two"), name).defaultPrevented).toBe(false);
    }
    expect(stops(tabs)).toEqual({ focused: "two", stop: ["one"], selected: "one" });
    expect(onActivate).not.toHaveBeenCalled();
  });
});
