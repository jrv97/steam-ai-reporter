import { countVerdicts, isUnanswered, removeVerdicts } from "../cache/maintenance";
import { UNKNOWN_TTL_MS } from "../cache/ttl";
import { DAY_MS, HOUR_MS } from "../kinds/kind-ttl";
import { KINDS } from "../kinds/registry";
import type { KeyValueStore, MessageCatalog } from "../ports";
import {
  type ActionCard,
  actionCard,
  actionOf,
  cardActions,
  cardButton,
  cardHelp,
  createCardReport,
} from "./card-parts";
import { createElement } from "./element";

/** What the Lookup results card reads and clears. */
export interface LookupCardDeps {
  readonly i18n: MessageCatalog;
  /** The store that holds the verdicts (`v1:a:*`) beside the settings and lists. */
  readonly store: KeyValueStore;
  /** Starts every id in the card, so two forms on one page never share one. */
  readonly idPrefix: string;
  /** Says a result through the form's live region. */
  readonly announce: (text: string) => void;
}

/** Names what a button of the card does. */
const ACTION_ATTRIBUTE = "data-tks-lookups";
const ACTIONS = ["clear", "recheck"] as const;
type Action = (typeof ACTIONS)[number];

/** The longest time any kind keeps an answer, which is how long a whole entry can last. */
function longestTtl(): number {
  return Math.max(...KINDS.flatMap(({ ttl }) => [ttl.disclosed, ttl.notDisclosed]));
}

/**
 * The Lookup results card: how many games have stored verdicts, a button that clears them all
 * and one that clears only those Steam gave no answer for. Both run at once, with no check, and
 * touch nothing but the verdict keys.
 */
export function createLookupCard(doc: Document, deps: LookupCardDeps): ActionCard {
  const { i18n, store, idPrefix } = deps;
  const numbers = new Intl.NumberFormat(i18n.locale.replaceAll("_", "-"));

  function button(action: Action, label: "options_lookups_clear" | "options_lookups_recheck") {
    const node = cardButton(
      doc,
      i18n.t(label),
      action === "clear" ? "brush-cleaning" : "refresh-cw",
    );
    node.setAttribute(ACTION_ATTRIBUTE, action);
    return node;
  }

  const section = actionCard(doc, i18n.t("options_section_lookups"), `${idPrefix}lookups`);
  const count = createElement(doc, "p", "tks-card-help");
  const { nodes, report } = createCardReport(doc, deps.announce);
  section.append(
    cardHelp(
      doc,
      i18n.t("options_lookups_help", {
        days: numbers.format(Math.round(longestTtl() / DAY_MS)),
        hours: numbers.format(Math.round(UNKNOWN_TTL_MS / HOUR_MS)),
      }),
    ),
    count,
    cardActions(doc, [
      button("clear", "options_lookups_clear"),
      button("recheck", "options_lookups_recheck"),
    ]),
    ...nodes,
  );

  /** Reads the count again; a failed read says so in the error line. */
  async function recount(): Promise<boolean> {
    try {
      const { games, unanswered } = await countVerdicts(store);
      count.textContent = games === 0
        ? i18n.t("options_lookups_empty")
        : i18n.plural("options_lookups_count", games, { unanswered: numbers.format(unanswered) });
      return true;
    } catch {
      count.textContent = "";
      return false;
    }
  }

  let busy = false;

  async function run(action: Action): Promise<void> {
    busy = true;
    let removed: number;
    try {
      removed = await removeVerdicts(store, action === "clear" ? undefined : isUnanswered);
    } catch {
      report(undefined, i18n.t("error_lookups_clear"));
      busy = false;
      return;
    }
    const counted = await recount();
    report(
      i18n.plural(
        action === "clear" ? "notice_lookups_cleared" : "notice_lookups_rechecked",
        removed,
      ),
      counted ? undefined : i18n.t("error_lookups_read"),
    );
    busy = false;
  }

  function handle(target: EventTarget | null): boolean {
    const action = actionOf(target, ACTION_ATTRIBUTE, ACTIONS);
    if (action !== undefined && !busy) {
      void run(action);
    }
    return action !== undefined;
  }

  void recount().then((counted) => {
    if (!counted) {
      report(undefined, i18n.t("error_lookups_read"));
    }
  });

  return { section, handle };
}
