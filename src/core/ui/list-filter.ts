import type { ListFilter } from "../settings/settings";
import { type HostRenderer, hostState } from "./host";

/**
 * Sets the list filter for the whole page: one attribute on the root element. The CSS in
 * styles.css dims or hides every host whose `data-sar-state` is `disclosed`, and dims instead of
 * hiding where the host says `data-sar-hideable="false"`. No host is touched.
 */
export function applyListFilter(root: Element, filter: ListFilter): void {
  if (root.getAttribute("data-sar-filter") !== filter) {
    root.setAttribute("data-sar-filter", filter);
  }
}

/**
 * Records each host's state for the list filter: `data-sar-state` (disclosed, not-disclosed,
 * unknown, allowed) and, where hiding would break the list, `data-sar-hideable="false"`. Writes
 * only what changed, so a rescan or a setting change causes no mutation churn.
 */
export function createHostStateRenderer(): HostRenderer {
  return {
    render({ host, verdict, allowed, hideable }) {
      const state = hostState(verdict, allowed);
      if (host.getAttribute("data-sar-state") !== state) {
        host.setAttribute("data-sar-state", state);
      }
      if (hideable) {
        host.removeAttribute("data-sar-hideable");
      } else if (host.getAttribute("data-sar-hideable") !== "false") {
        host.setAttribute("data-sar-hideable", "false");
      }
    },
  };
}
