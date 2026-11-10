import { createElement } from "./element";
import { withIcon } from "./icon";
import type { LucideName } from "./lucide";

// The parts the General cards with actions share: Backup, Lookup results and Reset. Each card
// names its buttons' actions in an attribute of its own, and the form's one click listener on its
// root hands it each click (rule 13).

/** A card of General with buttons. */
export interface ActionCard {
  readonly section: HTMLElement;
  /** Runs the action of the clicked button when it is one of the card's; true then. */
  handle(target: EventTarget | null): boolean;
}

/** The action that the clicked element's button names in `attribute`, if it is one of `actions`. */
export function actionOf<A extends string>(
  target: EventTarget | null,
  attribute: string,
  actions: readonly A[],
): A | undefined {
  const value = target instanceof Element
    ? target.closest(`[${attribute}]`)?.getAttribute(attribute)
    : undefined;
  return actions.find((action) => action === value);
}

/** A secondary button with its text, and with a Lucide icon before it when given. */
export function cardButton(doc: Document, text: string, icon?: LucideName): HTMLButtonElement {
  const button = createElement(doc, "button", "tks-button");
  button.type = "button";
  if (icon === undefined) {
    button.textContent = text;
  } else {
    withIcon(button, icon, text);
  }
  return button;
}

/** A wrapping row of buttons; `end` puts it on the right, as the store's dialogs do. */
export function cardActions(
  doc: Document,
  buttons: readonly HTMLButtonElement[],
  end = false,
): HTMLElement {
  const row = createElement(doc, "div", "tks-card-actions");
  if (end) {
    row.setAttribute("data-tks-align", "end");
  }
  row.append(...buttons);
  return row;
}

/** A line of help or a note in a card. */
export function cardHelp(doc: Document, text: string): HTMLElement {
  return createElement(doc, "p", "tks-card-help", text);
}

/** The check a card opens before it changes anything. */
export interface ConfirmBox {
  /** The sunken box, hidden until `open`. */
  readonly node: HTMLElement;
  /** Fills the title and the list, shows the box and moves focus to its title. */
  open(title: string, lines: readonly string[]): void;
  close(): void;
}

interface ConfirmSpec {
  /** The id of the box's title, which takes focus without being a tab stop. */
  readonly id: string;
  /** The primary button, then Cancel. */
  readonly confirm: HTMLButtonElement;
  readonly cancel: HTMLButtonElement;
  /** A line under the list, when the check needs one. */
  readonly note?: string;
}

/** A check box: a title, a list of what the action does, an optional note and the two buttons. */
export function createConfirmBox(doc: Document, spec: ConfirmSpec): ConfirmBox {
  const title = createElement(doc, "p", "tks-confirm-title");
  title.id = spec.id;
  title.tabIndex = -1;
  const list = createElement(doc, "ul", "tks-confirm-list");
  spec.confirm.setAttribute("data-tks-variant", "primary");
  const node = createElement(doc, "div", "tks-confirm");
  node.setAttribute("role", "group");
  node.setAttribute("aria-labelledby", title.id);
  node.hidden = true;
  node.append(
    title,
    list,
    ...(spec.note === undefined ? [] : [cardHelp(doc, spec.note)]),
    cardActions(doc, [spec.confirm, spec.cancel], true),
  );
  return {
    node,
    open(text, lines) {
      title.textContent = text;
      list.replaceChildren(...lines.map((line) => createElement(doc, "li", "", line)));
      node.hidden = false;
      title.focus();
    },
    close() {
      node.hidden = true;
      spec.confirm.disabled = false;
    },
  };
}

/** The status line and the error line under a card's buttons. */
export interface CardReport {
  readonly nodes: readonly HTMLElement[];
  /** Shows a result, an error or both, and hides what it is not given. A result is also said. */
  readonly report: (result: string | undefined, failure?: string) => void;
}

export function createCardReport(doc: Document, announce: (text: string) => void): CardReport {
  const status = createElement(doc, "p", "tks-card-status");
  const error = createElement(doc, "p", "tks-field-error");
  error.setAttribute("role", "alert");
  status.hidden = true;
  error.hidden = true;

  function show(node: HTMLElement, text: string | undefined): void {
    node.hidden = text === undefined;
    node.textContent = text ?? "";
  }

  return {
    nodes: [status, error],
    report: (result, failure) => {
      show(status, result);
      show(error, failure);
      if (result !== undefined) {
        announce(result);
      }
    },
  };
}

/** A card titled by a heading that takes focus without being a tab stop. */
export function actionCard(doc: Document, title: string, id: string): HTMLElement {
  const section = createElement(doc, "section", "tks-card");
  const heading = createElement(doc, "h3", "tks-card-title", title);
  heading.id = id;
  heading.tabIndex = -1;
  section.setAttribute("aria-labelledby", heading.id);
  section.append(heading);
  return section;
}
