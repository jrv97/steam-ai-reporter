import { compatKind } from "./compat";

/** Steam Machine Compatibility, as Valve rates it. */
export const MACHINE_KIND = compatKind("machine", "steam_machine_compat_category", {
  heading: "kind_machine_heading",
  chip: "kind_machine_chip",
});
