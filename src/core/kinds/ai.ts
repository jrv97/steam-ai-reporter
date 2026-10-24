import * as v from "valibot";
import { type ExtraDetails, MALFORMED, type StoreItem } from "../detect/getitems.schema";
import { optionalText, trimNotes } from "../detect/notes";
import { type SteamLanguage, SteamLanguageSchema } from "../i18n/locale";
import type { BareMessageKey } from "../i18n/t";
import { NOT_DISCLOSED, UNKNOWN, type Verdict } from "../types";
import type { KindDefinition, KindMessages } from "./kind";
import { DEFAULT_KIND_SETTINGS } from "./kind-settings";
import { DAY_MS, HOUR_MS } from "./kind-ttl";
import { storedDisclosed } from "./stored-disclosed";

const STORED = storedDisclosed("ai", {
  /** The developer's text, trimmed of outer whitespace and zero-width characters only. */
  notes: v.pipe(v.string(), v.minLength(1)),
  /** The Steam language the notes were requested in; Steam answers in English when untranslated. */
  language: SteamLanguageSchema,
  /** `ai_generation_service.name`, when the developer named one. */
  service: v.exactOptional(v.string()),
  /** The app's store name, for the allow-list. */
  name: v.exactOptional(v.string()),
});

/** The disclosed verdict of the AI kind: the developer's notes and, when named, the service. */
export type AiDisclosed = v.InferOutput<typeof STORED>;

/** The AI kind's verdict: disclosed with notes, not disclosed, or unknown. */
export type AiVerdict = Verdict<AiDisclosed>;

/** Steam's own heading of the AI block; the mature content block uses the same element ID. */
const DISCLOSURE_HEADING = "AI Generated Content Disclosure";
const BLOCK_SELECTOR = "#game_area_content_descriptors";
const NOTES_SELECTOR = "p > i";

/** The notes of the AI block among the blocks sharing the ID, or undefined when there is none. */
function disclosureNotes(doc: Document): string | undefined {
  for (const block of doc.querySelectorAll(BLOCK_SELECTOR)) {
    if (block.querySelector("h2")?.textContent.trim() === DISCLOSURE_HEADING) {
      return trimNotes(block.querySelector(NOTES_SELECTOR)?.textContent ?? "");
    }
  }
  return undefined;
}

function fromGetItems(item: StoreItem, details: ExtraDetails, language: SteamLanguage): AiVerdict {
  const { content_survey_ai_notes: rawNotes, ai_generation_service: rawService } = details;
  if (rawNotes === MALFORMED || rawService === MALFORMED || item.name === MALFORMED) {
    return UNKNOWN.malformed;
  }
  const notes = trimNotes(rawNotes ?? "");
  if (notes === "") {
    return NOT_DISCLOSED.api;
  }
  return {
    state: "disclosed",
    kind: "ai",
    notes,
    language,
    source: "api",
    ...optionalText("service", trimNotes(rawService?.name ?? "")),
    ...optionalText("name", trimNotes(item.name ?? "")),
  };
}

/**
 * The page has no block for a game that disclosed nothing, or an empty one: not disclosed. Notes
 * keep their line breaks: each `<br>` is followed by a newline in the source.
 */
function fromAppPage(doc: Document, name: string): AiVerdict {
  const notes = disclosureNotes(doc);
  if (notes === undefined || notes === "") {
    return NOT_DISCLOSED.html;
  }
  return { state: "disclosed", kind: "ai", notes, language: "english", source: "html", name };
}

/** The words only the AI surfaces use: the banner, the settings page and the popup. */
export interface AiMessages extends KindMessages {
  /** In the banner, precedes the product the developer named. */
  readonly bannerService: BareMessageKey;
  /** Screen reader name of the banner's one-line note. */
  readonly bannerRegion: BareMessageKey;
  /** Label of the badges switch in the settings page and in the popup. */
  readonly badgesSwitch: BareMessageKey;
  readonly badgesSwitchShort: BareMessageKey;
  /** Label of the list filter choice. */
  readonly filterLabel: BareMessageKey;
}

/** The AI kind with its own type, for the screens that draw it. */
export interface AiKind extends KindDefinition<AiDisclosed> {
  readonly messages: AiMessages;
}

/** Generative AI use that the developer reported on Steam's content survey. */
export const AI_KIND: AiKind = {
  id: "ai",
  fromGetItems,
  fromAppPage,

  stored: STORED,

  messages: {
    heading: "kind_ai_heading",
    chip: "kind_ai_chip",
    bannerService: "banner_service_label",
    bannerRegion: "kind_ai_heading",
    badgesSwitch: "options_badges",
    badgesSwitchShort: "options_badges_short",
    filterLabel: "options_filter_label",
  },

  defaults: DEFAULT_KIND_SETTINGS,
  // A disclosure rarely goes away; a missing one can appear.
  ttl: { disclosed: 7 * DAY_MS, notDisclosed: 12 * HOUR_MS },
};
