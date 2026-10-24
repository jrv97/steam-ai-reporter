import * as v from "valibot";
import type { ExtraDetails, MALFORMED } from "../detect/getitems.schema";
import { optionalText } from "../detect/notes";

/** The anti-cheat object of a game that declared one, as the kernel and anti-cheat kinds read. */
export type Anticheat = Exclude<ExtraDetails["anticheat"], typeof MALFORMED | undefined>;

/** The stored fields that name the vendor, the same for a kernel and for another anti-cheat. */
export const VENDOR_FIELDS = {
  /** The vendor Steam lists; a custom anti-cheat has none, and its name is on the page only. */
  name: v.exactOptional(v.string()),
  /** Steam's own key for the vendor. */
  nameToken: v.exactOptional(v.string()),
};

/** The vendor name and token of the anti-cheat, the ones that have text. */
export function vendorOf(anticheat: Anticheat): { name?: string; nameToken?: string; } {
  return {
    ...optionalText("name", anticheat.name),
    ...optionalText("nameToken", anticheat.name_loc),
  };
}
