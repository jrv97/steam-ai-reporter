import type { BareMessageKey } from "../i18n/t";
import { KIND_IDS } from "../kinds/id";
import type { MessageCatalog } from "../ports";
import { ALLOW_ALL, ALLOW_SCOPES } from "../settings/allow-data";
import { defaultsPatch } from "../settings/settings";
import type { StoredSettings } from "../settings/settings-source";
import type { AllowSource } from "./allow-view";
import {
  type ActionCard,
  actionCard,
  actionOf,
  cardActions,
  cardButton,
  cardHelp,
  type ConfirmBox,
  createCardReport,
  createConfirmBox,
} from "./card-parts";
import type { LucideName } from "./lucide";

/** What the Reset card changes, and the form's one read of the ignore lists it counts. */
export interface ResetCardDeps {
  readonly i18n: MessageCatalog;
  readonly settings: StoredSettings;
  /** The games list's source, then the creators'. The form reads them; the card empties them. */
  readonly games: AllowSource;
  readonly creators: readonly AllowSource[];
  /** Starts every id in the card, so two forms on one page never share one. */
  readonly idPrefix: string;
  /** Says a result through the form's live region. */
  readonly announce: (text: string) => void;
  /** Reads the ignore lists again and draws them, after they were emptied. */
  readonly onCleared: () => Promise<void>;
}

/** Names what a button of the card does. */
const ACTION_ATTRIBUTE = "data-tks-reset";
const ACTIONS = [
  "settings",
  "lists",
  "confirm-settings",
  "confirm-lists",
  "cancel",
] as const;
type Action = (typeof ACTIONS)[number];

/** The two resets: what each changes is listed in its check. */
const RESETS = ["settings", "lists"] as const;
type Reset = (typeof RESETS)[number];

const SETTINGS_LINES = [
  "options_reset_settings_tags",
  "options_reset_settings_words",
  "options_reset_settings_order",
  "options_reset_settings_keep",
] as const satisfies readonly BareMessageKey[];

/**
 * The Reset card: put every setting back to its default, or stop ignoring every game, developer
 * and publisher. Each opens a check that lists what changes, and nothing changes until its primary
 * button.
 */
export function createResetCard(doc: Document, deps: ResetCardDeps): ActionCard {
  const { i18n, idPrefix } = deps;

  function button(action: Action, label: BareMessageKey, icon?: LucideName): HTMLButtonElement {
    const node = cardButton(doc, i18n.t(label), icon);
    node.setAttribute(ACTION_ATTRIBUTE, action);
    return node;
  }

  const openers: Readonly<Record<Reset, HTMLButtonElement>> = {
    settings: button("settings", "options_reset_settings", "rotate-ccw"),
    lists: button("lists", "options_reset_lists", "list-x"),
  };
  const confirms: Readonly<Record<Reset, HTMLButtonElement>> = {
    settings: button("confirm-settings", "options_reset_settings_confirm"),
    lists: button("confirm-lists", "options_reset_lists_confirm"),
  };
  const checks: Readonly<Record<Reset, ConfirmBox>> = {
    settings: createConfirmBox(doc, {
      id: `${idPrefix}reset-settings`,
      confirm: confirms.settings,
      cancel: button("cancel", "options_backup_cancel"),
    }),
    lists: createConfirmBox(doc, {
      id: `${idPrefix}reset-lists`,
      confirm: confirms.lists,
      cancel: button("cancel", "options_backup_cancel"),
    }),
  };
  const section = actionCard(doc, i18n.t("options_section_reset"), `${idPrefix}reset`);
  const { nodes, report } = createCardReport(doc, deps.announce);
  section.append(
    cardHelp(doc, i18n.t("options_reset_help")),
    cardActions(doc, [openers.settings, openers.lists]),
    checks.settings.node,
    checks.lists.node,
    ...nodes,
  );

  /** The check open now, whose opener takes focus back when it closes. */
  let open: Reset | undefined;
  /** Whether a reset is writing; the card then takes no action. */
  let busy = false;

  /** A list's line: its count, or that it could not be read. */
  function listLine(source: AllowSource, line: () => string): string {
    return source.failed() ? i18n.t(source.loadErrorKey) : line();
  }

  /** What Stop ignoring everything will empty, from the form's last read of each list. */
  function listLines(): readonly string[] {
    const { games, creators } = deps;
    const tagged = KIND_IDS.reduce((sum, id) => sum + games.count(id), 0);
    return [
      listLine(games, () =>
        i18n.t("options_reset_lists_games", {
          list: i18n.t(games.title),
          all: String(games.count(ALLOW_ALL)),
          tags: String(tagged),
        })),
      ...creators.map((source) =>
        listLine(source, () =>
          i18n.t("options_backup_summary_list", {
            list: i18n.t(source.title),
            number: String(ALLOW_SCOPES.reduce((sum, of) => sum + source.count(of), 0)),
          }))
      ),
      i18n.t("options_reset_lists_keep"),
    ];
  }

  function show(reset: Reset): void {
    if (open !== undefined) {
      checks[open].close();
    }
    open = reset;
    report(undefined);
    if (reset === "settings") {
      checks.settings.open(
        i18n.t("options_reset_settings_title"),
        SETTINGS_LINES.map((key) => i18n.t(key)),
      );
    } else {
      checks.lists.open(i18n.t("options_reset_lists_title"), listLines());
    }
  }

  /** Closes the open check and gives focus back to the button that opened it. */
  function close(): void {
    if (open === undefined) {
      return;
    }
    checks[open].close();
    openers[open].focus();
    open = undefined;
  }

  /**
   * Applies the reset and says whether every write held. Every list settles and is drawn again
   * before it answers, so a partial failure never leaves a stale view behind.
   */
  async function run(reset: Reset): Promise<boolean> {
    if (reset === "settings") {
      return deps.settings.patch(defaultsPatch()).then(() => true, () => false);
    }
    const results = await Promise.allSettled(
      [deps.games, ...deps.creators].map((source) => source.clear()),
    );
    const redrawn = await deps.onCleared().then(() => true, () => false);
    return redrawn && results.every((result) => result.status === "fulfilled");
  }

  /** Disables both resets while one writes, so neither check can open or close under it. */
  function hold(on: boolean): void {
    busy = on;
    for (const each of RESETS) {
      openers[each].disabled = on;
      confirms[each].disabled = on;
    }
  }

  async function apply(reset: Reset): Promise<void> {
    hold(true);
    const done = await run(reset);
    hold(false);
    if (!done) {
      // The check stays open, so the person can try again
      report(
        undefined,
        i18n.t(reset === "settings" ? "error_reset_settings" : "error_reset_lists"),
      );
      return;
    }
    close();
    report(i18n.t(reset === "settings" ? "notice_reset_settings_done" : "notice_reset_lists_done"));
  }

  function handle(target: EventTarget | null): boolean {
    const action = actionOf(target, ACTION_ATTRIBUTE, ACTIONS);
    if (action !== undefined && busy) {
      return true;
    }
    switch (action) {
      case undefined:
        return false;
      case "settings":
      case "lists":
        show(action);
        break;
      case "confirm-settings":
        void apply("settings");
        break;
      case "confirm-lists":
        void apply("lists");
        break;
      case "cancel":
        close();
        report(undefined);
    }
    return true;
  }

  return { section, handle };
}
