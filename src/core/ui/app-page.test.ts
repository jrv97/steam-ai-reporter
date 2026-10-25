import { beforeEach, describe, expect, it, vi } from "vitest";
import { setBody } from "../../../tests/helpers/dom";
import { capturedVerdicts } from "../../../tests/helpers/fixture-verdicts";
import { englishI18n } from "../../../tests/helpers/i18n";
import { aiVerdicts, disclosedVerdict, NOT_DISCLOSED } from "../../../tests/helpers/verdicts";
import { AI_KIND, type AiVerdict } from "../kinds/ai";
import type { KindId } from "../kinds/id";
import { perKind } from "../kinds/registry";
import type { AnyDisclosed, KindVerdicts } from "../kinds/verdicts";
import { type AllowScope, perScope } from "../settings/allow-data";
import { UNKNOWN } from "../types";
import { type AppPageView, createAppPageUi } from "./app-page";
import { BANNER_ID } from "./banner";

// The summary box and description column as sampled on app 1808500 (components.mdx, section 3).
const PAGE = `
  <div class="glance_ctn_responsive_left">
    <div class="dev_row" id="developer"><div class="subtitle">Developer:</div></div>
    <div class="dev_row" id="publisher"><div class="subtitle">Publisher:</div></div>
  </div>
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
  return createAppPageUi(document, i18n, AI_KIND, actions, { frame: () => undefined, card });
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

const summaryRow = () => document.querySelector<HTMLElement>(".sar-summary-row");
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

  it("adds the summary row under Publisher and the banner above the purchase box", () => {
    setup().render(view());
    const row = summaryRow();
    expect(row?.previousElementSibling?.id).toBe("publisher");
    expect(row?.querySelector(".sar-badge-label")?.textContent).toBe(i18n.t("kind_ai_chip"));
    expect(row?.querySelector(".sar-vh")?.textContent).toBe(
      i18n.t("kind_chip_name", {
        chip: i18n.t("kind_ai_chip"),
        heading: i18n.t("kind_ai_heading"),
      }),
    );
    expect(row?.getAttribute("href")).toBe(`#${BANNER_ID}`);
    expect(row?.hasAttribute("title")).toBe(false);
    // The link jumps to the full notes, so it opens no hover card.
    expect(row === null ? undefined : bound.get(row)).toBeUndefined();
    expect(bannerHost()?.nextElementSibling?.id).toBe("game_area_purchase");
  });

  it("jumps to the banner without changing the URL", () => {
    setup().render(view());
    const host = bannerHost();
    const scroll = vi.fn();
    if (host !== null) {
      host.scrollIntoView = scroll;
    }
    const before = location.href;
    summaryRow()?.click();
    expect(scroll).toHaveBeenCalledWith({ block: "start" });
    expect(location.href).toBe(before);
    expect(host?.shadowRoot?.activeElement?.tagName).toBe("ASIDE");
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

  it("lists every disclosed kind in the banner and keeps the summary row for AI", () => {
    setup().render(view({ verdicts: capturedVerdicts(1808500) }));
    expect(headings()).toEqual([
      i18n.t("kind_ai_heading"),
      i18n.t("kind_kernel_heading"),
      i18n.t("kind_eula_heading"),
      i18n.t("kind_pvp_heading"),
    ]);
    expect(document.querySelectorAll(".sar-summary-row")).toHaveLength(1);
    expect(summaryRow()?.getAttribute("data-sar-kind")).toBe("ai");
  });

  it("shows a game that discloses no AI the banner entries and no summary row", () => {
    setup().render(view({ verdicts: capturedVerdicts(3751950) }));
    expect(headings()).toEqual([
      i18n.t("kind_drm_heading"),
      i18n.t("kind_account_heading"),
      i18n.t("kind_eula_heading"),
    ]);
    expect(summaryRow()).toBeNull();
  });

  it("shows a game ignored for all tags only the note, with no summary row", () => {
    setup().render(view({ verdicts: capturedVerdicts(1808500), ignored: ["all"] }));
    expect(summaryRow()).toBeNull();
    expect(headings()).toEqual([]);
    expect(notes()).toEqual([i18n.t("banner_ignored")]);
    expect(bannerRoot()?.querySelector("aside")?.getAttribute("data-sar-variant")).toBe("ignored");
  });

  it("notes the AI kind ignored on its own, keeps the other entries and drops the row", () => {
    setup().render(view({ verdicts: capturedVerdicts(1808500), ignored: ["ai"] }));
    expect(summaryRow()).toBeNull();
    expect(headings()).toEqual([
      i18n.t("kind_kernel_heading"),
      i18n.t("kind_eula_heading"),
      i18n.t("kind_pvp_heading"),
    ]);
    expect(notes()).toEqual([
      i18n.t("banner_ignored_kind", { heading: i18n.t("kind_ai_heading") }),
    ]);
  });

  it("drops the summary row when the AI badge is off, and keeps the banner entry", () => {
    const ui = setup();
    ui.render(view());
    expect(summaryRow()).not.toBeNull();
    ui.render(view({ badgeOff: ["ai"] }));
    expect(summaryRow()).toBeNull();
    expect(headings()).toEqual([i18n.t("kind_ai_heading")]);
    ui.render(view());
    expect(summaryRow()).not.toBeNull();
  });

  it("keeps the summary row when another kind's badge is off", () => {
    setup().render(view({ badgeOff: ["drm", "pvp"] }));
    expect(summaryRow()).not.toBeNull();
  });

  it("keeps the summary row when another kind is ignored", () => {
    setup().render(view({ verdicts: capturedVerdicts(1808500), ignored: ["kernel"] }));
    expect(summaryRow()?.getAttribute("href")).toBe(`#${BANNER_ID}`);
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
  });

  it("drops the banner and unlinks the row when every banner entry is off", () => {
    const ui = setup();
    ui.render(view());
    ui.render(view({ bannerOff: ["ai"] }));
    expect(bannerHost()).toBeNull();
    expect(summaryRow()?.tagName).toBe("DIV");
    expect(summaryRow()?.hasAttribute("href")).toBe(false);
    expect(summaryRow()?.tabIndex).toBe(0);
    const row = summaryRow();
    expect(row === null ? undefined : bound.get(row)?.ownPage).toBe(true);
    expect(document.querySelectorAll(".sar-summary-row")).toHaveLength(1);
  });

  it("opens the card from the row when the banner has no AI entry", () => {
    setup().render(view({ verdicts: capturedVerdicts(1808500), bannerOff: ["ai"] }));
    expect(headings()).toHaveLength(3);
    expect(summaryRow()?.tagName).toBe("DIV");
    const row = summaryRow();
    expect(row === null ? undefined : bound.get(row)?.ownPage).toBe(true);
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
    const row = summaryRow();
    ui.render(same);
    expect(summaryRow()).toBe(row);
    row?.remove();
    bannerHost()?.remove();
    ui.render(same);
    expect(document.querySelectorAll(".sar-summary-row")).toHaveLength(1);
    expect(bannerHost()?.isConnected).toBe(true);
  });

  it("draws the row again when its verdict changes", () => {
    const ui = setup();
    ui.render(view());
    const row = summaryRow();
    ui.render(view({ verdict: disclosedVerdict({ notes: "Other notes." }) }));
    expect(summaryRow()).not.toBe(row);
    expect(document.querySelectorAll(".sar-summary-row")).toHaveLength(1);
  });
});
