import { describe, expect, it, vi } from "vitest";
import { setBody } from "../../../tests/helpers/dom";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { MAX_RETRIES } from "../detect/retry";
import { isIgnored } from "../ignored";
import type { AiVerdict } from "../kinds/ai";
import { KIND_IDS, type KindId } from "../kinds/id";
import type { KindVerdicts, Relations } from "../kinds/verdicts";
import type { Detector } from "../ports";
import { GENERIC, type Placement, type RowPlacement } from "../scan/placements";
import type { CapsuleHost } from "../scan/renderer";
import type { AppId } from "../types";
import { type CapsuleUi, createCapsuleUi, type SizeWatch } from "./capsules";
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

/** Image boxes: none yet, too small for a badge, too narrow, and one for the text tier. */
const NO_SIZE = new DOMRect(0, 0, 0, 0);
const SMALL = new DOMRect(0, 0, 120, 45);
const NARROW = new DOMRect(0, 0, 1, 75);
const TEXT_TIER = new DOMRect(0, 0, 231, 87);

interface SetupOptions {
  readonly allowed?: ReadonlySet<AppId>;
  /** Verdicts of kinds other than the AI kind, for every app. */
  readonly others?: Partial<KindVerdicts>;
  /** Kinds whose badges are off in the settings. */
  readonly unbadged?: ReadonlySet<KindId>;
  /** What decides whether a game is ignored; the set of `allowed` IDs by default. */
  readonly isAllowed?: (id: AppId, kind: KindId, related: Relations) => boolean;
}

