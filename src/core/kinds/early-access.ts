import * as v from "valibot";
import { MALFORMED } from "../detect/getitems.schema";
import { optionalText, trimNotes } from "../detect/notes";
import { NOT_DISCLOSED, UNKNOWN } from "../types";
import type { KindDefinition } from "./kind";
import { DEFAULT_KIND_SETTINGS } from "./kind-settings";
import { DAY_MS } from "./kind-ttl";
import { storedDisclosed } from "./stored-disclosed";

const STORED = storedDisclosed("earlyaccess", {
  /** The developer's explanation of why the game is in Early Access, trimmed, verbatim inside. */
  note: v.exactOptional(v.pipe(v.string(), v.minLength(1))),
  /** The Steam release date, a Unix time in seconds (`release.steam_release_date`). */
  released: v.exactOptional(v.pipe(v.number(), v.integer(), v.minValue(0))),
});

/**
 * The disclosed verdict of the Early Access kind. `updated`, the time of the developer's latest
 * update post, is read from the open app page and never stored (ADR 0018).
 */
export type EarlyAccessDisclosed = v.InferOutput<typeof STORED> & {
  readonly updated?: number;
};

/**
 * Early Access, from the item's own flag. Steam leaves the flag out of every other item, so an
 * item with details and no flag is not disclosed. The note and the release date only add detail,
 * and the note is read for a flagged item alone, since it outlives Early Access (ADR 0018).
 */
export const EARLY_ACCESS_KIND: KindDefinition<EarlyAccessDisclosed> = {
  id: "earlyaccess",
  sections: ["release"],

  fromGetItems(item, details) {
    const flag = item.is_early_access;
    if (flag === MALFORMED) {
      return UNKNOWN.malformed;
    }
    if (flag !== true) {
      return NOT_DISCLOSED.api;
    }
    const released = item.release?.steam_release_date;
    return {
      state: "disclosed",
      kind: "earlyaccess",
      source: "api",
      ...optionalText("note", trimNotes(details.early_access?.why_bbcode ?? "")),
      ...(released === undefined ? {} : { released }),
    };
  },

  stored: STORED,

  messages: { heading: "kind_earlyaccess_heading", chip: "kind_earlyaccess_chip" },
  // Few games are in Early Access and the page already opens with Steam's own box, so no banner.
  defaults: { ...DEFAULT_KIND_SETTINGS, banner: false },
  // A game that leaves Early Access loses its chip within two days; a new one is rare.
  ttl: { disclosed: 2 * DAY_MS, notDisclosed: 7 * DAY_MS },
};
