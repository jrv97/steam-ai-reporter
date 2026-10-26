import { beforeEach, describe, expect, it } from "vitest";
import { setBody } from "../../../tests/helpers/dom";
import { hostView, type HostViewOptions } from "../../../tests/helpers/host-view";
import { englishI18n } from "../../../tests/helpers/i18n";
import { markedPackagePage } from "../../../tests/helpers/package-page";
import { disclosedKinds, uniformVerdicts } from "../../../tests/helpers/verdicts";
import { KIND_IDS, type KindId } from "../kinds/id";
import { kindsInOrder, parseOrder } from "../kinds/order";
import { KIND_BY_ID } from "../kinds/registry";
import { HOST_APPID } from "../scan/marks";
import type { HostRenderer } from "./host";
import { createPackageSummary } from "./package-summary";

const i18n = englishI18n();

/** One included game's view, or undefined while its verdicts are not known. */
type Row = HostViewOptions | undefined;

const games = (kind: KindId, tagged: number, count: number) =>
  i18n.plural("badge_summary_games", count, {
    kind: i18n.t(KIND_BY_ID[kind].messages.heading),
    tagged: String(tagged),
  });
const pending = (count: number) => i18n.plural("badge_summary_pending", count);

const AI = { verdicts: disclosedKinds(["ai"]) };
const AI_DRM = { verdicts: disclosedKinds(["ai", "drm"]) };
const NOTHING = { verdicts: disclosedKinds([]) };
const UNKNOWN = { verdicts: uniformVerdicts("missing") };

const summary = () => document.querySelector(".sar-summary");

/** The summary's lines, or undefined when there is no summary. */
function lines(): readonly string[] | undefined {
  const box = summary();
  return box === null
    ? undefined
    : [...box.querySelectorAll(".sar-summary-line")].map((line) => line.textContent);
}

/** Draws each row that has a view, then lets the summary's one draw run. */
async function draw(
  renderer: HostRenderer,
  rows: readonly Element[],
  views: readonly Row[],
): Promise<void> {
  rows.forEach((row, index) => {
    const options = views[index];
    if (options !== undefined) {
      renderer.render(hostView(row, options));
    }
  });
  await Promise.resolve();
}

let order: readonly KindId[] = KIND_IDS;

/** A package page with one row per view, its summary drawn from them in `order`. */
async function drawnPage(views: readonly Row[]) {
  const rows = markedPackagePage(views.map((_, index) => 10 + index));
  const renderer = createPackageSummary(document, i18n, () => kindsInOrder(order));
  await draw(renderer, rows, views);
  return { rows, renderer };
}

describe("createPackageSummary", () => {
  beforeEach(() => {
    order = KIND_IDS;
  });

  it.each<[string, readonly Row[], readonly string[] | undefined]>([
    ["every game carries the kinds", [AI_DRM, AI_DRM, AI_DRM], [
      games("ai", 3, 3),
      games("drm", 3, 3),
    ]],
    ["a mix of kinds", [AI, NOTHING, { verdicts: disclosedKinds(["ai", "pvp"]) }], [
      games("ai", 2, 3),
      games("pvp", 1, 3),
    ]],
    ["an unknown game stays out of the count", [AI, UNKNOWN, NOTHING], [games("ai", 1, 2)]],
    ["a game ignored for a kind is not counted for it", [{ ...AI_DRM, ignored: ["ai"] }, AI], [
      games("ai", 1, 2),
      games("drm", 1, 2),
    ]],
    ["a kind switched off has no line", [{ ...AI_DRM, unbadged: ["ai"] }], [games("drm", 1, 1)]],
    ["a game still looked up is named apart", [AI, undefined], [games("ai", 1, 1), pending(1)]],
    ["no game carries a kind", [NOTHING, UNKNOWN], undefined],
  ])("%s", async (_, views, expected) => {
    await drawnPage(views);
    expect(lines()).toStrictEqual(expected);
  });

  it.each<[string, readonly Row[], readonly Row[], readonly string[] | undefined]>([
    ["a game's verdicts arrive", [AI, undefined], [undefined, AI], [games("ai", 2, 2)]],
    ["a retry answers an unknown game", [AI, UNKNOWN], [undefined, AI], [games("ai", 2, 2)]],
    ["a kind's badge is switched off", [AI_DRM], [{ ...AI_DRM, unbadged: ["drm"] }], [
      games("ai", 1, 1),
    ]],
    ["a game is ignored for a kind", [AI, AI], [{ ...AI, ignored: ["ai"] }], [games("ai", 1, 2)]],
    ["the last chip goes", [AI], [{ ...AI, ignored: ["ai"] }], undefined],
  ])("follows the next draw when %s", async (_, before, after, expected) => {
    const { rows, renderer } = await drawnPage(before);
    await draw(renderer, rows, after);
    expect(lines()).toStrictEqual(expected);
  });

  it.each<readonly KindId[]>([KIND_IDS, parseOrder(["pvp", "drm"])])(
    "lists the kinds in the tag order %j",
    async (...moved) => {
      order = moved;
      await drawnPage([AI_DRM, { verdicts: disclosedKinds(["pvp"]) }]);
      const expected = order.filter((id) => ["ai", "drm", "pvp"].includes(id));
      expect(lines()).toStrictEqual(expected.map((id) => games(id, 1, 2)));
    },
  );

  it("follows a new order on the next draw", async () => {
    const { rows, renderer } = await drawnPage([AI_DRM]);
    order = parseOrder(["drm"]);
    await draw(renderer, rows, [AI_DRM]);
    expect(lines()).toStrictEqual([games("drm", 1, 1), games("ai", 1, 1)]);
  });

  it("sits right after the package header, above the included games, inside no host", async () => {
    await drawnPage([AI]);
    const box = summary();
    expect(box?.previousElementSibling?.id).toBe("package_header_container");
    expect(box?.nextElementSibling?.className).toBe("package_landing_page_item_list");
    expect(box?.closest(`[${HOST_APPID}]`)).toBeNull();
  });

  it("keeps the drawn node when the lines stay the same", async () => {
    const { rows, renderer } = await drawnPage([AI, NOTHING]);
    const first = summary();
    await draw(renderer, rows, [AI, NOTHING]);
    expect(summary()).toBe(first);
  });

  it("draws nothing on a page without the included games list", async () => {
    setBody(`<div ${HOST_APPID}="10"><img></div>`);
    const host = document.querySelector(`[${HOST_APPID}]`);
    await draw(createPackageSummary(document, i18n), host === null ? [] : [host], [AI]);
    expect(summary()).toBeNull();
  });
});
