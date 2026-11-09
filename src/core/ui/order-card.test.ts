import { afterEach, describe, expect, it, vi } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { englishI18n } from "../../../tests/helpers/i18n";
import { writeSettings } from "../../../tests/helpers/settings";
import { mountForm } from "../../../tests/helpers/settings-form";
import { pageTransition } from "../../../tests/helpers/surfaces";
import { KIND_IDS, type KindId } from "../kinds/id";
import { OVERLAY_CHIPS, parseOrder, ROW_CHIPS, SUGGESTION_CHIPS } from "../kinds/order";
import { KIND_BY_ID } from "../kinds/registry";
import { parseSettings } from "../settings/settings";
import { createSettingsSource } from "../settings/settings-source";
import { keyDescription, keyText } from "./kind-keys";

const i18n = englishI18n();
/** The pitch of the rows a drag test lays out, in CSS pixels. */
const ROW = 30;
/** The number of tags the card announces, as the catalog parameter holds it. */
const KIND_COUNT = String(KIND_IDS.length);
/** Each limit a surface sets on its chips, with the catalog word for those surfaces. */
const LIMITS = [
  [OVERLAY_CHIPS, "options_order_surface_images"],
  [SUGGESTION_CHIPS, "options_order_surface_suggestions"],
  [ROW_CHIPS, "options_order_surface_rows"],
] as const;
/** The rows each cut line follows, once per distinct limit, top to bottom. */
const CUTS = [...new Set(LIMITS.map(([chips]) => chips))].sort((a, b) => a - b);
/** The room a cut line takes after the last row its surfaces show. */
const CUE = 10;
/** Where row `index` sits laid out: `ROW` apart, with a cut line after each limit's rows. */
const topOf = (index: number) => index * ROW + CUE * CUTS.filter((after) => index >= after).length;

/** The key that names a tag's row. */
const keyOf = (id: KindId) => keyText(i18n, KIND_BY_ID[id]).label;
/** What the card says when `id` lands at 1-based `position`. */
const dropped = (id: KindId, position: string) =>
  i18n.t("options_order_dropped", { name: keyOf(id), position, count: KIND_COUNT });

/** A form on the options page over a store whose settings hold `order`. */
async function setup(order: readonly KindId[] = KIND_IDS) {
  const store = fake.countingStore(fake.store());
  const settings = createSettingsSource(store);
  await writeSettings(settings, make.settings({ order }));
  const { root, form } = await mountForm({ settings });
  const handle = (id: KindId): HTMLElement => {
    const found = root.querySelector<HTMLElement>(`[data-tks-order="${id}"]`);
    if (found === null) {
      throw new TypeError(id);
    }
    return found;
  };
  const shown = () =>
    [...root.querySelectorAll(".tks-order-handle")].map((each) =>
      each.getAttribute("data-tks-order")
    );
  const stored = async () => parseSettings(await settings.read()).order;
  const spoken = () => root.querySelector("[aria-live]")?.textContent;
  return { root, form, store, settings, handle, shown, stored, spoken };
}

type Card = Awaited<ReturnType<typeof setup>>;

function press(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

/** A step that clicks the handle of `id`, picking it up or dropping the held row there. */
const pick = (id: KindId) => (card: Card) => {
  card.handle(id).click();
};

/** A step that presses `key` on the held handle. */
const key = (name: string) => (card: Card) => {
  press(card.root.querySelector("[aria-pressed=true]") ?? card.root, name);
};

function pointer(target: EventTarget, type: string, clientY: number): void {
  target.dispatchEvent(
    new PointerEvent(type, { bubbles: true, clientY, pointerId: 1, isPrimary: true }),
  );
}

/** Lays the rows out `ROW` pixels apart in their order, as a browser would. */
function layOut(card: Card): void {
  card.root.querySelectorAll(".tks-order-handle").forEach((handle, index) => {
    const row = handle.closest("li");
    if (row === null) {
      throw new TypeError(String(index));
    }
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: topOf(index), width: 300, height: ROW }),
    );
  });
}

/** Presses the handle of `id`, laid out, and drags it by `by` pixels. */
function drag(card: Card, id: KindId, by: number): HTMLElement {
  layOut(card);
  const handle = card.handle(id);
  const start = topOf(KIND_IDS.indexOf(id)) + ROW / 2;
  pointer(handle, "pointerdown", start);
  pointer(handle, "pointermove", start + by);
  return handle;
}

