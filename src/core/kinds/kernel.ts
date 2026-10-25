import * as v from "valibot";
import { MALFORMED } from "../detect/getitems.schema";
import { optionalText } from "../detect/notes";
import { NOT_DISCLOSED, UNKNOWN } from "../types";
import { VENDOR_FIELDS, vendorOf } from "./anticheat-vendor";
import type { KindDefinition } from "./kind";
import { DEFAULT_KIND_SETTINGS } from "./kind-settings";
import { WEEK_TTL } from "./kind-ttl";
import { storedDisclosed } from "./stored-disclosed";

const STORED = storedDisclosed("kernel", {
  ...VENDOR_FIELDS,
  /** False when the anti-cheat leaves files behind after an uninstall. */
  uninstallsCompletely: v.boolean(),
  /** Set when the game needs boot protection, with Steam's key for the kind when it sent one. */
  bootProtection: v.exactOptional(
    v.pipe(v.object({ token: v.exactOptional(v.string()) }), v.readonly()),
  ),
});

/** The disclosed verdict of the kernel-level anti-cheat kind. */
export type KernelDisclosed = v.InferOutput<typeof STORED>;

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
    return {
      state: "disclosed",
      kind: "kernel",
      source: "api",
      ...vendorOf(anticheat),
      uninstallsCompletely: anticheat.uninstall_completely === true,
      ...(anticheat.boot_protection === true
        ? { bootProtection: optionalText("token", anticheat.boot_protection_name) }
        : {}),
    };
  },

  stored: STORED,

  messages: { heading: "kind_kernel_heading", chip: "kind_kernel_chip" },
  defaults: DEFAULT_KIND_SETTINGS,
  ttl: WEEK_TTL,
};
