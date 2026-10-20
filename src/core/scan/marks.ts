import type { Verdict } from "../types";

// What core writes on store nodes and how it recognizes its own nodes (docs/design/components.mdx,
// "DOM ownership and state"). The scanner, the renderers and the stylesheet share these names.

/** Every element core injects carries a class starting with `sar-`; the scanner skips them. */
export const SAR_NODE = "[class^='sar-'], [class*=' sar-']";

/** On each host: the app ID it shows. */
export const HOST_APPID = "data-sar-appid";
/** On each host: its `HostState`. */
export const HOST_STATE = "data-sar-state";
/** On hosts whose placement must not be hidden (`"false"`); the list filter dims them instead. */
export const HOST_HIDEABLE = "data-sar-hideable";

/**
 * A host's `data-sar-state`: `pending` from marking until its verdict is known, then the verdict
 * state, or `allowed` for an allow-listed game. Only `disclosed` is ever styled.
 */
export type HostState = "pending" | Verdict["state"] | "allowed";

/** Whether the element is one of ours: a badge, a banner host or anything else core injected. */
export function isSarNode(element: Element): boolean {
  return element.matches(SAR_NODE);
}

/** Whether the element is one of ours or sits inside one. */
export function isInSarNode(element: Element): boolean {
  return element.closest(SAR_NODE) !== null;
}
