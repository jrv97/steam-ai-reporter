import { beforeEach, describe, expect, it } from "vitest";
import { setBody } from "../../../tests/helpers/dom";
import { make } from "../../../tests/helpers/factory";
import { englishI18n } from "../../../tests/helpers/i18n";
import type { AiVerdict } from "../kinds/ai";
import { taggedView } from "../kinds/facets";
import { KIND_IDS, type KindId } from "../kinds/id";
import type { ChipWords } from "../kinds/kind-settings";
import { kindsInOrder, parseOrder } from "../kinds/order";
import { KIND_BY_ID, perKind } from "../kinds/registry";
import type { AnyDisclosed, KindVerdicts } from "../kinds/verdicts";
import { type AllowScope, perScope } from "../settings/allow-data";
import { DEFAULT_SETTINGS } from "../settings/settings";
import { type AppPageView, createAppPageUi } from "./app-page";
import { BANNER_ID } from "./banner";

// The summary box with Steam's user-defined tags block, and the description column of an app page
// (components.mdx, section 3).
const PAGE = `${make.page.summaryBox}
  <div class="game_description_column"><div id="game_area_purchase"></div></div>`;

const i18n = englishI18n();
/** The captured verdicts of a game that discloses five kinds. */
const ARC = make.fixture.verdicts(make.fixture.app.arcRaiders);
/** The game's developer, the one creator each view lists. */
const DEVELOPER = make.text.creator();
const settled = () => Promise.resolve();
const actions = {
  ignore: settled,
  restore: settled,
  ignoreCreator: settled,
  restoreCreator: settled,
};

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
  /** The scopes the base game of a DLC is ignored in, which silence the kinds they cover. */
  readonly baseIgnored?: readonly AllowScope[];
  /**
   * The scopes the game's developer is ignored in, which silence the kinds they cover and add
   * a note to the banner.
   */
  readonly developerIgnored?: readonly AllowScope[];
  /** Kinds whose banner entry is switched off, besides those that start off. */
  readonly bannerOff?: readonly KindId[];
  /** Kinds whose badge is switched off. */
  readonly badgeOff?: readonly KindId[];
  /** The tag order; the registry's by default. */
  readonly order?: readonly KindId[];
  /** The person's chip text; none by default. */
  readonly words?: ChipWords;
}

