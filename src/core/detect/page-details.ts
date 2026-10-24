import { trimNotes } from "./notes";

// The page shows what GetItems omits (ADR 0010): a custom anti-cheat name, the boot line, the
// DRM activation limit. Store pages are localized. Nothing here reads notice words, only
// elements, their order and the text GetItems gave.

const FEATURES = "#category_block";
const ANTICHEAT_LINE = ".anticheat_section .anticheat_name";
const NOTICE = ".DRM_notice";
const ANTICHEAT_SECTION_CLASS = "anticheat_section";
const TEXT_NODE = 3;

/** What the app page adds to the verdicts, in the words of the page's language. */
export interface PageDetails {
  /** The anti-cheat's name when it is a custom one, which GetItems leaves out. */
  readonly anticheatName?: string;
  /** The whole boot protection line: its label and the requirement. */
  readonly bootProtection?: string;
  /** The DRM activation limit line. */
  readonly activationLimit?: string;
}

/** What GetItems says about the game, which tells the page's lines apart. */
export interface PageInput {
  /** The anti-cheat declared boot protection, so its last line is the boot protection line. */
  readonly bootProtection: boolean;
  /** The DRM text GetItems gave, or undefined when the game declared no DRM. */
  readonly drmText: string | undefined;
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
 * The anti-cheat lines in document order, without the empty ones. The boot protection line is
 * the last of at least two lines, after the name line. Without boot protection, the first line
 * is the name.
 */
function anticheatDetails(features: Element, bootProtection: boolean): PageDetails {
  const names: string[] = [];
  const full: string[] = [];
  for (const line of features.querySelectorAll(ANTICHEAT_LINE)) {
    const name = lineName(line);
    if (name !== "") {
      names.push(name);
      full.push(trimNotes(line.textContent));
    }
  }
  const [first] = names;
  const hasBootLine = bootProtection && full.length >= 2;
  const boot = hasBootLine ? full.at(-1) : undefined;
  const custom = bootProtection && !hasBootLine ? undefined : first;
  return {
    ...(custom === undefined ? {} : { anticheatName: custom }),
    ...(boot === undefined ? {} : { bootProtection: boot }),
  };
}

/**
 * The limit is the text after the `<br>` in a notice of a text, a `<br>` and a text.
 * Only a notice whose first text holds the GetItems DRM text counts. A line break in an account
 * text then cannot read as a limit.
 */
function activationLimit(features: Element, drmText: string | undefined): string | undefined {
  const drm = trimNotes(drmText ?? "");
  if (drm === "") {
    return undefined;
  }
  for (const notice of features.querySelectorAll(NOTICE)) {
    const lineBreak = notice.firstElementChild;
    const before = lineBreak?.previousSibling;
    if (
      notice.children.length !== 1 || lineBreak?.tagName !== "BR"
      || notice.classList.contains(ANTICHEAT_SECTION_CLASS) || notice.hasAttribute("role")
      || before?.nodeType !== TEXT_NODE || !(before.textContent ?? "").includes(drm)
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
 * The page-only details of the app page `doc`, read from its features list. A page without that
 * list gives none.
 */
export function parsePageDetails(doc: Document, input: PageInput): PageDetails {
  const features = doc.querySelector(FEATURES);
  if (features === null) {
    return {};
  }
  const limit = activationLimit(features, input.drmText);
  return {
    ...anticheatDetails(features, input.bootProtection),
    ...(limit === undefined ? {} : { activationLimit: limit }),
  };
}
