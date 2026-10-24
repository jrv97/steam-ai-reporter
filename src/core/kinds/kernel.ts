import * as v from "valibot";
import { MALFORMED } from "../detect/getitems.schema";
import { hasText } from "../detect/notes";
import { type DisclosedBase, NOT_DISCLOSED, UNKNOWN } from "../types";
import type { KindDefinition } from "./kind";
import { DEFAULT_KIND_SETTINGS } from "./kind-settings";
import { WEEK_TTL } from "./kind-ttl";
import { storedDisclosed } from "./stored-disclosed";

/**
 * The disclosed verdict of the kernel-level anti-cheat kind. The name and the token are Steam's
 * for a listed vendor; a custom anti-cheat has neither (its name is on the app page only).
 * `bootProtection` is set when the game needs boot protection, with Steam's key for the kind.
 */
export interface KernelDisclosed extends DisclosedBase<"kernel"> {
  readonly name?: string;
  readonly nameToken?: string;
  /** False when the anti-cheat leaves files behind after an uninstall. */
  readonly uninstallsCompletely: boolean;
  readonly bootProtection?: { readonly token?: string; };
}

/** An anti-cheat that runs at kernel level, as Steam's own `kernel_mode` flag says. */
export const KERNEL_KIND: KindDefinition<KernelDisclosed> = {
  id: "kernel",

  fromGetItems(_item, details) {
    const anticheat = details.anticheat;
    if (anticheat === MALFORMED) {
      return UNKNOWN.malformed;
    }
    if (anticheat?.kernel_mode !== true) {
      return NOT_DISCLOSED.api;
    }
    const { name, name_loc: nameToken, boot_protection_name: bootToken } = anticheat;
    return {
      state: "disclosed",
      kind: "kernel",
      source: "api",
      ...(name !== undefined && hasText(name) ? { name } : {}),
      ...(nameToken !== undefined && hasText(nameToken) ? { nameToken } : {}),
      uninstallsCompletely: anticheat.uninstall_completely === true,
      ...(anticheat.boot_protection === true
        ? {
          bootProtection: bootToken !== undefined && hasText(bootToken) ? { token: bootToken } : {},
        }
        : {}),
    };
  },

  stored: storedDisclosed("kernel", {
    name: v.exactOptional(v.string()),
    nameToken: v.exactOptional(v.string()),
    uninstallsCompletely: v.boolean(),
    bootProtection: v.exactOptional(v.object({ token: v.exactOptional(v.string()) })),
  }),

  messages: { heading: "kind_kernel_heading", chip: "kind_kernel_chip" },
  defaults: DEFAULT_KIND_SETTINGS,
  ttl: WEEK_TTL,
};
