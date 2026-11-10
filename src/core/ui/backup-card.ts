import { type BackupDeps, createBackupFile, restoreBackup } from "../backup/backup";
import { type BackupReading, countEntries, MAX_BACKUP_SIZE, readBackup } from "../backup/format";
import { CREATOR_ROLES, type CreatorRole } from "../creator";
import type { BareMessageKey } from "../i18n/t";
import type { FileTransfer, MessageCatalog, PickedFile } from "../ports";
import {
  type ActionCard,
  actionCard,
  actionOf,
  cardActions,
  cardButton,
  cardHelp,
  createCardReport,
  createConfirmBox,
} from "./card-parts";
import type { LucideName } from "./lucide";

/** What the Backup card needs beyond the stored settings and lists. */
export interface BackupCardDeps extends BackupDeps {
  readonly i18n: MessageCatalog;
  readonly files: FileTransfer;
  readonly dates: Intl.DateTimeFormat;
  /** Starts every id in the card, so two forms on one page never share one. */
  readonly idPrefix: string;
  /** Says a result through the form's live region. */
  readonly announce: (text: string) => void;
  /** Draws the ignore lists again after a restore. */
  readonly onRestored: () => Promise<void>;
}

/** Names what a button of the card does. */
const ACTION_ATTRIBUTE = "data-tks-backup";
const ACTIONS = ["save", "pick", "confirm", "cancel"] as const;
type Action = (typeof ACTIONS)[number];

type Backup = Extract<BackupReading, { kind: "backup"; }>;

const LIST_TITLES = {
  developer: "options_section_allow_developers",
  publisher: "options_section_allow_publishers",
} as const satisfies Record<CreatorRole, BareMessageKey>;

/**
 * The Backup card: download a file of the settings and ignore lists, or pick one and restore it
 * after a check that shows its date and contents. File text only ever reaches `textContent`.
 */
export function createBackupCard(doc: Document, deps: BackupCardDeps): ActionCard {
  const { i18n, idPrefix } = deps;

  function button(action: Action, label: BareMessageKey, icon?: LucideName): HTMLButtonElement {
    const node = cardButton(doc, i18n.t(label), icon);
    node.setAttribute(ACTION_ATTRIBUTE, action);
    return node;
  }

  const section = actionCard(doc, i18n.t("options_section_backup"), `${idPrefix}backup`);
  const pickButton = button("pick", "options_backup_restore", "file-up");
  const confirm = button("confirm", "options_backup_confirm");
  const check = createConfirmBox(doc, {
    id: `${idPrefix}backup-summary`,
    confirm,
    cancel: button("cancel", "options_backup_cancel"),
    note: i18n.t("options_backup_restore_note"),
  });
  const { nodes, report } = createCardReport(doc, deps.announce);
  section.append(
    cardHelp(doc, i18n.t("options_backup_help")),
    cardActions(doc, [button("save", "options_backup_download", "file-down"), pickButton]),
    check.node,
    ...nodes,
  );

  let pending: Backup | undefined;

  function close(): void {
    pending = undefined;
    check.close();
  }

  async function save(): Promise<void> {
    try {
      const file = await createBackupFile(deps);
      deps.files.save(file.name, file.text);
    } catch {
      report(undefined, i18n.t("error_backup_create"));
      return;
    }
    report(i18n.t("notice_backup_downloaded"));
  }

  function openSummary(backup: Backup): void {
    const { created, games, creators } = backup.contents;
    pending = backup;
    const lists = [
      { list: "options_section_allow", entries: games } as const,
      ...CREATOR_ROLES.map((role) => ({ list: LIST_TITLES[role], entries: creators[role] })),
    ];
    const lines = lists.map(({ list, entries }) =>
      i18n.t("options_backup_summary_list", {
        list: i18n.t(list),
        number: String(countEntries([entries])),
      })
    );
    if (backup.skipped > 0) {
      lines.push(i18n.plural("options_backup_summary_skipped", backup.skipped));
    }
    report(undefined);
    check.open(
      i18n.t("options_backup_summary_title", { date: deps.dates.format(new Date(created)) }),
      lines,
    );
  }

  async function read(file: PickedFile): Promise<void> {
    const name = file.name;
    close();
    if (file.size > MAX_BACKUP_SIZE) {
      report(undefined, i18n.t("error_backup_invalid", { name }));
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      report(undefined, i18n.t("error_backup_read", { name }));
      return;
    }
    const reading = readBackup(text);
    switch (reading.kind) {
      case "invalid":
        report(undefined, i18n.t("error_backup_invalid", { name }));
        return;
      case "newer":
        report(undefined, i18n.t("error_backup_newer", { name }));
        return;
      case "backup":
        openSummary(reading);
    }
  }

  async function restore(): Promise<void> {
    if (pending === undefined) {
      return;
    }
    const { contents: backup, skipped } = pending;
    confirm.disabled = true;
    let added: number;
    try {
      ({ added } = await restoreBackup(deps, backup));
    } catch {
      // The check stays open, so the person can try again
      confirm.disabled = false;
      report(undefined, i18n.t("error_backup_restore"));
      return;
    }
    close();
    await deps.onRestored();
    const lines = [i18n.plural("notice_backup_restored", added)];
    if (skipped > 0) {
      lines.push(i18n.plural("notice_backup_skipped", skipped));
    }
    report(lines.join(" "));
    pickButton.focus();
  }

  function handle(target: EventTarget | null): boolean {
    const action = actionOf(target, ACTION_ATTRIBUTE, ACTIONS);
    switch (action) {
      case undefined:
        return false;
      case "save":
        void save();
        break;
      case "pick":
        // Synchronous, inside the click: browsers open a file chooser only for one
        deps.files.pick(i18n.t("options_backup_restore"), (file) => {
          void read(file);
        });
        break;
      case "confirm":
        void restore();
        break;
      case "cancel":
        close();
        report(undefined);
        pickButton.focus();
    }
    return true;
  }

  return { section, handle };
}
