import type { TagKind } from "../kinds/kind";
import type { ListFilter } from "../kinds/kind-settings";
import { HOST_HIDEABLE, HOST_STATE } from "../scan/marks";
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
export function createHostStateRenderer(kind: TagKind): HostRenderer {
  return {
    render({ host, verdicts, allowed, hideable }) {
      const state = hostState(verdicts[kind.id], allowed[kind.id]);
      if (host.getAttribute(HOST_STATE) !== state) {
        host.setAttribute(HOST_STATE, state);
      }
      if (hideable) {
        host.removeAttribute(HOST_HIDEABLE);
      } else if (host.getAttribute(HOST_HIDEABLE) !== "false") {
        host.setAttribute(HOST_HIDEABLE, String(false));
      }
    },
  };
}
