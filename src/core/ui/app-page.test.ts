import { beforeEach, describe, expect, it } from "vitest";
import { SUMMARY_BOX } from "../../../tests/helpers/app-page";
import { setBody } from "../../../tests/helpers/dom";
import { capturedVerdicts } from "../../../tests/helpers/fixture-verdicts";
import { englishI18n } from "../../../tests/helpers/i18n";
import {
  aiVerdicts,
  disclosedKinds,
  disclosedVerdict,
  NOT_DISCLOSED,
} from "../../../tests/helpers/verdicts";
import type { AiVerdict } from "../kinds/ai";
import type { KindId } from "../kinds/id";
import { perKind } from "../kinds/registry";
import type { AnyDisclosed, KindVerdicts } from "../kinds/verdicts";
import { type AllowScope, perScope } from "../settings/allow-data";
import { UNKNOWN } from "../types";
import { type AppPageView, createAppPageUi } from "./app-page";
import { BANNER_ID } from "./banner";

// The summary box with Steam's user-defined tags block, and the description column of an app page
// (components.mdx, section 3).
const PAGE = `${SUMMARY_BOX}
  <div class="game_description_column"><div id="game_area_purchase"></div></div>`;

const i18n = englishI18n();
const actions = { ignore: () => Promise.resolve(), restore: () => Promise.resolve() };

interface Bound {
  readonly entries: readonly AnyDisclosed[];
  readonly ownPage: boolean | undefined;
}

let bound = new Map<Element, Bound>();

function setup() {
  setBody(PAGE);
  bound = new Map();
  const card = {
    bind: (trigger: Element, entries: readonly AnyDisclosed[], ownPage?: boolean) =>
      bound.set(trigger, { entries, ownPage }),
  };
  return createAppPageUi(document, i18n, actions, { frame: () => undefined, card });
}

interface ViewOptions {
  readonly verdict?: AiVerdict;
  readonly verdicts?: KindVerdicts;
  readonly ignored?: readonly AllowScope[];
  /** Kinds whose banner entry is switched off. */
  readonly bannerOff?: readonly KindId[];
  /** Kinds whose badge is switched off. */
  readonly badgeOff?: readonly KindId[];
}

function view(options: ViewOptions = {}): AppPageView {
  const { verdict = disclosedVerdict(), ignored = [], bannerOff = [], badgeOff = [] } = options;
  return {
    verdicts: options.verdicts ?? aiVerdicts(verdict),
    ignored: perScope((scope) => ignored.includes(scope)),
    badge: perKind((kind) => !badgeOff.includes(kind.id)),
    banner: perKind((kind) => !bannerOff.includes(kind.id)),
  };
}

const section = () => document.querySelector<HTMLElement>(".sar-tag-section");
const chips = () => [...document.querySelectorAll<HTMLElement>(".sar-tag-section .sar-badge")];
const chipKinds = () => chips().map((chip) => chip.getAttribute("data-sar-kind"));
const bannerHost = () => document.getElementById(BANNER_ID);
const bannerRoot = () => bannerHost()?.shadowRoot ?? null;
const headings = () =>
  [...(bannerRoot()?.querySelectorAll("h2") ?? [])].map((heading) => heading.textContent);
const notes = () =>
  [...(bannerRoot()?.querySelectorAll(".sar-banner-ignored-text") ?? [])].map((note) =>
    note.textContent
  );