/** What the page draws for the options, with each kind's default values and banner switch. */
function view(options: ViewOptions = {}): AppPageView {
  const { verdict = make.verdict.disclosed("ai"), ignored = [], bannerOff = [] } = options;
  const { badgeOff = [] } = options;
  const { baseIgnored = [], developerIgnored = [] } = options;
  const developer = make.creator.banner("developer", DEVELOPER, developerIgnored);
  const covers = (scopes: readonly AllowScope[], kind: KindId) =>
    scopes.includes("all") || scopes.includes(kind);
  return {
    verdicts: taggedView(
      options.verdicts ?? make.verdicts({ ai: verdict }),
      DEFAULT_SETTINGS.kinds,
    ),
    ignored: perScope((scope) => ignored.includes(scope)),
    suppressed: perKind((kind) =>
      covers(ignored, kind.id) || covers(baseIgnored, kind.id) || covers(developerIgnored, kind.id)
    ),
    creators: [developer],
    badge: perKind((kind) => !badgeOff.includes(kind.id)),
    banner: perKind((kind) => kind.defaults.banner && !bannerOff.includes(kind.id)),
    order: kindsInOrder(options.order ?? KIND_IDS),
    words: options.words ?? DEFAULT_SETTINGS.kinds,
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
const headingsOf = (ids: readonly KindId[]) =>
  kindsInOrder(ids).map((kind) => i18n.t(kind.messages.heading));
const kindNote = (kind: KindId) =>
  i18n.t("banner_ignored_kind", { heading: i18n.t(KIND_BY_ID[kind].messages.heading) });

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
    setup().render(view({ verdicts: ARC }));
    expect(document.getElementById("publisher")?.nextElementSibling?.id).toBe("tags");
  });

  it("binds the hover card to each chip with its own kind, as on the game's own page", () => {
    const verdicts = ARC;
    setup().render(view({ verdicts }));
    expect(chips()).toHaveLength(5);
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
      ["not disclosed", make.verdict.notDisclosed()],
      ["unknown", make.verdict.unknown()],
    ] as const,
  )("renders nothing for %s", (_name, verdict: AiVerdict) => {
    setup().render(view({ verdict }));
    expect(document.body.innerHTML).toBe(PAGE);
  });

  it("shows a game that discloses no AI its chips and its banner entries", () => {
    setup().render(view({ verdicts: make.fixture.verdicts(make.fixture.app.drmAccountEula) }));
    expect(headings()).toEqual([
      i18n.t("kind_iap_heading"),
      i18n.t("kind_drm_heading"),
      i18n.t("kind_account_heading"),
      i18n.t("kind_eula_heading"),
    ]);
    // Steam's features leave Family Sharing out of this paid game; its banner entry starts off.
    expect(chipKinds()).toEqual(["family", "iap", "drm", "account", "eula"]);
  });

  describe("with the person's chip text", () => {
    const MINE = make.chipText();
    const words = make.settings.chipText({ ai: { chip: MINE } }).kinds;
    const ignoreAi = () =>
      bannerRoot()?.querySelector(
        "[data-sar-action=ignore-creator][data-sar-scope=ai]",
      )?.textContent;

    it("names the chips and a creator's Ignore button by it, and keeps Steam's heading", () => {
      const ui = setup();
      ui.render(view());
      ui.render(view({ words }));
      expect(chips().map((chip) => chip.querySelector(".sar-badge-label")?.textContent)).toEqual([
        MINE,
      ]);
      expect(ignoreAi()).toBe(i18n.t("banner_ignore_creator_kind", { chip: MINE }));
      expect(headings()).toEqual([i18n.t("kind_ai_heading")]);
    });
  });

  describe("in the tag order", () => {
    const SHOWN: readonly KindId[] = ["ai", "kernel", "eula", "pvp"];
    const MOVED = parseOrder(["pvp", "eula", "ai"]);
    const shownIn = (order: readonly KindId[]) => order.filter((id) => SHOWN.includes(id));

    it.each<[string, readonly KindId[]]>([["the registry's", KIND_IDS], ["a person's", MOVED]])(
      "lists the chips and the banner entries in %s order",
      (_case, order) => {
        setup().render(view({ verdicts: make.verdicts.only(SHOWN), order }));
        expect(chipKinds()).toEqual(shownIn(order));
        expect(headings()).toEqual(headingsOf(shownIn(order)));
      },
    );

    it("draws both again when only the order changes", () => {
      const ui = setup();
      ui.render(view({ verdicts: make.verdicts.only(SHOWN) }));
      ui.render(view({ verdicts: make.verdicts.only(SHOWN), order: MOVED }));
      expect(chipKinds()).toEqual(shownIn(MOVED));
      expect(headings()).toEqual(headingsOf(shownIn(MOVED)));
    });
  });

  it("shows a game ignored for all tags only the note, with no section", () => {
    setup().render(view({ verdicts: ARC, ignored: ["all"] }));
    expect(section()).toBeNull();
    expect(headings()).toEqual([]);
    expect(notes()).toEqual([i18n.t("banner_ignored")]);
    expect(bannerRoot()?.querySelector("aside")?.getAttribute("data-sar-variant")).toBe("ignored");
  });

  describe("with some kinds silenced", () => {
    const NO_AI: readonly KindId[] = ["iap", "pvp", "eula", "kernel"];
    const NO_KERNEL: readonly KindId[] = ["ai", "iap", "pvp", "eula"];
    const DEVELOPER_AI = i18n.t("banner_ignored_creator_kind", {
      name: DEVELOPER,
      role: i18n.t("banner_role_developer"),
      heading: i18n.t("kind_ai_heading"),
    });

    it.each<
      readonly [string, ViewOptions, readonly KindId[], readonly KindId[], readonly string[]]
    >(
      [
        ["the AI kind ignored", { ignored: ["ai"] }, NO_AI, NO_AI, [kindNote("ai")]],
        ["the AI kind ignored on the base game", { baseIgnored: ["ai"] }, NO_AI, NO_AI, []],
        [
          "the AI kind ignored here and three kinds on the base game",
          { ignored: ["ai"], baseIgnored: ["ai", "pvp", "iap"] },
          ["eula", "kernel"],
          ["eula", "kernel"],
          [kindNote("ai")],
        ],
        ["the developer ignored for AI", { developerIgnored: ["ai"] }, NO_AI, NO_AI, [
          DEVELOPER_AI,
        ]],
        ["kernel ignored", { ignored: ["kernel"] }, NO_KERNEL, NO_KERNEL, [kindNote("kernel")]],
        [
          "kernel ignored and its banner entry off",
          { ignored: ["kernel"], bannerOff: ["kernel", "pvp", "iap"] },
          NO_KERNEL,
          ["ai", "eula"],
          [],
        ],
      ],
    )("with %s, draws the chips, banner entries and notes", (_name, options, ids, entries, all) => {
      setup().render(view({ verdicts: ARC, ...options }));
      expect(chipKinds()).toEqual(ids);
      expect(headings()).toEqual(headingsOf(entries));
      expect(notes()).toEqual(all);
    });
  });

  it("shows a DLC of a base game ignored for all tags no banner and no section", () => {
    setup().render(view({ verdicts: ARC, baseIgnored: ["all"] }));
    expect(bannerHost()).toBeNull();
    expect(section()).toBeNull();
    expect(document.body.innerHTML).toBe(PAGE);
  });

  it("notes a developer ignored for all tags once, and keeps the Undo as the only control", () => {
    setup().render(view({ verdicts: ARC, developerIgnored: ["all"] }));
    expect(notes()).toEqual([
      i18n.t("banner_ignored_creator", {
        name: DEVELOPER,
        role: i18n.t("banner_role_developer"),
      }),
    ]);
    expect(headings()).toEqual([]);
    expect(section()).toBeNull();
  });

  it.each<readonly [string, readonly AllowScope[], KindVerdicts, readonly KindId[]]>([
    [
      "a kind the game does not declare",
      ["drm"],
      make.verdicts({ ai: make.verdict.disclosed("ai") }),
      [],
    ],
    ["a kind whose banner entry is off", ["ai"], ARC, ["ai"]],
  ])("shows no note for a developer ignored for %s", (_name, scopes, verdicts, bannerOff) => {
    setup().render(view({ verdicts, developerIgnored: scopes, bannerOff }));
    expect(notes().some((note) => note.includes(DEVELOPER))).toBe(false);
  });

  it("shows no banner for a developer ignored for all tags when nothing is disclosed", () => {
    setup().render(
      view({
        verdicts: make.verdicts({ ai: make.verdict.notDisclosed() }),
        developerIgnored: ["all"],
      }),
    );
    expect(bannerHost()).toBeNull();
  });

  it("drops only the chip of a kind whose badge is off, and keeps its banner entry", () => {
    const ui = setup();
    const verdicts = ARC;
    ui.render(view({ verdicts }));
    expect(chipKinds()).toEqual(["ai", "iap", "pvp", "eula", "kernel"]);
    ui.render(view({ verdicts, badgeOff: ["ai"] }));
    expect(chipKinds()).toEqual(["iap", "pvp", "eula", "kernel"]);
    expect(headings()).toHaveLength(5);
    ui.render(view({ verdicts, badgeOff: ["kernel", "pvp", "iap"] }));
    expect(chipKinds()).toEqual(["ai", "eula"]);
    ui.render(view({ verdicts }));
    expect(chipKinds()).toEqual(["ai", "iap", "pvp", "eula", "kernel"]);
    expect(document.querySelectorAll(".sar-tag-section")).toHaveLength(1);
  });

  it("removes the section and its label when every badge is off", () => {
    const ui = setup();
    const verdicts = ARC;
    ui.render(view({ verdicts }));
    ui.render(view({ verdicts, badgeOff: ["ai", "kernel", "eula", "pvp", "iap"] }));
    expect(section()).toBeNull();
    expect(document.querySelector(".sar-tag-section-label")).toBeNull();
    expect(headings()).toHaveLength(5);
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
    ui.render(view({ verdict: make.verdict.disclosed("ai", { notes: make.text.note() }) }));
    expect(section()).not.toBe(root);
    expect(document.querySelectorAll(".sar-tag-section")).toHaveLength(1);
    expect(chipKinds()).toEqual(["ai"]);
  });
});
