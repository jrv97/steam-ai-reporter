import { beforeEach, describe, expect, it } from "vitest";
import { DEV_ROWS, USER_TAGS } from "../../../tests/helpers/app-page";
import { setBody } from "../../../tests/helpers/dom";
import { disclosedList } from "../../../tests/helpers/fixture-verdicts";
import { englishI18n } from "../../../tests/helpers/i18n";
import { FULL_DISCLOSED } from "../../../tests/helpers/verdicts";
import type { AnyDisclosed } from "../kinds/verdicts";
import { createTagSection } from "./tag-section";

const i18n = englishI18n();
const { ai, kernel, drm } = FULL_DISCLOSED;
const all: readonly AnyDisclosed[] = disclosedList(FULL_DISCLOSED);

const WITH_TAGS = `<div class="glance_ctn_responsive_left">${DEV_ROWS}${USER_TAGS}</div>`;
const WITHOUT_TAGS = `<div class="glance_ctn_responsive_left">${DEV_ROWS}</div>`;

const sections = () => [...document.querySelectorAll(".sar-tag-section")];
const chips = () => [...document.querySelectorAll(".sar-tag-section .sar-badge")];
const kinds = () => chips().map((chip) => chip.getAttribute("data-sar-kind"));

function bindings() {
  const bound = new Map<Element, readonly AnyDisclosed[]>();
  const card = {
    bind: (trigger: Element, entries: readonly AnyDisclosed[]) => bound.set(trigger, entries),
  };
  return { bound, card };
}

describe("createTagSection", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("draws the label and one chip for every verdict, in order, with no overflow chip", () => {
    setBody(WITH_TAGS);
    createTagSection(document, i18n).render(all);
    expect(kinds()).toEqual(["ai", "kernel", "anticheat", "drm", "account", "eula", "pvp", "iap"]);
    expect(document.querySelectorAll(".sar-badge-label")).toHaveLength(8);
    expect(document.querySelector(".sar-tag-section-label")?.textContent).toBe(
      i18n.t("badge_tags_title"),
    );
    const root = sections()[0];
    expect(root?.getAttribute("role")).toBe("group");
    expect(root?.getAttribute("aria-labelledby")).toBe(
      document.querySelector(".sar-tag-section-label")?.id,
    );
    expect(root?.querySelector(".sar-chips")?.getAttribute("data-sar-chips")).toBe("full");
    expect(root?.textContent).not.toContain("+");
  });

  it("puts the chip text and the accessible name in the chip", () => {
    setBody(WITH_TAGS);
    createTagSection(document, i18n).render([kernel]);
    const chip = chips()[0];
    expect(chip?.querySelector(".sar-badge-label")?.textContent).toBe(i18n.t("kind_kernel_chip"));
    expect(chip?.querySelector(".sar-vh")?.textContent).toBe(
      i18n.t("kind_chip_name", {
        chip: i18n.t("kind_kernel_chip"),
        heading: i18n.t("kind_kernel_heading"),
      }),
    );
  });

  it("follows the store's user tags block", () => {
    setBody(WITH_TAGS);
    createTagSection(document, i18n).render([ai]);
    expect(document.getElementById("tags")?.nextElementSibling).toBe(sections()[0]);
    expect(document.getElementById("publisher")?.nextElementSibling?.id).toBe("tags");
  });

  it("falls back to the row after Publisher when the page has no user tags block", () => {
    setBody(WITHOUT_TAGS);
    createTagSection(document, i18n).render([ai]);
    expect(document.getElementById("publisher")?.nextElementSibling).toBe(sections()[0]);
  });

  it("prefers the user tags block when both anchors are there", () => {
    setBody(WITH_TAGS);
    createTagSection(document, i18n).render([ai]);
    expect(document.getElementById("publisher")?.nextElementSibling?.id).toBe("tags");
  });

  it("draws nothing on a page with neither anchor", () => {
    setBody('<div id="other"></div>');
    createTagSection(document, i18n).render(all);
    expect(sections()).toHaveLength(0);
    expect(document.body.innerHTML).toBe('<div id="other"></div>');
  });

  it("draws nothing, label included, for no verdicts, and removes what was there", () => {
    setBody(WITH_TAGS);
    const section = createTagSection(document, i18n);
    section.render([]);
    expect(sections()).toHaveLength(0);
    section.render([ai, drm]);
    expect(sections()).toHaveLength(1);
    section.render([]);
    expect(sections()).toHaveLength(0);
    expect(document.querySelector(".sar-tag-section-label")).toBeNull();
  });

  it("changes nothing for the same verdicts and never doubles the section", () => {
    setBody(WITH_TAGS);
    const section = createTagSection(document, i18n);
    section.render([ai, drm]);
    const first = sections()[0];
    const html = document.body.innerHTML;
    section.render([ai, drm]);
    expect(sections()[0]).toBe(first);
    expect(document.body.innerHTML).toBe(html);
  });

  it("draws again when the verdicts change, and when the store dropped the section", () => {
    setBody(WITH_TAGS);
    const section = createTagSection(document, i18n);
    section.render([ai]);
    section.render([ai, drm]);
    expect(kinds()).toEqual(["ai", "drm"]);
    section.render([drm]);
    expect(kinds()).toEqual(["drm"]);
    sections()[0]?.remove();
    section.render([drm]);
    expect(sections()).toHaveLength(1);
    expect(kinds()).toEqual(["drm"]);
  });

  it("moves the section to the user tags block when the block appears later", () => {
    setBody(WITHOUT_TAGS);
    const section = createTagSection(document, i18n);
    section.render([ai]);
    const first = sections()[0];
    document.getElementById("publisher")?.insertAdjacentHTML("afterend", USER_TAGS);
    section.render([ai]);
    expect(sections()[0]).toBe(first);
    expect(document.getElementById("tags")?.nextElementSibling).toBe(first);
    expect(sections()).toHaveLength(1);
  });

  it("binds the hover card to each chip with its own verdict, as on the game's own page", () => {
    setBody(WITH_TAGS);
    const { bound, card } = bindings();
    createTagSection(document, i18n, card).render([ai, kernel]);
    expect(chips().map((chip) => bound.get(chip))).toEqual([[ai], [kernel]]);
    expect(chips().every((chip) => chip instanceof HTMLElement && chip.tabIndex === 0)).toBe(true);
  });

  it("leaves the chips unfocusable when there is no card to open", () => {
    setBody(WITH_TAGS);
    createTagSection(document, i18n).render([ai]);
    expect(chips().every((chip) => !chip.hasAttribute("tabindex"))).toBe(true);
  });

  it("sets no listener and no link on the chips", () => {
    setBody(WITH_TAGS);
    createTagSection(document, i18n).render(all);
    expect(sections()[0]?.querySelector("a, [href], [onclick]")).toBeNull();
  });
});
