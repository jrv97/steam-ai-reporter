import { beforeEach, describe, expect, it } from "vitest";
import { setBody } from "../../../tests/helpers/dom";
import { hostView, type HostViewOptions } from "../../../tests/helpers/host-view";
import { englishI18n } from "../../../tests/helpers/i18n";
import { STATUS_KINDS } from "../../../tests/helpers/settings";
import {
  compatVerdict,
  disclosedKinds,
  disclosedVerdict,
  FULL_DISCLOSED,
  NOT_DISCLOSED,
} from "../../../tests/helpers/verdicts";
import { COMPAT_FACETS } from "../kinds/compat";
import { KIND_IDS, type KindId } from "../kinds/id";
import { KIND_BY_ID, KINDS } from "../kinds/registry";
import type { AnyDisclosed } from "../kinds/verdicts";
import { UNKNOWN } from "../types";
import { compactSize, createBadgeRenderer, createChip } from "./badge";
import type { BadgeSlot } from "./host";

function capsule(): {
  host: HTMLElement;
  link: HTMLAnchorElement;
  image: HTMLElement;
  title: HTMLElement;
} {
  setBody(`
    <div class="row"><a class="link" href="/app/10/"><div class="image"></div>
    <span class="title">Game</span></a></div>`);
  const host = document.querySelector<HTMLElement>(".row");
  const link = document.querySelector<HTMLAnchorElement>(".link");
  const image = document.querySelector<HTMLElement>(".image");
  const title = document.querySelector<HTMLElement>(".title");
  if (host === null || link === null || image === null || title === null) {
    throw new TypeError();
  }
  return { host, link, image, title };
}

function view(host: Element, slot: BadgeSlot | undefined, options: HostViewOptions = {}) {
  return hostView(host, { ...options, slot });
}

describe("compactSize", () => {
  it("gives small images no badge", () => {
    expect(compactSize(179, 70)).toBeUndefined();
    expect(compactSize(300, 31)).toBeUndefined();
  });

  it("uses the text tier from 180px and the large tier from 400 by 150", () => {
    expect(compactSize(180, 32)).toBe("text");
    expect(compactSize(399, 400)).toBe("text");
    expect(compactSize(400, 149)).toBe("text");
    expect(compactSize(400, 150)).toBe("large");
  });
});

