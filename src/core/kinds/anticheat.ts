import type * as v from "valibot";
import { MALFORMED } from "../detect/getitems.schema";
import { NOT_DISCLOSED, UNKNOWN } from "../types";
import { VENDOR_FIELDS, vendorOf } from "./anticheat-vendor";
import type { KindDefinition } from "./kind";
import { DEFAULT_KIND_SETTINGS } from "./kind-settings";
import { WEEK_TTL } from "./kind-ttl";
import { storedDisclosed } from "./stored-disclosed";

const STORED = storedDisclosed("anticheat", VENDOR_FIELDS);

/** The disclosed verdict of the anti-cheat kind: software that is not kernel level. */
export type AnticheatDisclosed = v.InferOutput<typeof STORED>;

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
    return { state: "disclosed", kind: "anticheat", source: "api", ...vendorOf(anticheat) };
  },

  stored: STORED,

  messages: { heading: "kind_anticheat_heading", chip: "kind_anticheat_chip" },
  defaults: DEFAULT_KIND_SETTINGS,
  ttl: WEEK_TTL,
};