/** Each cut line in the list: how many rows sit above it, its text and its `aria-hidden`. */
function cutLines(root: ParentNode) {
  const children = [...(root.querySelector(".tks-order-list")?.children ?? [])];
  const rowsAbove = (index: number) =>
    children.slice(0, index).filter((each) => each.matches(".tks-order-row")).length;
  return children.flatMap((child, index) =>
    child.matches(".tks-order-cue")
      ? [{
        after: rowsAbove(index),
        text: child.textContent,
        hidden: child.getAttribute("aria-hidden"),
      }]
      : []
  );
}

const transforms = (card: Card) =>
  [...card.root.querySelectorAll<HTMLElement>(".tks-order-row")].map((row) => row.style.transform);

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("the Tag order card", () => {
  it("names each row and its handle by the tag's key, over any chip text set", async () => {
    const { handle, settings } = await setup();
    await writeSettings(settings, make.settings.chipText({ pvp: { chip: make.chipText() } }));
    const named = KIND_IDS.map((id) => {
      const row = handle(id).closest("li");
      return [
        row?.querySelector(".tks-order-key")?.textContent,
        row?.querySelector(".tks-order-description")?.textContent,
        handle(id).getAttribute("aria-label"),
      ];
    });
    expect(named).toEqual(
      KIND_IDS.map((id) => [
        keyOf(id),
        keyDescription(i18n, KIND_BY_ID[id]),
        i18n.t("options_order_handle", { name: keyOf(id) }),
      ]),
    );
  });

  it("lists every kind in the stored order, with a named handle and the cue", async () => {
    const order = parseOrder(["family", "pvp"]);
    const { root, handle, shown } = await setup(order);
    expect(shown()).toEqual(order);
    expect(root.querySelectorAll(".tks-order-list")).toHaveLength(1);
    expect(handle("family").getAttribute("aria-label")).toBe(
      i18n.t("options_order_handle", { name: keyOf("family") }),
    );
    const how = root.querySelector(`#${handle("family").getAttribute("aria-describedby") ?? ""}`);
    expect(how?.textContent).toBe(i18n.t("options_order_how"));
  });

  it("draws a line after each limit, naming its surfaces, that no key stops at", async () => {
    const { root, shown, handle } = await setup();
    const list = root.querySelector(".tks-order-list");
    expect(cutLines(root).map(({ after, hidden }) => [after, hidden])).toEqual(
      CUTS.map((after) => [after, "true"]),
    );
    for (const [after, word] of LIMITS) {
      expect(cutLines(root).find((line) => line.after === after)?.text).toContain(i18n.t(word));
    }
    const spoken = root.querySelector(".tks-card .tks-vh")?.textContent;
    expect(spoken).toBe(cutLines(root).map((line) => line.text).join(" "));
    expect(list?.querySelectorAll("button, [tabindex]")).toHaveLength(KIND_IDS.length);
    handle("ai").click();
    press(handle("ai"), "End");
    press(handle("ai"), "Enter");
    expect(shown()).toEqual([...KIND_IDS.slice(1), "ai"]);
    expect(cutLines(root).map((line) => line.after)).toEqual(CUTS);
  });

  it.each<[string, readonly ((card: Card) => void)[], readonly KindId[], string]>([
    [
      "moves down with the arrows",
      [pick("ai"), key("ArrowDown"), key("ArrowDown"), pick("ai")],
      ["earlyaccess", "family", "ai"],
      dropped("ai", "3"),
    ],
    [
      "goes first with Home",
      [pick("drm"), key("Home"), pick("drm")],
      ["drm"],
      dropped("drm", "1"),
    ],
    [
      "goes last with End",
      [pick("ai"), key("End"), pick("ai")],
      KIND_IDS.slice(1),
      dropped("ai", KIND_COUNT),
    ],
    [
      "stays first past the top",
      [pick("ai"), key("ArrowUp"), pick("ai")],
      [],
      dropped("ai", "1"),
    ],
    [
      "goes back with Escape",
      [pick("ai"), key("ArrowDown"), key("Escape")],
      [],
      i18n.t("options_order_cancelled", { name: keyOf("ai"), position: "1" }),
    ],
    [
      "takes another row's place on a click there",
      [pick("pvp"), pick("ai")],
      ["pvp"],
      dropped("pvp", "1"),
    ],
  ])("%s", async (_case, steps, first, said) => {
    const card = await setup();
    for (const step of steps) {
      step(card);
    }
    const expected = parseOrder(first);
    expect(card.shown()).toEqual(expected);
    await vi.waitFor(async () => {
      expect(await card.stored()).toEqual(expected);
      expect(card.spoken()).toBe(said);
    });
  });

  it("says where a picked up row is and marks its handle pressed", async () => {
    const { handle, spoken } = await setup();
    const at = String(KIND_IDS.indexOf("eula") + 1);
    handle("eula").click();
    expect(handle("eula").getAttribute("aria-pressed")).toBe("true");
    await vi.waitFor(() => {
      expect(spoken()).toBe(
        i18n.t("options_order_picked", { name: keyOf("eula"), position: at, count: KIND_COUNT }),
      );
    });
    press(handle("eula"), "ArrowUp");
    await vi.waitFor(() => {
      expect(spoken()).toBe(
        i18n.t("options_order_moved", {
          position: String(KIND_IDS.indexOf("eula")),
          count: KIND_COUNT,
        }),
      );
    });
  });

  it("keeps an unchanged order unwritten and the userscript dialog open on Escape", async () => {
    const { handle, store } = await setup();
    const writes = store.calls.set;
    handle("ai").click();
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    handle("ai").dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    handle("ai").click();
    handle("ai").click();
    expect(store.calls.set).toBe(writes);
  });

  it("drags a row with the pointer, the rows between opening its gap, and drops it", async () => {
    const card = await setup();
    const handle = drag(card, "ai", 2 * ROW + CUE + 5);
    expect(card.root.querySelector("[data-tks-dragging]")).not.toBeNull();
    expect(card.shown()).toEqual(KIND_IDS);
    // The row that crosses the cue moves by the room it takes too
    expect(transforms(card).slice(0, 4)).toEqual([
      `translateY(${String(2 * ROW + CUE + 5)}px)`,
      `translateY(-${String(ROW)}px)`,
      `translateY(-${String(ROW + CUE)}px)`,
      "",
    ]);
    pointer(handle, "pointerup", 0);
    handle.click();
    const expected = parseOrder(["earlyaccess", "family", "ai"]);
    expect(card.shown()).toEqual(expected);
    expect(transforms(card).every((value) => value === "")).toBe(true);
    expect(card.root.querySelector("[aria-pressed=true]")).toBeNull();
    await vi.waitFor(async () => {
      expect(await card.stored()).toEqual(expected);
    });
  });

  it("takes a press that never moves past the threshold as a click", async () => {
    const card = await setup();
    const handle = drag(card, "drm", 3);
    pointer(handle, "pointerup", 0);
    handle.click();
    expect(handle.getAttribute("aria-pressed")).toBe("true");
    expect(card.root.querySelector("[data-tks-dragging]")).toBeNull();
  });

  it.each<[string, (card: Card, handle: HTMLElement) => void]>([
    ["pointercancel", (_card, handle) => {
      pointer(handle, "pointercancel", 0);
    }],
    ["pagehide", () => {
      window.dispatchEvent(pageTransition("pagehide"));
    }],
    ["the form going away", (card) => {
      card.form.destroy();
    }],
  ])("puts a dragged row back and lets go on %s", async (_case, end) => {
    const card = await setup();
    const handle = drag(card, "ai", 3 * ROW);
    const writes = card.store.calls.set;
    end(card, handle);
    pointer(handle, "pointermove", 5 * ROW);
    pointer(handle, "pointerup", 5 * ROW);
    expect(transforms(card).every((value) => value === "")).toBe(true);
    expect(card.store.calls.set).toBe(writes);
    expect(await card.stored()).toEqual(KIND_IDS);
  });

  it("resets to the registry order and stores no order", async () => {
    const { root, shown, settings, spoken } = await setup(parseOrder(["family"]));
    root.querySelector<HTMLElement>("[data-tks-order-reset]")?.click();
    await vi.waitFor(async () => {
      expect(JSON.stringify(await settings.read())).not.toContain('"order"');
    });
    expect(shown()).toEqual(KIND_IDS);
    await vi.waitFor(() => {
      expect(spoken()).toBe(i18n.t("options_order_reset_done"));
    });
  });

  it("follows another tab's order, but never under a held row", async () => {
    const { settings, shown, handle } = await setup();
    const moved = parseOrder(["iap"]);
    await writeSettings(settings, make.settings({ order: moved }));
    expect(shown()).toEqual(moved);
    handle("ai").click();
    await writeSettings(settings, make.settings());
    expect(shown()).toEqual(moved);
  });

  it("shows the error and the stored order when a drop cannot be saved", async () => {
    const { root, handle, shown, store } = await setup();
    handle("ai").click();
    press(handle("ai"), "ArrowDown");
    store.break();
    handle("ai").click();
    await vi.waitFor(() => {
      expect(root.querySelector<HTMLElement>(".tks-order-list ~ .tks-field-error")?.hidden).toBe(
        false,
      );
    });
    expect(shown()).toEqual(KIND_IDS);
  });
});
