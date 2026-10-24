import { beforeEach, describe, expect, it, vi } from "vitest";
import { setBody } from "../../../tests/helpers/dom";
import { englishI18n } from "../../../tests/helpers/i18n";
import { aiVerdicts, disclosedVerdict, NOT_DISCLOSED } from "../../../tests/helpers/verdicts";
import { AI_KIND } from "../kinds/ai";
import type { TagKind } from "../kinds/kind";
import { type DisclosedVerdict, UNKNOWN, type Verdict } from "../types";
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
const actions = { stopMarking: () => Promise.resolve(), markAgain: () => Promise.resolve() };

interface Bound {
  readonly verdict: DisclosedVerdict;
  readonly ownPage: boolean | undefined;
}

let bound = new Map<Element, Bound>();

function setup() {
  setBody(PAGE);
  bound = new Map();
  const card = {
    bind: (trigger: Element, _kind: TagKind, verdict: DisclosedVerdict, ownPage?: boolean) =>
      bound.set(trigger, { verdict, ownPage }),
  };
  return createAppPageUi(document, i18n, AI_KIND, actions, { frame: () => undefined, card });
}

interface ViewOptions {
  readonly verdict?: Verdict;
  readonly allowed?: boolean;
  readonly banner?: boolean;
}

function view(options: ViewOptions = {}): AppPageView {
  const { verdict = disclosedVerdict(), allowed = false, banner = true } = options;
  return { verdicts: aiVerdicts(verdict), allowed, banner };
}

const summaryRow = () => document.querySelector<HTMLElement>(".sar-summary-row");
const bannerHost = () => document.getElementById(BANNER_ID);

describe("createAppPageUi", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("adds the summary row under Publisher and the banner above the purchase box", () => {
    setup().render(view());
    const row = summaryRow();
    expect(row?.previousElementSibling?.id).toBe("publisher");
    expect(row?.textContent).toBe(i18n.t("badge_label"));
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
  )("renders nothing for %s", (_name, verdict: Verdict) => {
    setup().render(view({ verdict }));
    expect(document.body.innerHTML).toBe(PAGE);
  });

  it("shows an allow-listed game only the undo line", () => {
    setup().render(view({ allowed: true }));
    expect(summaryRow()).toBeNull();
    const aside = bannerHost()?.shadowRoot?.querySelector("aside");
    expect(aside?.getAttribute("data-sar-variant")).toBe("ignored");
  });

  it("drops the banner and unlinks the row when the banner setting is off", () => {
    const ui = setup();
    ui.render(view());
    ui.render(view({ banner: false }));
    expect(bannerHost()).toBeNull();
    expect(summaryRow()?.tagName).toBe("DIV");
    expect(summaryRow()?.hasAttribute("href")).toBe(false);
    expect(summaryRow()?.tabIndex).toBe(0);
    const row = summaryRow();
    expect(row === null ? undefined : bound.get(row)?.ownPage).toBe(true);
    expect(document.querySelectorAll(".sar-summary-row")).toHaveLength(1);
  });

  it("removes the allow-listed note when the banner setting is off", () => {
    const ui = setup();
    ui.render(view({ allowed: true }));
    ui.render(view({ allowed: true, banner: false }));
    expect(bannerHost()).toBeNull();
  });

  it("changes nothing for the same view and restores what a re-render dropped", () => {
    const ui = setup();
    ui.render(view());
    const row = summaryRow();
    ui.render(view());
    expect(summaryRow()).toBe(row);
    row?.remove();
    bannerHost()?.remove();
    ui.render(view());
    expect(document.querySelectorAll(".sar-summary-row")).toHaveLength(1);
    expect(bannerHost()?.isConnected).toBe(true);
  });
});