describe("createAppPageUi", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("adds the tag section under the user tags and the banner above the purchase box", () => {
    setup().render(view());
    const root = section();
    expect(document.getElementById("tags")?.nextElementSibling).toBe(root);
    expect(root?.querySelector(".sar-tag-section-label")?.textContent).toBe(
      i18n.t("badge_tags_title"),
    );
    expect(chipKinds()).toEqual(["ai"]);
    expect(root?.querySelector(".sar-badge-label")?.textContent).toBe(i18n.t("kind_ai_chip"));
    expect(root?.querySelector(".sar-vh")?.textContent).toBe(
      i18n.t("kind_chip_name", {
        chip: i18n.t("kind_ai_chip"),
        heading: i18n.t("kind_ai_heading"),
      }),
    );
    expect(root?.querySelector("a, [href]")).toBeNull();
    expect(bannerHost()?.nextElementSibling?.id).toBe("game_area_purchase");
  });

  it("leaves nothing under Publisher", () => {
    setup().render(view({ verdicts: capturedVerdicts(1808500) }));
    expect(document.getElementById("publisher")?.nextElementSibling?.id).toBe("tags");
  });

  it("binds the hover card to each chip with its own kind, as on the game's own page", () => {
    const verdicts = capturedVerdicts(1808500);
    setup().render(view({ verdicts }));
    expect(chips()).toHaveLength(4);
    for (const chip of chips()) {
      const kind = chip.getAttribute("data-sar-kind");
      const entries = bound.get(chip)?.entries ?? [];
      expect(entries.map((entry) => entry.kind)).toEqual([kind]);
      expect(entries[0]).toBe(verdicts[entries[0]?.kind ?? "ai"]);
      expect(bound.get(chip)?.ownPage).toBe(true);
      expect(chip.tabIndex).toBe(0);
    }
  });

  it.each(
    [
      ["not disclosed", NOT_DISCLOSED],
      ["unknown", UNKNOWN.missing],
    ] as const,
  )("renders nothing for %s", (_name, verdict: AiVerdict) => {
    setup().render(view({ verdict }));
    expect(document.body.innerHTML).toBe(PAGE);
  });

  it("lists every disclosed kind in the banner and in the tag section, in registry order", () => {
    setup().render(view({ verdicts: capturedVerdicts(1808500) }));
    expect(headings()).toEqual([
      i18n.t("kind_ai_heading"),
      i18n.t("kind_kernel_heading"),
      i18n.t("kind_eula_heading"),
      i18n.t("kind_pvp_heading"),
    ]);
    expect(document.querySelectorAll(".sar-tag-section")).toHaveLength(1);
    expect(chipKinds()).toEqual(["ai", "kernel", "eula", "pvp"]);
  });

  it("shows a game that discloses no AI its chips and its banner entries", () => {
    setup().render(view({ verdicts: capturedVerdicts(3751950) }));
    expect(headings()).toEqual([
      i18n.t("kind_drm_heading"),
      i18n.t("kind_account_heading"),
      i18n.t("kind_eula_heading"),
    ]);
    expect(chipKinds()).toEqual(["drm", "account", "eula"]);
  });

  it("gives a game that declares only kernel anti-cheat a section with one chip", () => {
    setup().render(view({ verdicts: disclosedKinds(["kernel"]) }));
    expect(chipKinds()).toEqual(["kernel"]);
    expect(chips()[0]?.querySelector(".sar-badge-label")?.textContent).toBe(
      i18n.t("kind_kernel_chip"),
    );
  });

  it("shows a game ignored for all tags only the note, with no section", () => {
    setup().render(view({ verdicts: capturedVerdicts(1808500), ignored: ["all"] }));
    expect(section()).toBeNull();
    expect(headings()).toEqual([]);
    expect(notes()).toEqual([i18n.t("banner_ignored")]);
    expect(bannerRoot()?.querySelector("aside")?.getAttribute("data-sar-variant")).toBe("ignored");
  });

  it("notes the AI kind ignored on its own, keeps the other entries and drops its chip", () => {
    setup().render(view({ verdicts: capturedVerdicts(1808500), ignored: ["ai"] }));
    expect(chipKinds()).toEqual(["kernel", "eula", "pvp"]);
    expect(headings()).toEqual([
      i18n.t("kind_kernel_heading"),
      i18n.t("kind_eula_heading"),
      i18n.t("kind_pvp_heading"),
    ]);
    expect(notes()).toEqual([
      i18n.t("banner_ignored_kind", { heading: i18n.t("kind_ai_heading") }),
    ]);
  });

  it("drops only the chip of a kind whose badge is off, and keeps its banner entry", () => {
    const ui = setup();
    const verdicts = capturedVerdicts(1808500);
    ui.render(view({ verdicts }));
    expect(chipKinds()).toEqual(["ai", "kernel", "eula", "pvp"]);
    ui.render(view({ verdicts, badgeOff: ["ai"] }));
    expect(chipKinds()).toEqual(["kernel", "eula", "pvp"]);
    expect(headings()).toHaveLength(4);
    ui.render(view({ verdicts, badgeOff: ["kernel", "pvp"] }));
    expect(chipKinds()).toEqual(["ai", "eula"]);
    ui.render(view({ verdicts }));
    expect(chipKinds()).toEqual(["ai", "kernel", "eula", "pvp"]);
    expect(document.querySelectorAll(".sar-tag-section")).toHaveLength(1);
  });

  it("removes the section and its label when every badge is off", () => {
    const ui = setup();
    const verdicts = capturedVerdicts(1808500);
    ui.render(view({ verdicts }));
    ui.render(view({ verdicts, badgeOff: ["ai", "kernel", "eula", "pvp"] }));
    expect(section()).toBeNull();
    expect(document.querySelector(".sar-tag-section-label")).toBeNull();
    expect(headings()).toHaveLength(4);
  });

  it("keeps the chips of the other kinds when one kind is ignored", () => {
    setup().render(view({ verdicts: capturedVerdicts(1808500), ignored: ["kernel"] }));
    expect(chipKinds()).toEqual(["ai", "eula", "pvp"]);
    expect(headings()).toEqual([
      i18n.t("kind_ai_heading"),
      i18n.t("kind_eula_heading"),
      i18n.t("kind_pvp_heading"),
    ]);
    expect(notes()).toEqual([
      i18n.t("banner_ignored_kind", { heading: i18n.t("kind_kernel_heading") }),
    ]);
  });

  it("leaves out a kind whose banner entry is off, with its note when it is ignored", () => {
    setup().render(
      view({
        verdicts: capturedVerdicts(1808500),
        ignored: ["kernel"],
        bannerOff: ["kernel", "pvp"],
      }),
    );
    expect(headings()).toEqual([i18n.t("kind_ai_heading"), i18n.t("kind_eula_heading")]);
    expect(notes()).toEqual([]);
    expect(chipKinds()).toEqual(["ai", "eula", "pvp"]);
  });

  it("drops the banner when every banner entry is off and keeps the chips", () => {
    const ui = setup();
    ui.render(view());
    ui.render(view({ bannerOff: ["ai"] }));
    expect(bannerHost()).toBeNull();
    expect(chipKinds()).toEqual(["ai"]);
    expect(document.querySelectorAll(".sar-tag-section")).toHaveLength(1);
  });

  it("removes the note when the banner setting of an ignored game is off", () => {
    const ui = setup();
    ui.render(view({ ignored: ["all"] }));
    ui.render(view({ ignored: ["all"], bannerOff: ["ai"] }));
    expect(bannerHost()).toBeNull();
  });

  it("changes nothing for the same view and restores what a re-render dropped", () => {
    const ui = setup();
    const same = view();
    ui.render(same);
    const root = section();
    ui.render(same);
    expect(section()).toBe(root);
    root?.remove();
    bannerHost()?.remove();
    ui.render(same);
    expect(document.querySelectorAll(".sar-tag-section")).toHaveLength(1);
    expect(bannerHost()?.isConnected).toBe(true);
  });

  it("draws the chips again when a verdict changes", () => {
    const ui = setup();
    ui.render(view());
    const root = section();
    ui.render(view({ verdict: disclosedVerdict({ notes: "Other notes." }) }));
    expect(section()).not.toBe(root);
    expect(document.querySelectorAll(".sar-tag-section")).toHaveLength(1);
    expect(chipKinds()).toEqual(["ai"]);
  });
});
