import type { KindId } from "../kinds/id";
import type { TagKind } from "../kinds/kind";
import { KINDS } from "../kinds/registry";
import type { AnyDisclosed, KindVerdicts } from "../kinds/verdicts";
import type { MessageCatalog } from "../ports";
import { ALLOW_ALL, type AllowScope } from "../settings/allow-data";
import {
  type Banner,
  type BannerActions,
  type BannerOptions,
  type BannerView,
  createBanner,
  placeBanner,
} from "./banner";
import type { CardTriggers } from "./hover-card";
import { createSummaryRow, placeSummaryRow } from "./summary-row";

/** What the app page shows for its own game. */
export interface AppPageView {
  readonly verdicts: KindVerdicts;
  /** Per scope: the game is on the ignore list there. */
  readonly ignored: Readonly<Record<AllowScope, boolean>>;
  /**
   * Per kind: its entry may show in the banner (the kind is enabled and its banner setting is on).
   * Each kind's badge switch is a root attribute (`applyKindSettings`).
   */
  readonly banner: Readonly<Record<KindId, boolean>>;
}

/** The game's own page: the banner above the purchase box and the summary row. */
export interface AppPageUi {
  /** Idempotent: an unchanged view changes nothing; a node a store re-render dropped returns. */
  render(view: AppPageView): void;
}

export interface AppPageOptions extends BannerOptions {
  /** Opens on the summary row; without one the row shows no notes. */
  readonly card?: CardTriggers;
}

interface Row {
  readonly element: HTMLElement;
  readonly verdict: AnyDisclosed;
  readonly linked: boolean;
}

/**
 * What the banner shows: an entry for each disclosed kind the settings allow, a note for each
 * kind the game is ignored for, or one note for all kinds. Undefined when there is nothing.
 */
function bannerView(view: AppPageView): BannerView | undefined {
  const shown: AnyDisclosed[] = [];
  const ignored: AllowScope[] = [];
  let silenced = false;
  for (const kind of KINDS) {
    const verdict = view.verdicts[kind.id];
    if (verdict.state !== "disclosed" || !view.banner[kind.id]) {
      continue;
    }
    if (view.ignored[ALLOW_ALL]) {
      silenced = true;
    } else if (view.ignored[kind.id]) {
      ignored.push(kind.id);
    } else {
      shown.push(verdict);
    }
  }
  if (silenced) {
    ignored.push(ALLOW_ALL);
  }
  return shown.length + ignored.length === 0
    ? undefined
    : { shown, ignored };
}

/** The verdict the summary row stands for, when it is disclosed and the game is not ignored. */
function summaryVerdict(view: AppPageView, kind: TagKind): AnyDisclosed | undefined {
  const verdict = view.verdicts[kind.id];
  const ignored = view.ignored[ALLOW_ALL] || view.ignored[kind.id];
  return verdict.state === "disclosed" && !ignored ? verdict : undefined;
}

/**
 * Renders the app page per components.mdx ("What renders for each state"). The summary row stands
 * for one kind, `summary`, while that kind is disclosed and not ignored.
 */
export function createAppPageUi(
  doc: Document,
  i18n: MessageCatalog,
  summary: TagKind,
  actions: BannerActions,
  options: AppPageOptions = {},
): AppPageUi {
  let banner: Banner | undefined;
  let row: Row | undefined;

  /** Whether the banner is on the page and holds the summary kind's entry. */
  function renderBanner(shown: BannerView | undefined): boolean {
    if (shown === undefined) {
      banner?.host.remove();
      return false;
    }
    banner ??= createBanner(doc, i18n, actions, options);
    banner.show(shown);
    return placeBanner(doc, banner.host) && shown.shown.some((entry) => entry.kind === summary.id);
  }

  function removeRow(): void {
    row?.element.remove();
    row = undefined;
  }

  return {
    render(view) {
      const linked = renderBanner(bannerView(view));
      const verdict = summaryVerdict(view, summary);
      if (verdict === undefined) {
        removeRow();
        return;
      }
      if (
        row !== undefined && row.element.isConnected && row.verdict === verdict
        && row.linked === linked
      ) {
        return;
      }
      removeRow();
      const jump = linked ? () => banner?.reveal() : undefined;
      const element = createSummaryRow(doc, i18n, summary, verdict, jump, options.card);
      if (placeSummaryRow(doc, element)) {
        row = { element, verdict, linked };
      }
    },
  };
}
