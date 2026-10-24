import { trimNotes } from "./notes";

// What the live app page shows and GetItems omits (ADR 0010): the custom anti-cheat name, the boot
// protection line and the DRM activation limit. Store pages are localized, so nothing here reads
// the words of a notice; only the elements and their order.

const ANTICHEAT_LINE = ".anticheat_section .anticheat_name";
const NOTICE = ".DRM_notice";
const ANTICHEAT_SECTION_CLASS = "anticheat_section";
const TEXT_NODE = 3;

/** What the app page adds to the verdicts, in the words of the page's language. */
export interface PageDetails {
  /** The anti-cheat's name when it is a custom one, which GetItems leaves out. */
  readonly anticheatName?: string;
  /** The whole boot protection line, such as its label and the requirement. */
  readonly bootProtection?: string;
  /** The DRM activation limit line. */
  readonly activationLimit?: string;
}

/** The text of an anti-cheat line without its removal note, the nested `.anticheat_uninstalls`. */
function lineName(line: Element): string {
  let text = "";
  for (const node of line.childNodes) {
    if (node.nodeType === TEXT_NODE) {
      text += node.textContent ?? "";
    }
  }
  return trimNotes(text);
}

/**
 * The anti-cheat lines in document order. A kernel anti-cheat with boot protection shows the name
 * line, if it has a name, and then the boot protection line, so with `bootProtection` set the last
 * line is the boot one and an earlier line is the name. Without it the first line is the name.
 */
function anticheatDetails(doc: Document, bootProtection: boolean): PageDetails {
  const names: string[] = [];
  const full: string[] = [];
  for (const line of doc.querySelectorAll(ANTICHEAT_LINE)) {
    const name = lineName(line);
    if (name !== "") {
      names.push(name);
      full.push(trimNotes(line.textContent));
    }
  }
  const boot = bootProtection ? full.at(-1) : undefined;
  const name = names.at(bootProtection ? -2 : 0);
  return {
    ...(name === undefined ? {} : { anticheatName: name }),
    ...(boot === undefined ? {} : { bootProtection: boot }),
  };
}

/**
 * The activation limit: the text after the one `<br>` of a plain DRM notice. The notice with a
 * limit is the only one made of a text, a `<br>` and a text; the account, EULA, anti-cheat and AI
 * service notices hold links, blocks or no `<br>`.
 */
function activationLimit(doc: Document): string | undefined {
  for (const notice of doc.querySelectorAll(NOTICE)) {
    const lineBreak = notice.firstElementChild;
    if (
      notice.children.length !== 1 || lineBreak?.tagName !== "BR"
      || notice.classList.contains(ANTICHEAT_SECTION_CLASS) || notice.hasAttribute("role")
    ) {
      continue;
    }
    const after = lineBreak.nextSibling;
    const limit = after?.nodeType === TEXT_NODE ? trimNotes(after.textContent ?? "") : "";
    if (limit !== "") {
      return limit;
    }
  }
  return undefined;
}

/**
 * The page-only details of the app page `doc`. `bootProtection` says the game declared boot
 * protection (its GetItems anti-cheat has the flag), which tells the boot line from the name line.
 */
export function parsePageDetails(doc: Document, bootProtection: boolean): PageDetails {
  const limit = activationLimit(doc);
  return {
    ...anticheatDetails(doc, bootProtection),
    ...(limit === undefined ? {} : { activationLimit: limit }),
  };
}
