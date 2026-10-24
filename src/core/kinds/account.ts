import * as v from "valibot";
import { MALFORMED } from "../detect/getitems.schema";
import { hasText } from "../detect/notes";
import { type DisclosedBase, NOT_DISCLOSED, UNKNOWN } from "../types";
import { BORROWED_MESSAGES } from "./borrowed-messages";
import type { KindDefinition } from "./kind";
import { DEFAULT_KIND_SETTINGS } from "./kind-settings";
import { storedDisclosed } from "./stored-disclosed";

/**
 * The disclosed verdict of the third-party account kind. The text is what the developer typed in
 * `user_account_third_party`; the flag says the account can be linked to a Steam account.
 */
export interface AccountDisclosed extends DisclosedBase<"account"> {
  readonly text: string;
  readonly linksToSteam: boolean;
}

/** A third-party account the game requires. Free text, like the launcher it names. */
export const ACCOUNT_KIND: KindDefinition<AccountDisclosed> = {
  id: "account",

  fromGetItems(_item, details) {
    const { user_account_third_party: text, user_account_third_party_link_to_steam: link } =
      details;
    if (text === MALFORMED || link === MALFORMED) {
      return UNKNOWN.error;
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

  stored: storedDisclosed("account", {
    text: v.pipe(v.string(), v.minLength(1)),
    linksToSteam: v.boolean(),
  }),

  messages: BORROWED_MESSAGES,
  defaults: DEFAULT_KIND_SETTINGS,
};
