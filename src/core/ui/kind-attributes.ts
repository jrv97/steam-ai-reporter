import type { KindId } from "../kinds/id";
import { effectiveSettings, type KindSettings } from "../kinds/kind-settings";
import { KINDS } from "../kinds/registry";

/** On a chip and on the summary row: the id of the kind they show. */
export const KIND_ATTRIBUTE = "data-sar-kind";

/** The root attribute that holds a kind's list filter: `off`, `dim` or `hide`. */
export function filterAttribute(id: KindId): string {
  return `data-sar-filter-${id}`;
}

/** The root attribute that says whether a kind's badges show: `on` or `off`. */
export function badgesAttribute(id: KindId): string {
  return `data-sar-badges-${id}`;
}

const OFF = "off";

/** Sets the attribute unless it holds the value already, so a repeated draw mutates nothing. */
export function setAttributeOnce(element: Element, name: string, value: string): void {
  if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value);
  }
}

/**
 * Writes every kind's list filter and badge switch on the root element, from the settings that
 * take effect (a disabled kind filters nothing and shows no badge). The style rules match these
 * attributes, so a setting change is one write per kind and touches no host.
 */
export function applyKindSettings(
  root: Element,
  kinds: Readonly<Record<KindId, KindSettings>>,
): void {
  for (const kind of KINDS) {
    const shown = effectiveSettings(kinds[kind.id]);
    setAttributeOnce(root, filterAttribute(kind.id), shown.filter);
    setAttributeOnce(root, badgesAttribute(kind.id), shown.badge ? "on" : OFF);
  }
}

/** Whether the badges of the kind the element shows are switched off on the root element. */
export function badgesOff(root: Element, element: Element): boolean {
  const id = element.getAttribute(KIND_ATTRIBUTE);
  return id !== null && root.getAttribute(`data-sar-badges-${id}`) === OFF;
}