describe("createBadgeRenderer", () => {
  const i18n = englishI18n();
  const chip = (id: KindId) => i18n.t(KIND_BY_ID[id].messages.chip);
  // The accessible name starts with the visible chip text, then Steam's full line.
  const nameOf = (id: KindId) => {
    const heading = i18n.t(KIND_BY_ID[id].messages.heading);
    return chip(id) === heading ? heading : i18n.t("kind_chip_name", { chip: chip(id), heading });
  };
  const AI_NAME = nameOf("ai");
  const MANY: readonly KindId[] = ["ai", "kernel", "drm", "eula", "pvp"];

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
  const kindsOf = (host: Element) => chipsIn(host).map((c) => c.getAttribute("data-sar-kind"));

  it("draws the full badge with the catalog label and binds it to the hover card", () => {
    const { host, title } = capsule();
    const verdict = disclosedVerdict({ notes: "Concept art." });
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
      renderer.render(view(host, full(title), { verdicts: disclosedKinds([id]) }));
      const [label, name] = texts(chipsIn(host)[0] ?? host);
      expect(label).toBe(chip(id));
      expect(name).toBe(nameOf(id));
      expect(name?.startsWith(`${label ?? ""}: `)).toBe(true);
      expect(name).toContain(i18n.t(KIND_BY_ID[id].messages.heading));
    },
  );

  it.each(
    STATUS_KINDS.flatMap((kind) => COMPAT_FACETS.map((facet) => [kind, facet] as const)),
  )("gives a %s chip rated %s the device word and Steam's value word", (kind, facet) => {
    const { host, title } = capsule();
    const verdicts = { ...disclosedKinds([]), [kind]: compatVerdict(kind, facet) };
    renderer.render(view(host, full(title), { verdicts }));
    const value = i18n.t(`kind_compat_${facet}`);
    const heading = i18n.t(KIND_BY_ID[kind].messages.heading);
    expect(texts(chipsIn(host)[0] ?? host)).toEqual([
      i18n.t("kind_facet_chip", { chip: chip(kind), value }),
      i18n.t("kind_facet_name", { heading, value }),
    ]);
  });

  it("gives the PvP chip the name PvP once, not PvP: PvP", () => {
    const { host, title } = capsule();
    renderer.render(view(host, full(title), { verdicts: disclosedKinds(["pvp"]) }));
    const [label, name] = texts(chipsIn(host)[0] ?? host);
    expect(label).toBe(i18n.t("kind_pvp_chip"));
    expect(name).toBe(i18n.t("kind_pvp_heading"));
  });

  it("draws one chip per disclosed kind, in registry order, whatever the data order", () => {
    const { host, title } = capsule();
    const verdicts = disclosedKinds(["pvp", "drm", "ai"]);
    renderer.render(view(host, full(title), { verdicts, maxChips: 5 }));
    expect(host.querySelectorAll(".sar-chips")).toHaveLength(1);
    expect(kindsOf(host)).toEqual(["ai", "drm", "pvp"]);
    expect(chipsIn(host).map((c) => texts(c)[0])).toEqual([chip("ai"), chip("drm"), chip("pvp")]);
  });

  it("binds every chip to the verdicts of all the kinds shown", () => {
    const { host, title } = capsule();
    renderer.render(view(host, full(title), { verdicts: FULL_DISCLOSED, maxChips: 10 }));
    const expected = KIND_IDS.map((id) => FULL_DISCLOSED[id]);
    expect(chipsIn(host)).toHaveLength(KIND_IDS.length);
    for (const element of chipsIn(host)) {
      expect(bound.get(element)).toEqual(expected);
    }
  });

  describe("past the placement's allowance", () => {
    it("shows the allowed chips and a +N chip for the rest", () => {
      const { host, title } = capsule();
      renderer.render(view(host, full(title), { verdicts: disclosedKinds(MANY), maxChips: 2 }));
      expect(kindsOf(host)).toEqual(["ai", "kernel", null]);
      const more = chipsIn(host)[2];
      const label = i18n.t("kind_chip_more", { count: "3" });
      expect(more?.classList.contains("sar-badge")).toBe(true);
      expect(texts(more ?? host)).toEqual([
        label,
        i18n.t("kind_chip_name", { chip: label, heading: i18n.t("kind_chip_more_name") }),
      ]);
    });

    it("lists all the kinds in the hover card from the +N chip too", () => {
      const { host, title } = capsule();
      renderer.render(view(host, full(title), { verdicts: disclosedKinds(MANY), maxChips: 2 }));
      const more = chipsIn(host)[2];
      expect(more === undefined ? undefined : bound.get(more)?.map((v) => v.kind)).toEqual(MANY);
    });

    it("draws no +N chip when the kinds fit exactly", () => {
      const { host, title } = capsule();
      renderer.render(view(host, full(title), { verdicts: disclosedKinds(MANY), maxChips: 5 }));
      expect(kindsOf(host)).toEqual(MANY);
    });

    it("can show nothing but the +N chip", () => {
      const { host, title } = capsule();
      renderer.render(view(host, full(title), { verdicts: disclosedKinds(MANY), maxChips: 0 }));
      expect(kindsOf(host)).toEqual([null]);
    });

    it("counts only the kinds shown, not the ones whose badges are off", () => {
      const { host, title } = capsule();
      const unbadged: readonly KindId[] = ["ai", "kernel", "pvp"];
      renderer.render(
        view(host, full(title), { verdicts: disclosedKinds(MANY), unbadged, maxChips: 2 }),
      );
      expect(kindsOf(host)).toEqual(["drm", "eula"]);
    });

    it("draws the +N chip in the compact style over an image", () => {
      const { host, image } = capsule();
      renderer.render(view(host, overlay(image), { verdicts: disclosedKinds(MANY), maxChips: 1 }));
      const chips = chipsIn(host);
      expect(chips.map((c) => c.className)).toEqual(["sar-compact", "sar-compact"]);
      expect(chips[1]?.querySelector(".sar-compact-label")?.textContent).toBe(
        i18n.t("kind_chip_more", { count: "4" }),
      );
      expect(chips[1]?.getAttribute("data-sar-size")).toBe("text");
    });
  });

  it("binds a kept group to new verdicts without drawing it again", () => {
    const { host, title } = capsule();
    const slot = full(title);
    renderer.render(view(host, slot));
    const group = host.querySelector(".sar-chips");
    const next = disclosedVerdict({ notes: "Voice lines." });
    renderer.render(view(host, slot, { verdict: next }));
    expect(host.querySelector(".sar-chips")).toBe(group);
    const badge = host.querySelector(".sar-badge");
    expect(badge === null ? undefined : bound.get(badge)).toEqual([next]);
  });

  it("draws the group again when the kinds, the allowance or the slot change", () => {
    const { host, title, image } = capsule();
    renderer.render(view(host, full(title), { verdicts: disclosedKinds(["ai"]) }));
    const first = host.querySelector(".sar-chips");
    renderer.render(view(host, full(title), { verdicts: disclosedKinds(["ai", "drm"]) }));
    expect(host.querySelector(".sar-chips")).not.toBe(first);
    expect(first?.isConnected).toBe(false);
    expect(kindsOf(host)).toEqual(["ai", "drm"]);
    const verdicts = disclosedKinds(["ai", "drm"]);
    renderer.render(view(host, full(title), { verdicts, maxChips: 1 }));
    expect(kindsOf(host)).toEqual(["ai", null]);
    renderer.render(view(host, overlay(image), { verdicts, maxChips: 1 }));
    expect(host.querySelectorAll(".sar-chips")).toHaveLength(1);
    expect(host.querySelector(".sar-chips")?.getAttribute("data-sar-chips")).toBe("compact");
  });

  it("draws the compact chips in their tier, linked to the capsule link", () => {
    const { host, image } = capsule();
    const verdicts = disclosedKinds(["ai", "kernel"]);
    renderer.render(view(host, overlay(image, "large"), { verdicts }));
    const chips = Array.from(image.querySelectorAll<HTMLElement>(".sar-chips > .sar-compact"));
    expect(image.querySelector(".sar-chips")?.getAttribute("data-sar-chips")).toBe("compact");
    expect(chips.map((c) => c.getAttribute("data-sar-size"))).toEqual(["large", "large"]);
    expect(chips.map((c) => c.getAttribute("data-sar-in-link"))).toEqual(["true", "true"]);
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
    expect(image.querySelector(".sar-compact")?.hasAttribute("data-sar-in-link")).toBe(false);
  });

  it.each([
    ["not disclosed", NOT_DISCLOSED],
    ["unknown", UNKNOWN.error],
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
        verdicts: disclosedKinds(["ai", "drm", "eula"]),
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
    const element = createChip(document, i18n, FULL_DISCLOSED.drm);
    expect(element.className).toBe("sar-badge");
    expect(element.getAttribute("data-sar-kind")).toBe("drm");
    expect(element.querySelector(".sar-badge-label")?.textContent).toBe(i18n.t("kind_drm_chip"));
  });
});
