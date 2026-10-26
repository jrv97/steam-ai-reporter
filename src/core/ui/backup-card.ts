import * as v from "valibot";
import { type BackupDeps, createBackupFile, restoreBackup } from "../backup/backup";
import { type BackupReading, countEntries, MAX_BACKUP_SIZE, readBackup } from "../backup/format";
import { CREATOR_ROLES, type CreatorRole } from "../creator";
import type { BareMessageKey } from "../i18n/t";
import type { FileTransfer, MessageCatalog, PickedFile } from "../ports";

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
const ACTION_ATTRIBUTE = "data-sar-backup";
const ACTIONS = ["save", "pick", "confirm", "cancel"] as const;
type Action = (typeof ACTIONS)[number];
const ActionSchema = v.picklist(ACTIONS);

type Backup = Extract<BackupReading, { kind: "backup"; }>;

const LIST_TITLES = {
  developer: "options_section_allow_developers",
  publisher: "options_section_allow_publishers",
} as const satisfies Record<CreatorRole, BareMessageKey>;

/**
 * The Backup card: download a file of the settings and ignore lists, or pick one and restore it
 * after a check that shows its date and contents. File text only ever reaches `textContent`. One
 * click listener on the card serves its buttons.
 */
export function createBackupCard(doc: Document, deps: BackupCardDeps): HTMLElement {
  const { i18n, idPrefix } = deps;

  function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text?: string,
  ): HTMLElementTagNameMap[K] {
    const node = doc.createElement(tag);
    node.className = className;
    node.textContent = text ?? "";
    return node;
  }

  function button(action: Action, label: BareMessageKey): HTMLButtonElement {
    const node = element("button", "sar-button", i18n.t(label));
    node.type = "button";
    node.setAttribute(ACTION_ATTRIBUTE, action);
    return node;
  }

  /** A title that focus can land on without being a tab stop. */
  function focusTarget(node: HTMLElement, id: string): HTMLElement {
    node.id = idPrefix + id;
    node.tabIndex = -1;
    return node;
  }

  const section = element("section", "sar-card");
  const title = focusTarget(
    element("h3", "sar-card-title", i18n.t("options_section_backup")),
    "backup",
  );
  section.setAttribute("aria-labelledby", title.id);
  const pickButton = button("pick", "options_backup_restore");
  const actions = element("div", "sar-backup-actions");
  actions.append(button("save", "options_backup_download"), pickButton);

  const summaryTitle = focusTarget(element("p", "sar-backup-summary-title"), "backup-summary");
  const contents = element("ul", "sar-backup-contents");
  const confirm = button("confirm", "options_backup_confirm");
  confirm.setAttribute("data-sar-variant", "primary");
  const choices = element("div", "sar-backup-actions");
  choices.setAttribute("data-sar-align", "end");
  choices.append(confirm, button("cancel", "options_backup_cancel"));
  const summary = element("div", "sar-backup-summary");
  summary.setAttribute("role", "group");
  summary.setAttribute("aria-labelledby", summaryTitle.id);
  summary.hidden = true;
  summary.append(
    summaryTitle,
    contents,
    element("p", "sar-backup-note", i18n.t("options_backup_restore_note")),
    choices,
  );

  const status = element("p", "sar-backup-status");
  const error = element("p", "sar-field-error");
  error.setAttribute("role", "alert");
  status.hidden = true;
  error.hidden = true;
  section.append(
    title,
    element("p", "sar-backup-help", i18n.t("options_backup_help")),
    actions,
    summary,
    status,
    error,
  );

  let pending: Backup | undefined;

  function show(node: HTMLElement, text: string | undefined): void {
    node.hidden = text === undefined;
    node.textContent = text ?? "";
  }

  /** Shows a result or an error, never both; a result is also said aloud. */
  function report(result: string | undefined, failure?: string): void {
    show(status, result);
    show(error, failure);
    if (result !== undefined) {
      deps.announce(result);
    }
  }

  function close(): void {
    pending = undefined;
    summary.hidden = true;
    confirm.disabled = false;
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
    summaryTitle.textContent = i18n.t("options_backup_summary_title", {
      date: deps.dates.format(new Date(created)),
    });
    const lists = [
      { list: "options_section_allow", entries: games } as const,
      ...CREATOR_ROLES.map((role) => ({ list: LIST_TITLES[role], entries: creators[role] })),
    ];
    const lines = lists.map(({ list, entries }) =>
      element(
        "li",
        "",
        i18n.t("options_backup_summary_list", {
          list: i18n.t(list),
          number: String(countEntries([entries])),
        }),
      )
    );
    if (backup.skipped > 0) {
      lines.push(element("li", "", i18n.plural("options_backup_summary_skipped", backup.skipped)));
    }
    contents.replaceChildren(...lines);
    report(undefined);
    summary.hidden = false;
    summaryTitle.focus();
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

  section.addEventListener("click", (event) => {
    const target = event.target instanceof Element
      ? event.target.closest(`[${ACTION_ATTRIBUTE}]`)
      : null;
    const action = v.safeParse(ActionSchema, target?.getAttribute(ACTION_ATTRIBUTE));
    if (!action.success) {
      return;
    }
    switch (action.output) {
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
  });

  return section;
}
