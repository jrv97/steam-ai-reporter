import { beforeEach, describe, expect, it } from "vitest";
import { setBody } from "../../../tests/helpers/dom";
import { englishI18n } from "../../../tests/helpers/i18n";
import { disclosedVerdict, NOT_DISCLOSED } from "../../../tests/helpers/verdicts";
import { type DisclosedVerdict, UNKNOWN } from "../types";
import { applyBadgeSetting, compactSize, createBadgeRenderer } from "./badge";
import type { BadgeSlot, HostView } from "./host";

function capsule(): {
  host: HTMLElement;
  link: HTMLAnchorElement;
  image: HTMLElement;
  title: HTMLElement;
} {
  setBody(`
    <div class="row"><a class="link" href="/app/10/"><div class="image"></div>
    <span class="title">Game</span></a></div>`);
  const host = document.querySelector<HTMLElement>(".row");
  const link = document.querySelector<HTMLAnchorElement>(".link");
  const image = document.querySelector<HTMLElement>(".image");
  const title = document.querySelector<HTMLElement>(".title");
  if (host === null || link === null || image === null || title === null) {
    throw new TypeError();
  }
  return { host, link, image, title };
}

function view(host: Element, slot: BadgeSlot | undefined, overrides: Partial<HostView> = {}) {
  return { host, verdict: disclosedVerdict(), allowed: false, slot, hideable: true, ...overrides };
}

describe("compactSize", () => {
  it("gives small images no badge", () => {
    expect(compactSize(179, 70)).toBeUndefined();
    expect(compactSize(300, 31)).toBeUndefined();
  });

  it("uses the text tier from 180px and the large tier from 400 by 150", () => {
    expect(compactSize(180, 32)).toBe("text");
    expect(compactSize(399, 400)).toBe("text");
    expect(compactSize(400, 149)).toBe("text");
    expect(compactSize(400, 150)).toBe("large");
  });
});

describe("createBadgeRenderer", () => {
  const i18n = englishI18n();
  let bound = new Map<Element, DisclosedVerdict>();
  let renderer = createBadgeRenderer(document, i18n, { bind: (t, v) => bound.set(t, v) });

  beforeEach(() => {
    bound = new Map();
    renderer = createBadgeRenderer(document, i18n, { bind: (t, v) => bound.set(t, v) });
  });

  it("draws the full badge with the catalog label and binds it to the hover card", () => {
    const { host, title } = capsule();
    const verdict = disclosedVerdict({ notes: "Concept art." });
    renderer.render(view(host, { kind: "full", anchor: title, position: "afterend" }, { verdict }));
    const badge = host.querySelector<HTMLElement>(".sar-badge");
    expect(badge?.previousElementSibling).toBe(title);
    expect(badge?.textContent).toBe("AI use reported");
    expect(badge?.querySelector("svg")).toBeNull();
    expect(badge?.hasAttribute("title")).toBe(false);
    expect(badge === null ? undefined : bound.get(badge)).toBe(verdict);
  });

  it("binds a kept badge to a new verdict without drawing it again", () => {
    const { host, title } = capsule();
    const slot: BadgeSlot = { kind: "full", anchor: title, position: "afterend" };
    renderer.render(view(host, slot));
    const badge = host.querySelector(".sar-badge");
    const next = disclosedVerdict({ notes: "Voice lines." });
    renderer.render(view(host, slot, { verdict: next }));
    expect(host.querySelector(".sar-badge")).toBe(badge);
    expect(badge === null ? undefined : bound.get(badge)).toBe(next);
  });

  it("draws the compact badge in its tier, linked to the capsule link", () => {
    const { host, image } = capsule();
    renderer.render(
      view(host, { kind: "compact", anchor: image, position: "beforeend", size: "large" }),
    );
    const badge = image.querySelector<HTMLElement>(".sar-compact");
    expect(badge?.getAttribute("data-sar-size")).toBe("large");
    expect(badge?.textContent).toBe("AI use reported");
    expect(badge?.getAttribute("data-sar-in-link")).toBe("true");
    expect(badge?.hasAttribute("title")).toBe(false);
    expect(badge !== null && bound.has(badge)).toBe(true);
  });

  it("gives a compact badge outside a link no pointer", () => {
    setBody('<div class="row"><div class="image"></div></div>');
    const host = document.querySelector(".row");
    const image = document.querySelector(".image");
    if (host === null || image === null) {
      throw new TypeError();
    }
    renderer.render(
      view(host, { kind: "compact", anchor: image, position: "beforeend", size: "text" }),
    );
    const badge = image.querySelector<HTMLElement>(".sar-compact");
    expect(badge?.hasAttribute("data-sar-in-link")).toBe(false);
  });

  it.each([
    ["not disclosed", NOT_DISCLOSED],
    ["unknown", UNKNOWN.error],
  ])("renders nothing for %s", (_name, verdict) => {
    const { host, title } = capsule();
    const before = host.innerHTML;
    renderer.render(view(host, { kind: "full", anchor: title, position: "afterend" }, { verdict }));
    expect(host.innerHTML).toBe(before);
  });

  it("renders nothing for an allow-listed game, and removes a badge it drew", () => {
    const { host, title } = capsule();
    const slot: BadgeSlot = { kind: "full", anchor: title, position: "afterend" };
    renderer.render(view(host, slot));
    expect(host.querySelectorAll(".sar-badge")).toHaveLength(1);
    renderer.render(view(host, slot, { allowed: true }));
    expect(host.querySelector(".sar-badge")).toBeNull();
  });

  it("keeps the badge for the same view and restores one a re-render dropped", () => {
    const { host, title } = capsule();
    const slot: BadgeSlot = { kind: "full", anchor: title, position: "afterend" };
    renderer.render(view(host, slot));
    const first = host.querySelector(".sar-badge");
    renderer.render(view(host, slot));
    expect(host.querySelector(".sar-badge")).toBe(first);
    first?.remove();
    renderer.render(view(host, slot));
    expect(host.querySelectorAll(".sar-badge")).toHaveLength(1);
    expect(host.querySelector(".sar-badge")).not.toBe(first);
  });

  it("draws no badge where the placement gives no slot", () => {
    const { host } = capsule();
    renderer.render(view(host, undefined));
    expect(host.querySelector(".sar-badge, .sar-compact")).toBeNull();
  });
});

describe("applyBadgeSetting", () => {
  it("writes one root attribute", () => {
    applyBadgeSetting(document.documentElement, false);
    expect(document.documentElement.getAttribute("data-sar-badges")).toBe("off");
    applyBadgeSetting(document.documentElement, true);
    expect(document.documentElement.getAttribute("data-sar-badges")).toBe("on");
  });
});
