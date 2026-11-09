import { beforeEach, describe, expect, it } from "vitest";
import { setBody } from "../../../tests/helpers/dom";
import { make } from "../../../tests/helpers/factory";
import { hostView, type HostViewOptions } from "../../../tests/helpers/host-view";
import { englishI18n } from "../../../tests/helpers/i18n";
import { STATUS_KINDS } from "../../../tests/helpers/settings";
import { COMPAT_FACETS } from "../kinds/compat";
import { KIND_IDS, type KindId } from "../kinds/id";
import type { ChipWords } from "../kinds/kind-settings";
import { kindsInOrder, OVERLAY_CHIPS, parseOrder } from "../kinds/order";
import { KIND_BY_ID, KINDS } from "../kinds/registry";
import type { AnyDisclosed } from "../kinds/verdicts";
import { compactSize, createBadgeRenderer, createChip } from "./badge";
import type { BadgeSlot } from "./host";

function capsule(): {
  host: HTMLElement;
  link: HTMLAnchorElement;
  image: HTMLElement;
  title: HTMLElement;
} {
  setBody(`
    <div class="row"><a class="link" href="/app/${String(make.appId())}/"><div class="image"></div>
    <span class="title">${make.text.name()}</span></a></div>`);
  const host = document.querySelector<HTMLElement>(".row");
  const link = document.querySelector<HTMLAnchorElement>(".link");
  const image = document.querySelector<HTMLElement>(".image");
  const title = document.querySelector<HTMLElement>(".title");
  if (host === null || link === null || image === null || title === null) {
    throw new TypeError();
  }
  return { host, link, image, title };
}

type Capsule = ReturnType<typeof capsule>;

function view(host: Element, slot: BadgeSlot | undefined, options: HostViewOptions = {}) {
  return hostView(host, { ...options, slot });
}

describe("compactSize", () => {
  it.each(
    [
      [179, 70, undefined],
      [300, 31, undefined],
      [180, 32, "text"],
      [399, 400, "text"],
      [400, 149, "text"],
      [400, 150, "large"],
    ] as const,
  )("sizes a %ipx by %ipx image as %s", (width, height, expected) => {
    expect(compactSize(width, height)).toBe(expected);
  });
});

