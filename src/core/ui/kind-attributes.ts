import type { HexColor } from "../kinds/color";
import type { KindId } from "../kinds/id";
import { effectiveSettings, type KindSettings } from "../kinds/kind-settings";
import { KINDS } from "../kinds/registry";

/** On a chip and on the summary row: the id of the kind they show. */
export const KIND_ATTRIBUTE = "data-sar-kind";

/** The root attribute that holds a kind's list filter: `off`, `dim` or `hide`. */
export function filterAttribute(id: KindId): string {
  return `data-sar-filter-${id}`;
}

/**
 * The root custom property that holds a kind's custom color. Unset, the rules fall back to the
 * default violet tokens.
 */
export function colorProperty(id: KindId): string {
  return `--sar-kind-color-${id}`;
}

/** Sets the attribute unless it holds the value already, so a repeated draw mutates nothing. */
export function setAttributeOnce(element: Element, name: string, value: string): void {
  if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value);
  }
}

/**
 * Sets a custom property on the root element, or removes it for `undefined`, and writes nothing
 * when it holds the value already. Only a validated `HexColor` is ever passed in.
 */
export function setColorOnce(
  root: HTMLElement,
  id: KindId,
  color: HexColor | undefined,
): void {
  const name = colorProperty(id);
  if (color === undefined) {
    if (root.style.getPropertyValue(name) !== "") {
      root.style.removeProperty(name);
      if (root.getAttribute("style") === "") {
        root.removeAttribute("style");
      }
    }
  } else if (root.style.getPropertyValue(name) !== color) {
    root.style.setProperty(name, color);
  }
}

/**
 * Writes every kind's list filter and custom color on the root element. The filter comes from the
 * settings that take effect (a disabled kind filters nothing). The style rules match the
 * attributes and read the custom properties, so a setting change is one write per kind and
 * touches no host and no chip.
 */
export function applyKindSettings(
  root: HTMLElement,
  kinds: Readonly<Record<KindId, KindSettings>>,
): void {
  for (const kind of KINDS) {
    const shown = effectiveSettings(kinds[kind.id]);
    setAttributeOnce(root, filterAttribute(kind.id), shown.filter);
    setColorOnce(root, kind.id, kinds[kind.id].color);
  }
}
