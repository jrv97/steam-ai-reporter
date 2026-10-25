import * as v from "valibot";
import { MALFORMED } from "../detect/getitems.schema";
import { hasText } from "../detect/notes";
import { NOT_DISCLOSED, UNKNOWN } from "../types";
import type { KindDefinition } from "./kind";
import { DEFAULT_KIND_SETTINGS } from "./kind-settings";
import { WEEK_TTL } from "./kind-ttl";
import { storedDisclosed } from "./stored-disclosed";

const STORED = storedDisclosed("account", {
  /** What the developer typed in `user_account_third_party`. */
  text: v.pipe(v.string(), v.minLength(1)),
  /** The account can be linked to a Steam account. */
  linksToSteam: v.boolean(),
});

/** The disclosed verdict of the third-party account kind. */
export type AccountDisclosed = v.InferOutput<typeof STORED>;

/** A third-party account the game requires. Free text, like the launcher it names. */
export const ACCOUNT_KIND: KindDefinition<AccountDisclosed> = {
  id: "account",

  fromGetItems(_item, details) {
    const { user_account_third_party: text, user_account_third_party_link_to_steam: link } =
      details;
    if (text === MALFORMED) {
      return UNKNOWN.malformed;
    }
    if (text === undefined || !hasText(text)) {
      return NOT_DISCLOSED.api;
    }
    return {
      state: "disclosed",
      kind: "account",
      source: "api",
      text,
      linksToSteam: link === true,
    };
  },

  stored: STORED,

  messages: { heading: "kind_account_heading", chip: "kind_account_chip" },
  defaults: DEFAULT_KIND_SETTINGS,
  ttl: WEEK_TTL,
};
