import type { BareMessageKey } from "../i18n/t";
import type { KindId } from "../kinds/id";
import type { TagKind } from "../kinds/kind";
import type { MessageCatalog } from "../ports";
import type { ChipText } from "./kind-details";

/** A kind's words where the settings navigate (ADR 0023). */
interface KindKey {
  /** Our short name for the kind: the tab label, the Tag order row and the popup row. */
  readonly key: BareMessageKey;
  /** The quieter line under the key in the tabs and the Tag order rows; the heading when absent. */
  readonly description?: BareMessageKey;
}

/**
 * Every kind's key, beside the kind definitions so the store pages' bundle carries none of these
 * words. The record type makes a new kind fail the type check until it has an entry.
 */
const KIND_KEYS: Readonly<Record<KindId, KindKey>> = {
  ai: { key: "kind_ai_key" },
  earlyaccess: { key: "kind_earlyaccess_key", description: "kind_earlyaccess_description" },
  family: { key: "kind_family_key", description: "kind_family_description" },
  iap: { key: "kind_iap_key", description: "kind_iap_description" },
  drm: { key: "kind_drm_key" },
  pvp: { key: "kind_pvp_key", description: "kind_pvp_description" },
  account: { key: "kind_account_key" },
  eula: { key: "kind_eula_key" },
  deck: { key: "kind_deck_key" },
  machine: { key: "kind_machine_key" },
  anticheat: { key: "kind_anticheat_key" },
  kernel: { key: "kind_kernel_key" },
};

/**
 * A kind's key, shown, and the accessible name that starts with it: the key, then Steam's heading,
 * said once when they match. Label in name, WCAG 2.5.3.
 */
export function keyText(i18n: MessageCatalog, kind: TagKind): ChipText {
  const label = i18n.t(KIND_KEYS[kind.id].key);
  const heading = i18n.t(kind.messages.heading);
  return {
    label,
    name: label === heading ? label : i18n.t("kind_chip_name", { chip: label, heading }),
  };
}

/** The line under a kind's key: its own description, or Steam's heading. */
export function keyDescription(i18n: MessageCatalog, kind: TagKind): string {
  return i18n.t(KIND_KEYS[kind.id].description ?? kind.messages.heading);
}
