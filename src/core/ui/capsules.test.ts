import { describe, expect, it, vi } from "vitest";
import { setBody } from "../../../tests/helpers/dom";
import { fakeDetector } from "../../../tests/helpers/fake-detector";
import { ignoredSets } from "../../../tests/helpers/ignored";
import { manualQueue } from "../../../tests/helpers/manual-queue";
import {
  aiVerdicts,
  disclosedVerdict,
  FULL_DISCLOSED,
  NOT_DISCLOSED,
} from "../../../tests/helpers/verdicts";
import { MAX_RETRIES } from "../detect/retry";
import { isIgnored } from "../ignored";
import type { AiVerdict } from "../kinds/ai";
import { KIND_IDS, type KindId } from "../kinds/id";
import { type KindVerdicts, type Relations, UNKNOWN_KINDS } from "../kinds/verdicts";
import type { Detector } from "../ports";
import { GENERIC, type Placement, type RowPlacement } from "../scan/placements";
import type { CapsuleHost } from "../scan/renderer";
import { type AppId, toAppId } from "../types";
import { createCapsuleUi, type SizeWatch } from "./capsules";
import type { HostView } from "./host";

const ROW: RowPlacement = {
  id: "row",
  host: "*",
  hideable: false,
  maxChips: 3,
  badge: "full",
  slot: "after",
  anchor: (host) => host.firstElementChild ?? undefined,
};

function appId(value: number): AppId {
  const id = toAppId(value);
  if (id === undefined) {
    throw new TypeError();
  }
  return id;
}

function setup(
  verdicts: ReadonlyMap<AppId, AiVerdict>,
  allowed = new Set<AppId>(),
  /** Verdicts of kinds other than the AI kind, for every app. */
  others: Partial<KindVerdicts> = {},
  /** Kinds whose badges are off in the settings. */
  unbadged: ReadonlySet<KindId> = new Set(),
  /** What decides whether a game is ignored; the set of `allowed` IDs by default. */
  isAllowed: (id: AppId, kind: KindId, related: Relations) => boolean = (id) => allowed.has(id),
) {
  const detect = vi.fn((ids: readonly AppId[]) =>
    Promise.resolve(
      new Map(ids.flatMap((id) => {
        const verdict = verdicts.get(id);
        return verdict === undefined ? [] : [[id, { ...aiVerdicts(verdict), ...others }] as const];
      })),
    )
  );
  const detector: Detector = { detect };
  const views: HostView[] = [];
  const frames: (() => void)[] = [];
  const watched = new Set<Element>();
  let disconnects = 0;
  let reportSized: (elements: readonly Element[]) => void = () => undefined;
  const ui = createCapsuleUi({
    document,
    detector,
    renderers: [{
      render: (view) =>
        views.push({ ...view, allowed: { ...view.allowed }, badged: { ...view.badged } }),
    }],
    isAllowed,
    isBadged: (kind) => !unbadged.has(kind),
    frame: (callback) => frames.push(callback),
    watchSize: (onSized): SizeWatch => {
      reportSized = onSized;
      return {
        observe: (element) => watched.add(element),
        unobserve: (e) => watched.delete(e),
        disconnect: () => {
          disconnects += 1;
          watched.clear();
        },
      };
    },
  });
  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    for (const callback of frames.splice(0)) {
      callback();
    }
  };
  const sized = (elements: readonly Element[]) => {
    reportSized(elements);
  };
  return { ui, detect, views, flush, watched, sized, disconnects: () => disconnects };
}

function host(id: number, placement: Placement = ROW): CapsuleHost {
  setBody(
    `<div data-sar-appid="${String(id)}"><span class="line"></span><div class="art"></div></div>`,
  );
  const element = document.querySelector("[data-sar-appid]");
  const anchor = placement.anchor(element ?? document.body);
  if (element === null || anchor === undefined) {
    throw new TypeError();
  }
  return { element, appId: appId(id), placement, anchor };
}

