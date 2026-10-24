import * as v from "valibot";
import { MALFORMED } from "../detect/getitems.schema";
import { hasText } from "../detect/notes";
import { type DisclosedBase, NOT_DISCLOSED, UNKNOWN } from "../types";
import type { KindDefinition } from "./kind";
import { DEFAULT_KIND_SETTINGS } from "./kind-settings";
import { WEEK_TTL } from "./kind-ttl";
import { storedDisclosed } from "./stored-disclosed";

/**
 * The disclosed verdict of the anti-cheat kind: software that is not kernel level. The name is
 * the vendor Steam lists, and the token is Steam's own key for it; a custom anti-cheat has neither
 * (its name is on the app page only).
 */
export interface AnticheatDisclosed extends DisclosedBase<"anticheat"> {
  readonly name?: string;
  readonly nameToken?: string;
}

/** An anti-cheat the developer declared without the kernel flag. The kernel kind supersedes it. */
export const ANTICHEAT_KIND: KindDefinition<AnticheatDisclosed> = {
  id: "anticheat",

  fromGetItems(_item, details) {
    const anticheat = details.anticheat;
    if (anticheat === MALFORMED) {
      return UNKNOWN.malformed;
    }
    if (anticheat === undefined || anticheat.kernel_mode === true) {
      return NOT_DISCLOSED.api;
    }
    const { name, name_loc: nameToken } = anticheat;
    return {
      state: "disclosed",
      kind: "anticheat",
      source: "api",
      ...(name !== undefined && hasText(name) ? { name } : {}),
      ...(nameToken !== undefined && hasText(nameToken) ? { nameToken } : {}),
    };
  },

  stored: storedDisclosed("anticheat", {
    name: v.exactOptional(v.string()),
    nameToken: v.exactOptional(v.string()),
  }),

  messages: { heading: "kind_anticheat_heading", chip: "kind_anticheat_chip" },
  defaults: DEFAULT_KIND_SETTINGS,
  ttl: WEEK_TTL,
};
