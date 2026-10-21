import { describe, expect, it, vi } from "vitest";
import { setBody } from "../../../tests/helpers/dom";
import { disclosedVerdict, NOT_DISCLOSED } from "../../../tests/helpers/verdicts";
import { GENERIC, type Placement } from "../scan/placements";
import type { CapsuleHost } from "../scan/renderer";
import { type AppId, type Detector, toAppId, type Verdict } from "../types";
import { createCapsuleUi, type SizeWatch } from "./capsules";
import type { HostView } from "./host";

const ROW: Placement = {
  id: "row",
  host: "*",
  hideable: false,
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

function setup(verdicts: ReadonlyMap<AppId, Verdict>, allowed = new Set<AppId>()) {
  const detect = vi.fn((ids: readonly AppId[]) =>
    Promise.resolve(
      new Map(ids.flatMap((id) => {
        const verdict = verdicts.get(id);
        return verdict === undefined ? [] : [[id, verdict] as const];
      })),
    )
  );
  const detector: Detector = { detect };
  const views: HostView[] = [];
  const frames: (() => void)[] = [];
  const watched = new Set<Element>();
  let reportSized: (elements: readonly Element[]) => void = () => undefined;
  const ui = createCapsuleUi({
    document,
    detector,
    renderers: [{ render: (view) => views.push(view) }],
    isAllowed: (id) => allowed.has(id),
    frame: (callback) => frames.push(callback),
    watchSize: (onSized): SizeWatch => {
      reportSized = onSized;
      return { observe: (element) => watched.add(element), unobserve: (e) => watched.delete(e) };
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
  return { ui, detect, views, flush, watched, sized };
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

  it("does not watch a small image that has a size, nor a host without a badge", async () => {
    const { ui, flush, watched } = setup(
      new Map<AppId, Verdict>([[appId(14), disclosedVerdict()], [appId(15), NOT_DISCLOSED]]),
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

  it("redraws the hosts of an app after an allow-list change", async () => {
    const id = appId(11);
    const allowed = new Set<AppId>();
    const { ui, views, flush } = setup(new Map([[id, disclosedVerdict()]]), allowed);
    ui.render({ found: [host(11)], changed: [] });
    await flush();
    allowed.add(id);
    ui.refresh(new Set([id]));
    await flush();
    expect(views.map((view) => view.allowed)).toEqual([false, true]);
    ui.refresh(new Set([appId(12)]));
    await flush();
    expect(views).toHaveLength(2);
  });
});
