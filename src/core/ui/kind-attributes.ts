import type { KindId } from "../kinds/id";
import { effectiveSettings, type KindSettings } from "../kinds/kind-settings";
import { KINDS } from "../kinds/registry";

/** On a chip and on the summary row: the id of the kind they show. */
export const KIND_ATTRIBUTE = "data-sar-kind";

/** The root attribute that holds a kind's list filter: `off`, `dim` or `hide`. */
export function filterAttribute(id: KindId): string {
  return `data-sar-filter-${id}`;
}

/** Sets the attribute unless it holds the value already, so a repeated draw mutates nothing. */
export function setAttributeOnce(element: Element, name: string, value: string): void {
  if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value);
  }
}

/**
 * Writes every kind's list filter on the root element, from the settings that take effect (a
 * disabled kind filters nothing). The style rules match these attributes, so a setting change is
 * one write per kind and touches no host.
 */
export function applyKindSettings(
  root: Element,
  kinds: Readonly<Record<KindId, KindSettings>>,
): void {
  for (const kind of KINDS) {
    const shown = effectiveSettings(kinds[kind.id]);
    setAttributeOnce(root, filterAttribute(kind.id), shown.filter);
  }
}
