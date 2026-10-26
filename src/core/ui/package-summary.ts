import type { KindId } from "../kinds/id";
import type { FacetDefinition, FacetId, TagKind } from "../kinds/kind";
import { KINDS, perKind } from "../kinds/registry";
import type { MessageCatalog } from "../ports";
import { HOST_APPID } from "../scan/marks";
import { findList, placeAbove, SUMMARY_PLACEMENTS } from "../scan/placements";
import type { HostRenderer, HostView } from "./host";
import { entryName } from "./kind-details";
import { createTagBlock } from "./tag-section";

/** The label's id, which the summary's group points to for its name. */
const LABEL_ID = "sar-summary-label";

/** The names a kind's lines may take, in order: one per facet, else Steam's heading. */
function lineNames(i18n: MessageCatalog, kind: TagKind): readonly string[] {
  const heading = i18n.t(kind.messages.heading);
  const facets: readonly FacetDefinition<FacetId>[] = kind.facets ?? [];
  return facets.length === 0
    ? [heading]
    : facets.map((facet) => i18n.t("kind_facet_name", { heading, value: i18n.t(facet.word) }));
}

/**
 * The summary's lines for the hosts in `list`, from the views drawn last; none for nothing. A kind
 * with facets has a line per value it tags.
 */
function summaryLines(
  i18n: MessageCatalog,
  list: Element,
  views: WeakMap<Element, HostView>,
): string[] {
  const tagged = new Map<string, number>();
  const known: Record<KindId, number> = perKind(() => 0);
  let pending = 0;
  for (const host of list.querySelectorAll(`[${HOST_APPID}]`)) {
    const view = views.get(host);
    if (view === undefined) {
      pending += 1;
      continue;
    }
    for (const kind of KINDS) {
      const verdict = view.verdicts[kind.id];
      known[kind.id] += verdict.state === "unknown" ? 0 : 1;
      if (verdict.state === "disclosed" && !view.allowed[kind.id] && view.badged[kind.id]) {
        const name = entryName(i18n, verdict);
        tagged.set(name, (tagged.get(name) ?? 0) + 1);
      }
    }
  }
  const lines = KINDS.flatMap((kind) =>
    lineNames(i18n, kind).flatMap((name) => {
      const count = tagged.get(name);
      return count === undefined
        ? []
        : [
          i18n.plural("badge_summary_games", known[kind.id], { kind: name, tagged: String(count) }),
        ];
    })
  );
  return pending > 0 ? [...lines, i18n.plural("badge_summary_pending", pending)] : lines;
}

/**
 * Per kind, how many included games with a known verdict show its chip, atop a package page. It
 * keeps each host's last view and draws once per batch, following the capsule UI's own refresh.
 */
export function createPackageSummary(doc: Document, i18n: MessageCatalog): HostRenderer {
  const views = new WeakMap<Element, HostView>();
  let box: HTMLElement | undefined;
  let drawn = "";
  let scheduled = false;

  function draw(): void {
    scheduled = false;
    const found = findList(doc, SUMMARY_PLACEMENTS);
    const lines = found === undefined ? [] : summaryLines(i18n, found.list, views);
    const text = lines.join("\n");
    if (text !== drawn || found === undefined) {
      box?.remove();
      box = undefined;
      drawn = text;
    }
    if (found === undefined || lines.length === 0) {
      return;
    }
    if (box === undefined) {
      box = createTagBlock(doc, i18n, "sar-tag-section sar-summary", LABEL_ID);
      for (const line of lines) {
        const element = doc.createElement("div");
        element.className = "sar-summary-line";
        element.textContent = line;
        box.append(element);
      }
    }
    placeAbove(found, box);
  }

  return {
    render(view) {
      views.set(view.host, view);
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(draw);
      }
    },
  };
}
