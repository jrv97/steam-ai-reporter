import type { MessageCatalog } from "../ports";
import type { Verdict } from "../types";
import {
  type Banner,
  type BannerActions,
  type BannerOptions,
  createBanner,
  placeBanner,
} from "./banner";
import { createSummaryRow, placeSummaryRow } from "./summary-row";

/** What the app page shows for its own game. */
export interface AppPageView {
  readonly verdict: Verdict;
  readonly allowed: boolean;
  /** The `banner` setting. The `badges` setting is a root attribute (`applyBadgeSetting`). */
  readonly banner: boolean;
}

/** The game's own page: the banner above the purchase box and the summary box row. */
export interface AppPageUi {
  /** Idempotent: an unchanged view changes nothing; a node a store re-render dropped returns. */
  render(view: AppPageView): void;
}

interface Row {
  readonly element: HTMLElement;
  readonly notes: string;
  readonly linked: boolean;
}

/**
 * Renders the app page per components.mdx ("What renders for each state"): a disclosed game gets
 * the banner and the summary row, an allow-listed one only the banner's one-line note, and every
 * other state nothing. The banner setting off removes the banner and its note.
 */
export function createAppPageUi(
  doc: Document,
  i18n: MessageCatalog,
  actions: BannerActions,
  options: BannerOptions = {},
): AppPageUi {
  let banner: Banner | undefined;
  let row: Row | undefined;

  function renderBanner(view: AppPageView): boolean {
    if (view.verdict.state !== "disclosed" || !view.banner) {
      banner?.host.remove();
      return false;
    }
    banner ??= createBanner(doc, i18n, actions, options);
    banner.show(view.verdict, view.allowed);
    return placeBanner(doc, banner.host);
  }

  function removeRow(): void {
    row?.element.remove();
    row = undefined;
  }

  return {
    render(view) {
      const bannerShown = renderBanner(view);
      const { verdict } = view;
      if (verdict.state !== "disclosed" || view.allowed) {
        removeRow();
        return;
      }
      if (
        row !== undefined && row.element.isConnected && row.notes === verdict.notes
        && row.linked === bannerShown
      ) {
        return;
      }
      removeRow();
      const jump = bannerShown ? () => banner?.reveal() : undefined;
      const element = createSummaryRow(doc, i18n, verdict, jump);
      if (placeSummaryRow(doc, element)) {
        row = { element, notes: verdict.notes, linked: bannerShown };
      }
    },
  };
}