describe("createBadgeRenderer", () => {
  const i18n = englishI18n();
  const chip = (id: KindId) => i18n.t(KIND_BY_ID[id].messages.chip);
  // The accessible name starts with the visible chip text, then Steam's full line.
  const nameOf = (id: KindId) =>
    i18n.t("kind_chip_name", { chip: chip(id), heading: i18n.t(KIND_BY_ID[id].messages.heading) });
  const AI_NAME = nameOf("ai");
  const MANY: readonly KindId[] = ["ai", "drm", "pvp", "eula", "kernel"];

  let bound = new Map<Element, readonly AnyDisclosed[]>();
  let renderer = createBadgeRenderer(document, i18n, { bind: () => undefined });

  beforeEach(() => {
    bound = new Map();
    renderer = createBadgeRenderer(document, i18n, {
      bind: (trigger, entries) => bound.set(trigger, entries),
    });
  });

  const full = (anchor: Element): BadgeSlot => ({ kind: "full", anchor, position: "afterend" });
  const overlay = (anchor: Element, size: "text" | "large" = "text"): BadgeSlot => ({
    kind: "compact",
    anchor,
    position: "beforeend",
    size,
  });

  /** A chip's visible text and its accessible name. */
  function texts(element: Element) {
    return [
      element.querySelector(":scope > [aria-hidden]")?.textContent,
      element.querySelector(":scope > .sar-vh")?.textContent,
    ];
  }

  const chipsIn = (host: Element) => Array.from(host.querySelectorAll(".sar-chips > *"));
  /** The chip drawn at `index` in a host, counted from the end when negative. */
  function chipAt(host: Element, index: number): Element {
    const found = chipsIn(host).at(index);
    if (found === undefined) {
      throw new RangeError(String(index));
    }
    return found;
  }
  const kindsOf = (host: Element) => chipsIn(host).map((c) => c.getAttribute("data-sar-kind"));

  it("draws the full badge with the catalog label and binds it to the hover card", () => {
    const { host, title } = capsule();
    const verdict = make.verdict.disclosed("ai", { notes: make.text.note() });
    renderer.render(view(host, full(title), { verdict }));
    const group = host.querySelector(".sar-chips");
    expect(group?.previousElementSibling).toBe(title);
    expect(group?.getAttribute("data-sar-chips")).toBe("full");
    const badge = host.querySelector<HTMLElement>(".sar-badge");
    expect(badge?.parentElement).toBe(group);
    expect(badge?.querySelector(".sar-badge-label")?.textContent).toBe(chip("ai"));
    expect(badge?.querySelector(".sar-badge-label")?.getAttribute("aria-hidden")).toBe("true");
    expect(badge?.querySelector(".sar-vh")?.textContent).toBe(AI_NAME);
    expect(badge?.getAttribute("data-sar-kind")).toBe("ai");
    expect(badge?.querySelector("svg")).toBeNull();
    expect(badge?.hasAttribute("title")).toBe(false);
    expect(badge === null ? undefined : bound.get(badge)).toEqual([verdict]);
  });

  it.each(
    KINDS.filter((kind) => kind.id !== "pvp" && kind.facets === undefined).map(({ id }) => id),
  )(
    "gives the %s chip an accessible name that starts with its text",
    (id) => {
      const { host, title } = capsule();
      renderer.render(view(host, full(title), { verdicts: make.verdicts.only([id]) }));
      const [label, name] = texts(chipAt(host, 0));
      expect(label).toBe(chip(id));
      expect(name).toBe(nameOf(id));
      expect(name?.startsWith(chip(id))).toBe(true);
      expect(name).toContain(i18n.t(KIND_BY_ID[id].messages.heading));
    },
  );

  it.each(
    STATUS_KINDS.flatMap((kind) => COMPAT_FACETS.map((facet) => [kind, facet] as const)),
  )("gives a %s chip rated %s the device word and Steam's value word", (kind, facet) => {
    const { host, title } = capsule();
    const verdicts = { ...make.verdicts.only([]), [kind]: make.verdict.disclosed(kind, { facet }) };
    renderer.render(view(host, full(title), { verdicts }));
    const label = i18n.t("kind_facet_chip", {
      chip: chip(kind),
      value: i18n.t(`kind_compat_${facet}`),
    });
    const heading = i18n.t(KIND_BY_ID[kind].messages.heading);
    expect(texts(chipAt(host, 0))).toEqual([
      label,
      i18n.t("kind_chip_name", { chip: label, heading }),
    ]);
  });

  it("gives the PvP chip the name PvP once, not PvP: PvP", () => {
    const { host, title } = capsule();
    renderer.render(view(host, full(title), { verdicts: make.verdicts.only(["pvp"]) }));
    const [label, name] = texts(chipAt(host, 0));
    expect(label).toBe(i18n.t("kind_pvp_chip"));
    expect(name).toBe(i18n.t("kind_pvp_heading"));
  });

  describe("with the person's chip text", () => {
    let words: ChipWords = {};
    const MINE = make.chipText();
    const ME = make.chipText();
    /** Where a chip draws: on a row, or over an image in the text or the large tier. */
    const SLOTS = {
      full: (at: Capsule) => full(at.title),
      text: (at: Capsule) => overlay(at.image, "text"),
      large: (at: Capsule) => overlay(at.image, "large"),
    };
    type SlotKind = keyof typeof SLOTS;

    beforeEach(() => {
      words = {};
      renderer = createBadgeRenderer(
        document,
        i18n,
        { bind: () => undefined },
        undefined,
        () => words,
      );
    });

    /** The visible text of the first chip drawn in a slot, with these texts for AI. */
    function drawnLabel(own: { chip?: string; chipCompact?: string; }, slot: SlotKind) {
      words = make.settings.chipText({ ai: own }).kinds;
      const drawn = capsule();
      renderer.render(
        view(drawn.host, SLOTS[slot](drawn), { verdicts: make.verdicts.only(["ai"]) }),
      );
      return texts(chipAt(drawn.host, 0));
    }

    it.each<readonly [SlotKind, { chip?: string; chipCompact?: string; }, string]>([
      ["full", { chip: MINE, chipCompact: ME }, MINE],
      ["large", { chip: MINE, chipCompact: ME }, MINE],
      ["text", { chip: MINE, chipCompact: ME }, ME],
      ["text", { chip: MINE }, MINE],
    ])("shows on a %s chip, given %j, the text %s", (slot, own, expected) => {
      expect(drawnLabel(own, slot)[0]).toBe(expected);
    });

    it.each<SlotKind>(["full", "text"])("falls back to the catalog on a %s chip", (slot) => {
      expect(drawnLabel({}, slot)[0]).toBe(chip("ai"));
    });

    it("sets markup as literal text, never as elements", () => {
      const markup = make.text.markup();
      const [label, name] = drawnLabel({ chip: markup }, "full");
      expect(label).toBe(markup);
      expect(name?.startsWith(markup)).toBe(true);
      expect(document.querySelector(".sar-chips b")).toBeNull();
    });

    it("draws a host again when only the text changed", () => {
      const { host, title } = capsule();
      const drawn = view(host, full(title), { verdicts: make.verdicts.only(["ai"]) });
      renderer.render(drawn);
      words = make.settings.chipText({ ai: { chip: MINE } }).kinds;
      renderer.render(drawn);
      expect(texts(chipAt(host, 0))[0]).toBe(MINE);
    });
  });

  it("draws one chip per disclosed kind, in registry order, whatever the data order", () => {
    const { host, title } = capsule();
    const verdicts = make.verdicts.only(["pvp", "drm", "ai"]);
    renderer.render(view(host, full(title), { verdicts, maxChips: 5 }));
    expect(host.querySelectorAll(".sar-chips")).toHaveLength(1);
    expect(kindsOf(host)).toEqual(["ai", "drm", "pvp"]);
    expect(chipsIn(host).map((c) => texts(c)[0])).toEqual([chip("ai"), chip("drm"), chip("pvp")]);
  });

  it("binds every chip to the verdicts of all the kinds shown", () => {
    const { host, title } = capsule();
    const verdicts = make.verdicts.full();
    renderer.render(view(host, full(title), { verdicts, maxChips: KIND_IDS.length }));
    const expected = KIND_IDS.map((id) => verdicts[id]);
    expect(chipsIn(host)).toHaveLength(KIND_IDS.length);
    for (const element of chipsIn(host)) {
      expect(bound.get(element)).toEqual(expected);
    }
  });

  describe("in the person's tag order", () => {
    let order: readonly KindId[] = KIND_IDS;

    beforeEach(() => {
      order = KIND_IDS;
      renderer = createBadgeRenderer(
        document,
        i18n,
        { bind: (trigger, entries) => bound.set(trigger, entries) },
        () => kindsInOrder(order),
      );
    });

    it.each<readonly KindId[]>([KIND_IDS, parseOrder(["pvp", "eula"]), parseOrder(["drm"])])(
      "shows the first of %j over an image and every kind in the card, in that order",
      (...moved) => {
        order = moved;
        const { host, image } = capsule();
        const listed = order.filter((id) => MANY.includes(id));
        renderer.render(
          view(host, overlay(image), {
            verdicts: make.verdicts.only(MANY),
            maxChips: OVERLAY_CHIPS,
          }),
        );
        expect(kindsOf(host)).toEqual([...listed.slice(0, OVERLAY_CHIPS), null]);
        expect(bound.get(chipAt(host, -1))?.map((v) => v.kind)).toEqual(listed);
      },
    );

    it("draws a host again when only the order changed", () => {
      const { host, title } = capsule();
      const drawn = view(host, full(title), { verdicts: make.verdicts.only(MANY), maxChips: 5 });
      renderer.render(drawn);
      order = parseOrder(["pvp"]);
      renderer.render(drawn);
      expect(kindsOf(host)).toEqual(["pvp", ...MANY.filter((id) => id !== "pvp")]);
    });
  });

  describe("past the placement's allowance", () => {
    it("shows the allowed chips and a +N chip for the rest", () => {
      const { host, title } = capsule();
      const maxChips = 2;
      renderer.render(view(host, full(title), { verdicts: make.verdicts.only(MANY), maxChips }));
      expect(kindsOf(host)).toEqual([...MANY.slice(0, maxChips), null]);
      const more = chipAt(host, maxChips);
      const label = i18n.t("kind_chip_more", { count: String(MANY.length - maxChips) });
      expect(more.classList.contains("sar-badge")).toBe(true);
      expect(texts(more)).toEqual([
        label,
        i18n.t("kind_chip_name", { chip: label, heading: i18n.t("kind_chip_more_name") }),
      ]);
    });

    it.each<readonly [number, readonly (string | null)[]]>([
      [MANY.length, MANY],
      [0, [null]],
    ])("with an allowance of %i draws the kinds %j", (maxChips, expected) => {
      const { host, title } = capsule();
      renderer.render(view(host, full(title), { verdicts: make.verdicts.only(MANY), maxChips }));
      expect(kindsOf(host)).toEqual(expected);
    });

    it("counts only the kinds shown, not the ones whose badges are off", () => {
      const { host, title } = capsule();
      const unbadged: readonly KindId[] = ["ai", "kernel", "pvp"];
      renderer.render(
        view(host, full(title), { verdicts: make.verdicts.only(MANY), unbadged, maxChips: 2 }),
      );
      expect(kindsOf(host)).toEqual(["drm", "eula"]);
    });

    it("draws the +N chip in the compact style over an image", () => {
      const { host, image } = capsule();
      const maxChips = 1;
      renderer.render(view(host, overlay(image), { verdicts: make.verdicts.only(MANY), maxChips }));
      const chips = chipsIn(host);
      expect(chips.map((c) => c.className)).toEqual(["sar-compact", "sar-compact"]);
      expect(chips[1]?.querySelector(".sar-compact-label")?.textContent).toBe(
        i18n.t("kind_chip_more", { count: String(MANY.length - maxChips) }),
      );
      expect(chips[1]?.getAttribute("data-sar-size")).toBe("text");
    });
  });

  it("binds a kept group to new verdicts without drawing it again", () => {
    const { host, title } = capsule();
    const slot = full(title);
    renderer.render(view(host, slot));
    const group = host.querySelector(".sar-chips");
    const next = make.verdict.disclosed("ai", { notes: make.text.note() });
    renderer.render(view(host, slot, { verdict: next }));
    expect(host.querySelector(".sar-chips")).toBe(group);
    const badge = host.querySelector(".sar-badge");
    expect(badge === null ? undefined : bound.get(badge)).toEqual([next]);
  });

  it("draws the group again when the kinds, the allowance or the slot change", () => {
    const { host, title, image } = capsule();
    renderer.render(view(host, full(title), { verdicts: make.verdicts.only(["ai"]) }));
    const first = host.querySelector(".sar-chips");
    renderer.render(view(host, full(title), { verdicts: make.verdicts.only(["ai", "drm"]) }));
    expect(host.querySelector(".sar-chips")).not.toBe(first);
    expect(first?.isConnected).toBe(false);
    expect(kindsOf(host)).toEqual(["ai", "drm"]);
    const verdicts = make.verdicts.only(["ai", "drm"]);
    renderer.render(view(host, full(title), { verdicts, maxChips: 1 }));
    expect(kindsOf(host)).toEqual(["ai", null]);
    renderer.render(view(host, overlay(image), { verdicts, maxChips: 1 }));
    expect(host.querySelectorAll(".sar-chips")).toHaveLength(1);
    expect(host.querySelector(".sar-chips")?.getAttribute("data-sar-chips")).toBe("compact");
  });

  it("draws the compact chips in their tier, linked to the capsule link", () => {
    const { host, image } = capsule();
    const verdicts = make.verdicts.only(["ai", "kernel"]);
    renderer.render(view(host, overlay(image, "large"), { verdicts }));
    const group = image.querySelector(".sar-chips");
    const chips = Array.from(image.querySelectorAll<HTMLElement>(".sar-chips > .sar-compact"));
    expect(group?.getAttribute("data-sar-chips")).toBe("compact");
    expect(group?.getAttribute("data-sar-in-link")).toBe("true");
    expect(chips.map((c) => c.getAttribute("data-sar-size"))).toEqual(["large", "large"]);
    expect(chips.map((c) => texts(c))).toEqual([
      [chip("ai"), AI_NAME],
      [chip("kernel"), nameOf("kernel")],
    ]);
    expect(chips.some((c) => c.hasAttribute("title"))).toBe(false);
    expect(chips.every((c) => bound.has(c))).toBe(true);
  });

  it("gives compact chips outside a link no pointer", () => {
    setBody('<div class="row"><div class="image"></div></div>');
    const host = document.querySelector(".row");
    const image = document.querySelector(".image");
    if (host === null || image === null) {
      throw new TypeError();
    }
    renderer.render(view(host, overlay(image)));
    expect(image.querySelector(".sar-chips")?.hasAttribute("data-sar-in-link")).toBe(false);
  });

  it.each([
    ["not disclosed", make.verdict.notDisclosed()],
    ["unknown", make.verdict.unknown("error")],
  ])("renders nothing for %s", (_name, verdict) => {
    const { host, title } = capsule();
    const before = host.innerHTML;
    renderer.render(view(host, full(title), { verdict }));
    expect(host.innerHTML).toBe(before);
  });

  it("draws no chip for a kind that is ignored or has its badges off", () => {
    const { host, title } = capsule();
    renderer.render(
      view(host, full(title), {
        verdicts: make.verdicts.only(["ai", "drm", "eula"]),
        ignored: ["drm"],
        unbadged: ["eula"],
      }),
    );
    expect(kindsOf(host)).toEqual(["ai"]);
  });

  it("removes the chips of a game that is ignored for every kind", () => {
    const { host, title } = capsule();
    const slot = full(title);
    renderer.render(view(host, slot));
    expect(host.querySelectorAll(".sar-badge")).toHaveLength(1);
    renderer.render(view(host, slot, { allowed: true }));
    expect(host.querySelector(".sar-chips")).toBeNull();
  });

  it("keeps the group for the same view and restores one a re-render dropped", () => {
    const { host, title } = capsule();
    const slot = full(title);
    renderer.render(view(host, slot));
    const first = host.querySelector(".sar-chips");
    renderer.render(view(host, slot));
    expect(host.querySelector(".sar-chips")).toBe(first);
    first?.remove();
    renderer.render(view(host, slot));
    expect(host.querySelectorAll(".sar-chips")).toHaveLength(1);
    expect(host.querySelector(".sar-chips")).not.toBe(first);
  });

  it("draws no chip where the placement gives no slot", () => {
    const { host } = capsule();
    renderer.render(view(host, undefined));
    expect(host.querySelector(".sar-chips, .sar-badge, .sar-compact")).toBeNull();
  });
});

describe("createChip", () => {
  it("builds a chip with the kind's text, name and id", () => {
    const i18n = englishI18n();
    const element = createChip(document, i18n, make.verdict.disclosed("drm"));
    expect(element.className).toBe("sar-badge");
    expect(element.getAttribute("data-sar-kind")).toBe("drm");
    expect(element.querySelector(".sar-badge-label")?.textContent).toBe(i18n.t("kind_drm_chip"));
  });
});
