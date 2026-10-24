// What core writes on store nodes and how it recognizes its own nodes (docs/design/components.mdx,
// "DOM ownership and state"). The scanner, the renderers and the stylesheet share these names.

/** Every element core injects carries a class starting with `sar-`; the scanner skips them. */
export const SAR_NODE = "[class^='sar-'], [class*=' sar-']";

/** On each host: the app ID it shows. */
export const HOST_APPID = "data-sar-appid";
/**
 * On each host once its verdicts are known: the kinds it carries, as kind ids separated by spaces
 * in registry order. A kind that is not disclosed, unknown or ignored for the game is absent. The
 * list filter and the layout rules match one id with `~=`.
 */
export const HOST_KINDS = "data-sar-kinds";
/** On hosts whose placement must not be hidden (`"false"`); the list filter dims them instead. */
export const HOST_HIDEABLE = "data-sar-hideable";

/** Whether the element is one of ours: a badge, a banner host or anything else core injected. */
export function isSarNode(element: Element): boolean {
  return element.matches(SAR_NODE);
}

/** Whether the element is one of ours or sits inside one. */
export function isInSarNode(element: Element): boolean {
  return element.closest(SAR_NODE) !== null;
}
