import type { TagKind } from "../kinds/kind";
import { KINDS } from "../kinds/registry";
import { HOST_HIDEABLE, HOST_KINDS } from "../scan/marks";
import type { HostRenderer } from "./host";
import { setAttributeOnce } from "./kind-attributes";

/**
 * Records on each host which kinds it carries, for the list filter and the layout rules:
 * `data-sar-kinds` holds the ids of the kinds that are disclosed and not ignored for the game, and
 * `data-sar-hideable="false"` marks hosts where hiding would break the list. The style rules turn
 * the root's per-kind filters into dim or hide on these hosts (`applyKindSettings`). Writes only
 * what changed, so a rescan or a setting change causes no mutation churn.
 */
export function createHostKindsRenderer(kinds: readonly TagKind[] = KINDS): HostRenderer {
  return {
    render({ host, verdicts, allowed, hideable }) {
      let present = "";
      for (const kind of kinds) {
        if (verdicts[kind.id].state === "disclosed" && !allowed[kind.id]) {
          present = present === "" ? kind.id : `${present} ${kind.id}`;
        }
      }
      if (present === "") {
        host.removeAttribute(HOST_KINDS);
      } else {
        setAttributeOnce(host, HOST_KINDS, present);
      }
      if (hideable) {
        host.removeAttribute(HOST_HIDEABLE);
      } else {
        setAttributeOnce(host, HOST_HIDEABLE, String(false));
      }
    },
  };
}