describe("createCapsuleUi", () => {
  it("detects found hosts in one call and draws them with their full-badge slot", async () => {
    const id = appId(7);
    const { ui, detect, views, flush } = setup(new Map([[id, disclosedVerdict()]]));
    const found = host(7);
    ui.render({ found: [found], changed: [] });
    await flush();
    expect(detect).toHaveBeenCalledTimes(1);
    expect(views).toHaveLength(1);
    expect(views[0]?.slot).toEqual({ kind: "full", anchor: found.anchor, position: "afterend" });
    expect(views[0]?.hideable).toBe(false);
  });

  it("gives a host a slot for a disclosure in any kind, whichever it is", async () => {
    const id = appId(4);
    const pvpOnly = setup(new Map([[id, NOT_DISCLOSED]]), new Set(), { pvp: FULL_DISCLOSED.pvp });
    pvpOnly.ui.render({ found: [host(4)], changed: [] });
    await pvpOnly.flush();
    expect(pvpOnly.views[0]?.slot).toMatchObject({ kind: "full" });
    const none = setup(new Map([[id, NOT_DISCLOSED]]));
    none.ui.render({ found: [host(4)], changed: [] });
    await none.flush();
    expect(none.views[0]?.slot).toBeUndefined();
  });

  it("passes the chip allowance and the badge settings to the renderers", async () => {
    const id = appId(3);
    const { ui, views, flush } = setup(
      new Map([[id, disclosedVerdict()]]),
      new Set(),
      {},
      new Set<KindId>(["drm", "pvp"]),
    );
    ui.render({ found: [host(3, { ...ROW, maxChips: 2 })], changed: [] });
    await flush();
    expect(views[0]?.maxChips).toBe(2);
    expect(KIND_IDS.filter((kind) => views[0]?.badged[kind] === false)).toEqual(["drm", "pvp"]);
  });

  it("gives a host no slot when the only kind it discloses has its badges off", async () => {
    const id = appId(2);
    const aiOff = setup(
      new Map([[id, disclosedVerdict()]]),
      new Set(),
      {},
      new Set<KindId>(["ai"]),
    );
    aiOff.ui.render({ found: [host(2)], changed: [] });
    await aiOff.flush();
    expect(aiOff.views[0]?.slot).toBeUndefined();
    const withPvp = setup(new Map([[id, disclosedVerdict()]]), new Set(), {
      pvp: FULL_DISCLOSED.pvp,
    }, new Set<KindId>(["ai"]));
    withPvp.ui.render({ found: [host(2)], changed: [] });
    await withPvp.flush();
    expect(withPvp.views[0]?.slot).toMatchObject({ kind: "full" });
  });

  it("draws a full badge of an end slot as the anchor's last child", async () => {
    const id = appId(6);
    const { ui, views, flush } = setup(new Map([[id, disclosedVerdict()]]));
    const found = host(6, { ...ROW, slot: "end" });
    ui.render({ found: [found], changed: [] });
    await flush();
    expect(views[0]?.slot).toEqual({ kind: "full", anchor: found.anchor, position: "beforeend" });
  });

  it("measures the image box for a compact badge and anchors a static box", async () => {
    const id = appId(8);
    const { ui, views, flush } = setup(new Map([[id, disclosedVerdict()]]));
    const found = host(8, {
      ...GENERIC,
      anchor: (element) => element.querySelector(".art") ?? undefined,
    });
    vi.spyOn(found.anchor, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 231, 87));
    ui.render({ found: [found], changed: [] });
    await flush();
    expect(views[0]?.slot).toMatchObject({ kind: "compact", size: "text", position: "beforeend" });
    expect(found.anchor.hasAttribute("data-sar-anchor")).toBe(true);
  });

  it("gives a small image no slot", async () => {
    const id = appId(9);
    const { ui, views, flush } = setup(new Map([[id, disclosedVerdict()]]));
    const found = host(9, {
      ...GENERIC,
      anchor: (element) => element.querySelector(".art") ?? undefined,
    });
    vi.spyOn(found.anchor, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 120, 45));
    ui.render({ found: [found], changed: [] });
    await flush();
    expect(views[0]?.slot).toBeUndefined();
  });

  it("watches an image box with no size until a compact badge fits, then draws it", async () => {
    const id = appId(13);
    const { ui, detect, views, flush, watched, sized } = setup(
      new Map([[id, disclosedVerdict()]]),
    );
    const found = host(13, {
      ...GENERIC,
      anchor: (element) => element.querySelector(".art") ?? undefined,
    });
    const box = vi.spyOn(found.anchor, "getBoundingClientRect");
    box.mockReturnValue(new DOMRect(0, 0, 0, 0));
    ui.render({ found: [found], changed: [] });
    await flush();
    expect(views[0]?.slot).toBeUndefined();
    expect([...watched]).toEqual([found.anchor]);
    box.mockReturnValue(new DOMRect(0, 0, 1, 75));
    sized([found.anchor]);
    await flush();
    expect(views[1]?.slot).toBeUndefined();
    expect([...watched]).toEqual([found.anchor]);
    box.mockReturnValue(new DOMRect(0, 0, 231, 87));
    sized([found.anchor]);
    await flush();
    expect(views[2]?.slot).toMatchObject({ kind: "compact", size: "text" });
    expect(watched.size).toBe(0);
    expect(detect).toHaveBeenCalledTimes(1);
  });

  it("lets go of the size watch on pagehide and starts a new one when needed", async () => {
    const id = appId(16);
    const { ui, flush, watched, disconnects } = setup(new Map([[id, disclosedVerdict()]]));
    const found = host(16, {
      ...GENERIC,
      anchor: (element) => element.querySelector(".art") ?? undefined,
    });
    vi.spyOn(found.anchor, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 0, 0));
    ui.render({ found: [found], changed: [] });
    await flush();
    expect(watched.size).toBe(1);
    window.dispatchEvent(new Event("pagehide"));
    expect(disconnects()).toBe(1);
    expect(watched.size).toBe(0);
    ui.refresh();
    await flush();
    expect([...watched]).toEqual([found.anchor]);
  });

  it("stops listening for pagehide when stopped", () => {
    const { ui, disconnects } = setup(new Map());
    ui.stop();
    expect(disconnects()).toBe(0);
    window.dispatchEvent(new Event("pagehide"));
    expect(disconnects()).toBe(0);
  });

  it("does not watch a small image that has a size, nor a host without a badge", async () => {
    const { ui, flush, watched } = setup(
      new Map<AppId, AiVerdict>([[appId(14), disclosedVerdict()], [appId(15), NOT_DISCLOSED]]),
    );
    const small = host(14, {
      ...GENERIC,
      anchor: (element) => element.querySelector(".art") ?? undefined,
    });
    vi.spyOn(small.anchor, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 120, 45));
    ui.render({ found: [small], changed: [] });
    await flush();
    const hidden = host(15, {
      ...GENERIC,
      anchor: (element) => element.querySelector(".art") ?? undefined,
    });
    vi.spyOn(hidden.anchor, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 0, 0));
    ui.render({ found: [hidden], changed: [] });
    await flush();
    expect(watched.size).toBe(0);
  });

  it("draws a changed host again from its known verdict, without a new detection", async () => {
    const id = appId(10);
    const { ui, detect, views, flush } = setup(new Map([[id, NOT_DISCLOSED]]));
    const found = host(10);
    ui.render({ found: [found], changed: [] });
    await flush();
    ui.render({ found: [], changed: [found] });
    await flush();
    expect(detect).toHaveBeenCalledTimes(1);
    expect(views).toHaveLength(2);
  });

  it("gives the renderers a verdict and an allow-list flag for every kind", async () => {
    const id = appId(9);
    const { ui, views, flush } = setup(new Map([[id, disclosedVerdict()]]));
    ui.render({ found: [host(9)], changed: [] });
    await flush();
    expect(Object.keys(views[0]?.verdicts ?? {})).toStrictEqual([...KIND_IDS]);
    expect(Object.keys(views[0]?.allowed ?? {})).toStrictEqual([...KIND_IDS]);
  });

  it("redraws the hosts of an app after an allow-list change", async () => {
    const id = appId(11);
    const allowed = new Set<AppId>();
    const { ui, views, flush } = setup(new Map([[id, disclosedVerdict()]]), allowed);
    ui.render({ found: [host(11)], changed: [] });
    await flush();
    allowed.add(id);
    ui.refresh(new Set([id]));
    await flush();
    expect(views.map((view) => view.allowed.ai)).toEqual([false, true]);
    ui.refresh(new Set([appId(12)]));
    await flush();
    expect(views).toHaveLength(2);
  });

  it("asks again about the hosts whose verdicts are stale, and draws the new answer", async () => {
    const id = appId(13);
    const { ui, detect, views, flush } = setup(new Map([[id, disclosedVerdict()]]));
    ui.render({ found: [host(13)], changed: [] });
    await flush();
    ui.redetect(() => false);
    await flush();
    expect(detect).toHaveBeenCalledTimes(1);
    ui.redetect((verdicts) => verdicts.ai.state === "disclosed");
    await flush();
    expect(detect.mock.calls.map(([ids]) => ids)).toStrictEqual([[id], [id]]);
    expect(views).toHaveLength(2);
  });

  describe("for a DLC", () => {
    const BASE = appId(1808500);
    const DLC = appId(5201760);

    /** The real predicate over an ignore list, as the composition root wires it. */
    function ignoring(setupList: (ignored: ReturnType<typeof lists>) => void) {
      const ignored = lists();
      setupList(ignored);
      return (id: AppId, kind: KindId, related: Relations) => isIgnored(ignored, id, kind, related);
    }
    const lists = () => ignoredSets();

    it("asks whether the game is ignored with the base game Steam named", async () => {
      const asked = vi.fn((_id: AppId, _kind: KindId, _related: Relations) => false);
      const { ui, flush } = setup(
        new Map([[DLC, disclosedVerdict()]]),
        new Set(),
        { parent: BASE },
        new Set(),
        asked,
      );
      ui.render({ found: [host(5201760)], changed: [] });
      await flush();
      expect(asked).toHaveBeenCalledWith(DLC, "ai", expect.objectContaining({ parent: BASE }));
      expect(asked).toHaveBeenCalledTimes(KIND_IDS.length);
    });

    it("flags a DLC of a base game ignored for one kind in that kind only", async () => {
      const isAllowed = ignoring((ignored) => ignored.games.ai.add(BASE));
      const { ui, views, flush } = setup(
        new Map([[DLC, disclosedVerdict()]]),
        new Set(),
        { parent: BASE, pvp: FULL_DISCLOSED.pvp },
        new Set(),
        isAllowed,
      );
      ui.render({ found: [host(5201760)], changed: [] });
      await flush();
      expect(views[0]?.allowed.ai).toBe(true);
      expect(views[0]?.allowed.pvp).toBe(false);
      expect(views[0]?.slot).toMatchObject({ kind: "full" });
    });

    it("gives a DLC whose only disclosure is ignored through its base game no slot", async () => {
      const isAllowed = ignoring((ignored) => ignored.games.all.add(BASE));
      const { ui, views, flush } = setup(
        new Map([[DLC, disclosedVerdict()]]),
        new Set(),
        { parent: BASE },
        new Set(),
        isAllowed,
      );
      ui.render({ found: [host(5201760)], changed: [] });
      await flush();
      expect(views[0]?.slot).toBeUndefined();
      expect(KIND_IDS.every((kind) => views[0]?.allowed[kind] === true)).toBe(true);
    });

    it("draws the DLC again when its base game is ignored or restored, and only then", async () => {
      const ignored = lists();
      const { ui, views, flush } = setup(
        new Map([[DLC, disclosedVerdict()]]),
        new Set(),
        { parent: BASE },
        new Set(),
        (id, kind, related) => isIgnored(ignored, id, kind, related),
      );
      ui.render({ found: [host(5201760)], changed: [] });
      await flush();
      ignored.games.ai.add(BASE);
      ui.refresh(new Set([BASE]));
      await flush();
      ui.refresh(new Set([appId(12)]));
      await flush();
      ignored.games.ai.delete(BASE);
      ui.refresh(new Set([BASE]));
      await flush();
      expect(views.map((view) => view.allowed.ai)).toEqual([false, true, false]);
    });

    it("leaves a DLC with no known base game on its own entries", async () => {
      const isAllowed = ignoring((ignored) => ignored.games.all.add(BASE));
      const { ui, views, flush } = setup(
        new Map([[DLC, disclosedVerdict()]]),
        new Set(),
        {},
        new Set(),
        isAllowed,
      );
      ui.render({ found: [host(5201760)], changed: [] });
      await flush();
      expect(views[0]?.allowed.ai).toBe(false);
    });
  });

  describe("after a transient answer", () => {
    const DISCLOSED = aiVerdicts(disclosedVerdict());
    const { error: ERROR, missing: MISSING, "rate-limited": LIMITED } = UNKNOWN_KINDS;

    /** A capsule UI on manual frames and retry timers, whose detector answers each call in turn. */
    function retrying(answers: readonly KindVerdicts[]) {
      const frames = manualQueue();
      const timers = manualQueue();
      const views: HostView[] = [];
      const detector = fakeDetector(() =>
        answers[Math.min(detector.calls.length, answers.length) - 1] ?? UNKNOWN_KINDS.missing
      );
      const ui = createCapsuleUi({
        document,
        detector,
        renderers: [{ render: (view) => views.push(view) }],
        isAllowed: () => false,
        isBadged: () => true,
        frame: frames.frame,
        delay: timers.delay,
      });
      /** Lets the pending lookup answer, then draws. */
      const answered = async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        frames.run();
      };
      return { ui, detector, timers, views, answered };
    }

    it.each(
      [
        ["unknown error: asked again", [ERROR, DISCLOSED], true, 2, true],
        ["unknown rate-limited: asked again", [LIMITED, DISCLOSED], true, 2, true],
        ["a host that left the page: not asked again", [ERROR, DISCLOSED], false, 1, false],
        ["unknown missing, which is stored: not asked again", [MISSING, DISCLOSED], true, 1, false],
        ["rate-limited every time: asked twice more", [LIMITED], true, 1 + MAX_RETRIES, false],
      ] as const,
    )("%s", async (_name, answers, connected, calls, chips) => {
      const { ui, detector, timers, views, answered } = retrying(answers);
      const found = host(21);
      ui.render({ found: [found], changed: [] });
      for (let round = 0; round <= MAX_RETRIES + 1; round++) {
        await answered();
        if (!connected) {
          found.element.remove();
        }
        timers.run();
      }
      expect(detector.calls).toHaveLength(calls);
      expect(timers.size).toBe(0);
      expect(views.at(-1)?.slot !== undefined).toBe(chips);
    });

    it.each(["pagehide", "stop"] as const)("cancels the pending retry on %s", async (end) => {
      const { ui, timers, answered } = retrying([ERROR]);
      ui.render({ found: [host(22)], changed: [] });
      await answered();
      expect(timers.size).toBe(1);
      if (end === "pagehide") {
        window.dispatchEvent(new Event("pagehide"));
      } else {
        ui.stop();
      }
      expect(timers.size).toBe(0);
    });
  });
});
