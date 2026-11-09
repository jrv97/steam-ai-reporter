import { beforeEach, describe, expect, it } from "vitest";
import { setBody } from "../../../tests/helpers/dom";
import { make } from "../../../tests/helpers/factory";
import { disclosedList } from "../../../tests/helpers/fixture-verdicts";
import { englishI18n } from "../../../tests/helpers/i18n";
import { KIND_IDS } from "../kinds/id";
import type { AnyDisclosed } from "../kinds/verdicts";
import { createTagSection } from "./tag-section";

const i18n = englishI18n();
const full = make.verdicts.full();
const { ai, kernel, drm } = full;
const all: readonly AnyDisclosed[] = disclosedList(full);

const WITH_TAGS =
  `<div class="glance_ctn_responsive_left">${make.page.devRows}${make.page.userTags}</div>`;
const WITHOUT_TAGS = `<div class="glance_ctn_responsive_left">${make.page.devRows}</div>`;

const sections = () => [...document.querySelectorAll(".tks-tag-section")];
const chips = () => [...document.querySelectorAll(".tks-tag-section .tks-badge")];
const kinds = () => chips().map((chip) => chip.getAttribute("data-tks-kind"));

/** A tag section over a page made of `html`. */
function mounted(html = WITH_TAGS, card?: Parameters<typeof createTagSection>[2]) {
  setBody(html);
  return createTagSection(document, i18n, card);
}

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
    mounted().render(all);
    expect(kinds()).toEqual([...KIND_IDS]);
    expect(document.querySelectorAll(".tks-badge-label")).toHaveLength(KIND_IDS.length);
    expect(document.querySelector(".tks-tag-section-label")?.textContent).toBe(
      i18n.t("badge_tags_title"),
    );
    const root = sections()[0];
    expect(root?.getAttribute("role")).toBe("group");
    expect(root?.getAttribute("aria-labelledby")).toBe(
      document.querySelector(".tks-tag-section-label")?.id,
    );
    expect(root?.querySelector(".tks-chips")?.getAttribute("data-tks-chips")).toBe("full");
    expect(root?.textContent).not.toContain("+");
  });

  it("puts the chip text and the accessible name in the chip", () => {
    mounted().render([kernel]);
    const chip = chips()[0];
    expect(chip?.querySelector(".tks-badge-label")?.textContent).toBe(i18n.t("kind_kernel_chip"));
    expect(chip?.querySelector(".tks-vh")?.textContent).toBe(
      i18n.t("kind_chip_name", {
        chip: i18n.t("kind_kernel_chip"),
        heading: i18n.t("kind_kernel_heading"),
      }),
    );
  });

  it("follows the store's user tags block", () => {
    mounted().render([ai]);
    expect(document.getElementById("tags")?.nextElementSibling).toBe(sections()[0]);
    expect(document.getElementById("publisher")?.nextElementSibling?.id).toBe("tags");
  });

  it("falls back to the row after Publisher when the page has no user tags block", () => {
    mounted(WITHOUT_TAGS).render([ai]);
    expect(document.getElementById("publisher")?.nextElementSibling).toBe(sections()[0]);
  });

  it("draws nothing on a page with neither anchor", () => {
    mounted('<div id="other"></div>').render(all);
    expect(sections()).toHaveLength(0);
    expect(document.body.innerHTML).toBe('<div id="other"></div>');
  });

  it("draws nothing, label included, for no verdicts, and removes what was there", () => {
    const section = mounted();
    section.render([]);
    expect(sections()).toHaveLength(0);
    section.render([ai, drm]);
    expect(sections()).toHaveLength(1);
    section.render([]);
    expect(sections()).toHaveLength(0);
    expect(document.querySelector(".tks-tag-section-label")).toBeNull();
  });

  it("changes nothing for the same verdicts and never doubles the section", () => {
    const section = mounted();
    section.render([ai, drm]);
    const first = sections()[0];
    const html = document.body.innerHTML;
    section.render([ai, drm]);
    expect(sections()[0]).toBe(first);
    expect(document.body.innerHTML).toBe(html);
  });

  it("draws again when the verdicts change, and when the store dropped the section", () => {
    const section = mounted();
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
    const section = mounted(WITHOUT_TAGS);
    section.render([ai]);
    const first = sections()[0];
    document.getElementById("publisher")?.insertAdjacentHTML("afterend", make.page.userTags);
    section.render([ai]);
    expect(sections()[0]).toBe(first);
    expect(document.getElementById("tags")?.nextElementSibling).toBe(first);
    expect(sections()).toHaveLength(1);
  });

  it("binds the hover card to each chip with its own verdict, as on the game's own page", () => {
    const { bound, card } = bindings();
    mounted(WITH_TAGS, card).render([ai, kernel]);
    expect(chips().map((chip) => bound.get(chip))).toEqual([[ai], [kernel]]);
    expect(chips().every((chip) => chip instanceof HTMLElement && chip.tabIndex === 0)).toBe(true);
  });

  it("leaves the chips unfocusable when there is no card to open", () => {
    mounted().render([ai]);
    expect(chips().every((chip) => !chip.hasAttribute("tabindex"))).toBe(true);
  });

  it("sets no listener and no link on the chips", () => {
    mounted().render(all);
    expect(sections()[0]?.querySelector("a, [href], [onclick]")).toBeNull();
  });
});
