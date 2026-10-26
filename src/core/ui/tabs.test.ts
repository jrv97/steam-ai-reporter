import { afterEach, describe, expect, it } from "vitest";
import { createTabs, TAB_ATTRIBUTE } from "./tabs";

const IDS = ["one", "two", "three", "four"] as const;
type Id = (typeof IDS)[number];

/** Tabs over the four ids, in the document, with `selected` shown. */
function mounted(selected: Id = "one") {
  const tabs = createTabs({ doc: document, ids: IDS, idPrefix: "t-", label: "label" });
  tabs.select(selected);
  document.body.append(tabs.list, ...IDS.map((id) => tabs.panel(id)));
  return tabs;
}

function key(target: Element, name: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: name, bubbles: true, ...init });
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
  )("%s from %s moves to %s", (name, from, to) => {
    const tabs = mounted(from);
    expect(tabs.target(key(tabs.tab(from), name))).toBe(to);
  });

  it.each([
    ["a key it does not use", "Enter", {}],
    ["an arrow with a modifier", "ArrowRight", { altKey: true }],
    ["an arrow with control", "ArrowRight", { ctrlKey: true }],
    ["an arrow with the meta key", "ArrowLeft", { metaKey: true }],
  ])("ignores %s", (_case, name, init) => {
    const tabs = mounted();
    expect(tabs.target(key(tabs.tab("one"), name, init))).toBeUndefined();
  });

  it("ignores keys outside its tabs, even on a button that points at one", () => {
    const tabs = mounted();
    const jump = document.createElement("button");
    jump.setAttribute(TAB_ATTRIBUTE, "two");
    tabs.panel("one").append(jump);
    expect(tabs.target(key(jump, "ArrowRight"))).toBeUndefined();
    expect(tabs.target(key(tabs.panel("one"), "Home"))).toBeUndefined();
  });
});