function setup(
  verdicts: ReadonlyMap<AppId, AiVerdict>,
  {
    allowed = new Set(),
    others = {},
    unbadged = new Set(),
    isAllowed = (id) => allowed.has(id),
  }: SetupOptions = {},
) {
  const detect = vi.fn((ids: readonly AppId[]) =>
    Promise.resolve(
      new Map(ids.flatMap((id) => {
        const verdict = verdicts.get(id);
        return verdict === undefined
          ? []
          : [[id, { ...make.verdicts({ ai: verdict }), ...others }] as const];
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

function host(id: AppId, placement: Placement = ROW): CapsuleHost {
  setBody(
    `<div data-sar-appid="${String(id)}"><span class="line"></span><div class="art"></div></div>`,
  );
  const element = document.querySelector("[data-sar-appid]");
  const anchor = placement.anchor(element ?? document.body);
  if (element === null || anchor === undefined) {
    throw new TypeError();
  }
  return { element, appId: id, placement, anchor };
}

/** A host whose image box measures `size`, for compact badges. */
function imageHost(id: AppId, size: DOMRect) {
  const found = host(id, {
    ...GENERIC,
    anchor: (element) => element.querySelector(".art") ?? undefined,
  });
  const box = vi.spyOn(found.anchor, "getBoundingClientRect");
  box.mockReturnValue(size);
  return { found, box };
}

describe("createCapsuleUi", () => {
  const AI = make.verdict.disclosed("ai");
  const PVP = make.verdict.disclosed("pvp");
  const NOT_DISCLOSED = make.verdict.notDisclosed();

  it("detects found hosts in one call and draws them with their full-badge slot", async () => {
    const id = make.appId();
    const { ui, detect, views, flush } = setup(new Map([[id, AI]]));
    const found = host(id);
    ui.render({ found: [found], changed: [] });
    await flush();
    expect(detect).toHaveBeenCalledTimes(1);
    expect(views).toHaveLength(1);
    expect(views[0]?.slot).toEqual({ kind: "full", anchor: found.anchor, position: "afterend" });
    expect(views[0]?.hideable).toBe(false);
  });

  it.each(
    [
      ["no disclosure", NOT_DISCLOSED, {}, [], undefined],
      ["a disclosure in another kind", NOT_DISCLOSED, { pvp: PVP }, [], "full"],
      ["its only disclosure badged off", AI, {}, ["ai"], undefined],
      ["another disclosure badged on", AI, { pvp: PVP }, ["ai"], "full"],
    ] as const,
  )("gives a host with %s the slot %s", async (_name, ai, others, off, slot) => {
    const id = make.appId();
    const { ui, views, flush } = setup(new Map([[id, ai]]), { others, unbadged: new Set(off) });
    ui.render({ found: [host(id)], changed: [] });
    await flush();
    expect(views[0]?.slot?.kind).toBe(slot);
  });

  it("passes the chip allowance and the badge settings to the renderers", async () => {
    const id = make.appId();
    const { ui, views, flush } = setup(new Map([[id, AI]]), {
      unbadged: new Set<KindId>(["drm", "pvp"]),
    });
    ui.render({ found: [host(id, { ...ROW, maxChips: 2 })], changed: [] });
    await flush();
    expect(views[0]?.maxChips).toBe(2);
    expect(KIND_IDS.filter((kind) => views[0]?.badged[kind] === false)).toEqual(["drm", "pvp"]);
  });

  it("draws a full badge of an end slot as the anchor's last child", async () => {
    const id = make.appId();
    const { ui, views, flush } = setup(new Map([[id, AI]]));
    const found = host(id, { ...ROW, slot: "end" });
    ui.render({ found: [found], changed: [] });
    await flush();
    expect(views[0]?.slot).toEqual({ kind: "full", anchor: found.anchor, position: "beforeend" });
  });

  it("measures the image box for a compact badge and anchors a static box", async () => {
    const id = make.appId();
    const { ui, views, flush } = setup(new Map([[id, AI]]));
    const { found } = imageHost(id, TEXT_TIER);
    ui.render({ found: [found], changed: [] });
    await flush();
    expect(views[0]?.slot).toMatchObject({ kind: "compact", size: "text", position: "beforeend" });
    expect(found.anchor.hasAttribute("data-sar-anchor")).toBe(true);
  });

  it("gives a small image no slot", async () => {
    const id = make.appId();
    const { ui, views, flush } = setup(new Map([[id, AI]]));
    ui.render({ found: [imageHost(id, SMALL).found], changed: [] });
    await flush();
    expect(views[0]?.slot).toBeUndefined();
  });

  it("watches an image box with no size until a compact badge fits, then draws it", async () => {
    const id = make.appId();
    const { ui, detect, views, flush, watched, sized } = setup(
      new Map([[id, AI]]),
    );
    const { found, box } = imageHost(id, NO_SIZE);
    ui.render({ found: [found], changed: [] });
    await flush();
    expect(views[0]?.slot).toBeUndefined();
    expect([...watched]).toEqual([found.anchor]);
    box.mockReturnValue(NARROW);
    sized([found.anchor]);
    await flush();
    expect(views[1]?.slot).toBeUndefined();
    expect([...watched]).toEqual([found.anchor]);
    box.mockReturnValue(TEXT_TIER);
    sized([found.anchor]);
    await flush();
    expect(views[2]?.slot).toMatchObject({ kind: "compact", size: "text" });
    expect(watched.size).toBe(0);
    expect(detect).toHaveBeenCalledTimes(1);
  });

  it("lets go of the size watch on pagehide and starts a new one when needed", async () => {
    const id = make.appId();
    const { ui, flush, watched, disconnects } = setup(new Map([[id, AI]]));
    const { found } = imageHost(id, NO_SIZE);
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
    const small = make.appId();
    const unbadged = make.appId();
    const { ui, flush, watched } = setup(
      new Map<AppId, AiVerdict>([[small, AI], [unbadged, NOT_DISCLOSED]]),
    );
    ui.render({ found: [imageHost(small, SMALL).found], changed: [] });
    await flush();
    ui.render({ found: [imageHost(unbadged, NO_SIZE).found], changed: [] });
    await flush();
    expect(watched.size).toBe(0);
  });

  it("draws a changed host again from its known verdict, without a new detection", async () => {
    const id = make.appId();
    const { ui, detect, views, flush } = setup(new Map([[id, NOT_DISCLOSED]]));
    const found = host(id);
    ui.render({ found: [found], changed: [] });
    await flush();
    ui.render({ found: [], changed: [found] });
    await flush();
    expect(detect).toHaveBeenCalledTimes(1);
    expect(views).toHaveLength(2);
  });

  it("gives the renderers a verdict and an allow-list flag for every kind", async () => {
    const id = make.appId();
    const { ui, views, flush } = setup(new Map([[id, AI]]));
    ui.render({ found: [host(id)], changed: [] });
    await flush();
    expect(Object.keys(views[0]?.verdicts ?? {})).toStrictEqual([...KIND_IDS]);
    expect(Object.keys(views[0]?.allowed ?? {})).toStrictEqual([...KIND_IDS]);
  });

  it("redraws the hosts of an app after an allow-list change", async () => {
    const id = make.appId();
    const allowed = new Set<AppId>();
    const { ui, views, flush } = setup(new Map([[id, AI]]), { allowed });
    ui.render({ found: [host(id)], changed: [] });
    await flush();
    allowed.add(id);
    ui.refresh(new Set([id]));
    await flush();
    expect(views.map((view) => view.allowed.ai)).toEqual([false, true]);
    ui.refresh(new Set([make.appId()]));
    await flush();
    expect(views).toHaveLength(2);
  });

  it("asks again about the hosts whose verdicts are stale, and draws the new answer", async () => {
    const id = make.appId();
    const { ui, detect, views, flush } = setup(new Map([[id, AI]]));
    ui.render({ found: [host(id)], changed: [] });
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
    const BASE = make.appId();
    const DLC = make.appId();

    /** The real predicate over an ignore list, as the composition root wires it. */
    function ignoring(setupList: (ignored: ReturnType<typeof make.ignored>) => void) {
      const ignored = make.ignored();
      setupList(ignored);
      return (id: AppId, kind: KindId, related: Relations) => isIgnored(ignored, id, kind, related);
    }

    it("asks whether the game is ignored with the base game Steam named", async () => {
      const asked = vi.fn((_id: AppId, _kind: KindId, _related: Relations) => false);
      const { ui, flush } = setup(new Map([[DLC, AI]]), {
        others: { parent: BASE },
        isAllowed: asked,
      });
      ui.render({ found: [host(DLC)], changed: [] });
      await flush();
      expect(asked).toHaveBeenCalledWith(DLC, "ai", expect.objectContaining({ parent: BASE }));
      expect(asked).toHaveBeenCalledTimes(KIND_IDS.length);
    });

    it("flags a DLC of a base game ignored for one kind in that kind only", async () => {
      const isAllowed = ignoring((ignored) => ignored.games.ai.add(BASE));
      const { ui, views, flush } = setup(new Map([[DLC, AI]]), {
        others: { parent: BASE, pvp: PVP },
        isAllowed,
      });
      ui.render({ found: [host(DLC)], changed: [] });
      await flush();
      expect(views[0]?.allowed.ai).toBe(true);
      expect(views[0]?.allowed.pvp).toBe(false);
      expect(views[0]?.slot).toMatchObject({ kind: "full" });
    });

    it("gives a DLC whose only disclosure is ignored through its base game no slot", async () => {
      const isAllowed = ignoring((ignored) => ignored.games.all.add(BASE));
      const { ui, views, flush } = setup(new Map([[DLC, AI]]), {
        others: { parent: BASE },
        isAllowed,
      });
      ui.render({ found: [host(DLC)], changed: [] });
      await flush();
      expect(views[0]?.slot).toBeUndefined();
      expect(KIND_IDS.every((kind) => views[0]?.allowed[kind] === true)).toBe(true);
    });

    it("draws the DLC again when its base game is ignored or restored, and only then", async () => {
      const ignored = make.ignored();
      const { ui, views, flush } = setup(new Map([[DLC, AI]]), {
        others: { parent: BASE },
        isAllowed: (id, kind, related) => isIgnored(ignored, id, kind, related),
      });
      ui.render({ found: [host(DLC)], changed: [] });
      await flush();
      ignored.games.ai.add(BASE);
      ui.refresh(new Set([BASE]));
      await flush();
      ui.refresh(new Set([make.appId()]));
      await flush();
      ignored.games.ai.delete(BASE);
      ui.refresh(new Set([BASE]));
      await flush();
      expect(views.map((view) => view.allowed.ai)).toEqual([false, true, false]);
    });

    it("leaves a DLC with no known base game on its own entries", async () => {
      const isAllowed = ignoring((ignored) => ignored.games.all.add(BASE));
      const { ui, views, flush } = setup(new Map([[DLC, AI]]), { isAllowed });
      ui.render({ found: [host(DLC)], changed: [] });
      await flush();
      expect(views[0]?.allowed.ai).toBe(false);
    });
  });

  describe("after a transient answer", () => {
    const DISCLOSED = make.verdicts({ ai: AI });
    const ERROR = make.verdicts.uniform("error");
    const MISSING = make.verdicts.uniform("missing");
    const LIMITED = make.verdicts.uniform("rate-limited");
    const stay = (_found: CapsuleHost) => undefined;
    const leave = (found: CapsuleHost) => {
      found.element.remove();
    };

    /** A capsule UI on manual frames and retry timers, whose detector answers each call in turn. */
    function retrying(answers: readonly KindVerdicts[]) {
      const frames = fake.queue();
      const timers = fake.queue();
      const views: HostView[] = [];
      const detector = fake.detector(() =>
        answers[Math.min(detector.calls.length, answers.length) - 1] ?? MISSING
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
        ["unknown error: asked again", [ERROR, DISCLOSED], stay, 2, true],
        ["unknown rate-limited: asked again", [LIMITED, DISCLOSED], stay, 2, true],
        ["a host that left the page: not asked again", [ERROR, DISCLOSED], leave, 1, false],
        ["unknown missing, which is stored: not asked again", [MISSING, DISCLOSED], stay, 1, false],
        ["rate-limited every time: asked twice more", [LIMITED], stay, 1 + MAX_RETRIES, false],
      ] as const,
    )("%s", async (_name, answers, after, calls, chips) => {
      const { ui, detector, timers, views, answered } = retrying(answers);
      const found = host(make.appId());
      ui.render({ found: [found], changed: [] });
      for (let round = 0; round <= MAX_RETRIES + 1; round++) {
        await answered();
        after(found);
        timers.run();
      }
      expect(detector.calls).toHaveLength(calls);
      expect(timers.size).toBe(0);
      expect(views.at(-1)?.slot !== undefined).toBe(chips);
    });

    it.each<readonly [string, (ui: CapsuleUi) => void]>([
      ["pagehide", () => window.dispatchEvent(new Event("pagehide"))],
      ["stop", (ui) => {
        ui.stop();
      }],
    ])("cancels the pending retry on %s", async (_end, end) => {
      const { ui, timers, answered } = retrying([ERROR]);
      ui.render({ found: [host(make.appId())], changed: [] });
      await answered();
      expect(timers.size).toBe(1);
      end(ui);
      expect(timers.size).toBe(0);
    });
  });
});
