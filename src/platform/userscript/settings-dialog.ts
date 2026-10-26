import type { Catalogs } from "../../core/i18n/catalog";
import type { I18n } from "../../core/i18n/t";
import type { IgnoreLists } from "../../core/ignored";
import type { Clock } from "../../core/ports";
import type { StoredSettings } from "../../core/settings/settings-source";
import { mountSettingsForm } from "../../core/ui/settings-form";
import { adoptStyles, DIALOG_CSS } from "../../core/ui/styles";
import type { UiState } from "../../core/ui/ui-state";
import { createFileTransfer } from "../shared/file-transfer";

export interface SettingsDialogDeps {
  readonly document: Document;
  readonly i18n: I18n;
  readonly catalogs: Catalogs;
  readonly settings: StoredSettings;
  readonly lists: IgnoreLists;
  /** The tab last shown, kept in the manager's storage. */
  readonly uiState: UiState;
  /** Dates a backup. */
  readonly clock: Clock;
  /** False when the manager cannot tell other tabs about a change, so it applies on reload. */
  readonly live: boolean;
}

const HOST_CLASS = "sar-dialog-host";
const CLOSE_ATTRIBUTE = "data-sar-close";

/**
 * Opens the settings in a modal `dialog` inside a shadow root, so store CSS cannot reach it and
 * its CSS cannot leak. Escape, the close button and a click on the backdrop close it; focus goes
 * back to where it was. Opening it twice does nothing.
 */
export async function openSettingsDialog(deps: SettingsDialogDeps): Promise<void> {
  const { document: doc, i18n } = deps;
  if (doc.querySelector(`.${HOST_CLASS}`) !== null) {
    return;
  }
  const opener = doc.activeElement;

  const host = doc.createElement("div");
  host.className = HOST_CLASS;
  const shadow = host.attachShadow({ mode: "open" });
  adoptStyles(shadow, DIALOG_CSS);

  const dialog = doc.createElement("dialog");
  const title = doc.createElement("h1");
  title.className = "sar-dialog-title";
  title.id = "sar-dialog-title";
  title.textContent = i18n.t("ext_name");
  dialog.setAttribute("aria-labelledby", title.id);

  const close = doc.createElement("button");
  close.type = "button";
  close.className = "sar-button";
  close.setAttribute(CLOSE_ATTRIBUTE, "");
  close.textContent = i18n.t("userscript_close");

  const head = doc.createElement("div");
  head.className = "sar-dialog-head";
  head.append(title, close);

  const formRoot = doc.createElement("div");
  const body = doc.createElement("div");
  body.className = "sar-dialog-body";
  body.append(formRoot);
  dialog.append(head, body);
  if (!deps.live) {
    const note = doc.createElement("p");
    note.className = "sar-dialog-note";
    note.textContent = i18n.t("userscript_reload_note");
    dialog.append(note);
  }
  shadow.append(dialog);
  doc.body.append(host);

  const form = await mountSettingsForm(formRoot, {
    i18n,
    settings: deps.settings,
    lists: deps.lists,
    uiState: deps.uiState,
    context: "popup",
    colors: true,
    locales: Object.keys(deps.catalogs),
    // The page around a modal dialog is inert, so the file input lives inside it
    backup: { files: createFileTransfer(dialog), clock: deps.clock },
  });

  // The close button and the backdrop (a click on the dialog itself) share one listener
  dialog.addEventListener("click", (event) => {
    const target = event.target;
    const onClose = target instanceof Element && target.closest(`[${CLOSE_ATTRIBUTE}]`) !== null;
    if (onClose || target === dialog) {
      dialog.close();
    }
  });
  dialog.addEventListener("close", () => {
    form.destroy();
    host.remove();
    if (opener instanceof HTMLElement) {
      opener.focus();
    }
  });
  dialog.showModal();
  close.focus();
}
