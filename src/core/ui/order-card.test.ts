import { afterEach, describe, expect, it, vi } from "vitest";
import { countingStore } from "../../../tests/helpers/counting-store";
import { englishI18n } from "../../../tests/helpers/i18n";
import { memoryStore } from "../../../tests/helpers/memory-store";
import { withChipText, writeSettings } from "../../../tests/helpers/settings";
import { mountForm } from "../../../tests/helpers/settings-form";
import { pageTransition } from "../../../tests/helpers/surfaces";
import { KIND_IDS, type KindId } from "../kinds/id";
import { OVERLAY_CHIPS, parseOrder } from "../kinds/order";
import { KIND_BY_ID } from "../kinds/registry";
import { DEFAULT_SETTINGS, parseSettings } from "../settings/settings";
import { createSettingsSource } from "../settings/settings-source";

const i18n = englishI18n();
/** The pitch of the rows a drag test lays out, in CSS pixels. */
const ROW = 30;

const chip = (id: KindId) => i18n.t(KIND_BY_ID[id].messages.chip);

/** A form on the options page over a store whose settings hold `order`. */
async function setup(order: readonly KindId[] = KIND_IDS) {
  const store = countingStore(memoryStore());
  const settings = createSettingsSource(store);
  await writeSettings(settings, { ...DEFAULT_SETTINGS, order });
  const { root, form } = await mountForm({ settings });
  const handle = (id: KindId): HTMLElement => {
    const found = root.querySelector<HTMLElement>(`[data-sar-order="${id}"]`);
    if (found === null) {
      throw new TypeError(id);
    }
    return found;
  };
  const shown = () =>
    [...root.querySelectorAll(".sar-order-handle")].map((each) =>
      each.getAttribute("data-sar-order")
    );
  const stored = async () => parseSettings(await settings.read()).order;
  const spoken = () => root.querySelector("[aria-live]")?.textContent;
  return { root, form, store, settings, handle, shown, stored, spoken };
}

type Card = Awaited<ReturnType<typeof setup>>;

function press(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

function pointer(target: EventTarget, type: string, clientY: number): void {
  target.dispatchEvent(
    new PointerEvent(type, { bubbles: true, clientY, pointerId: 1, isPrimary: true }),
  );
}

/** Lays the rows out `ROW` pixels apart in their order, as a browser would. */
function layOut(card: Card): void {
  card.shown().forEach((id, index) => {
    const row = card.root.querySelector(`[data-sar-order="${id ?? ""}"]`)?.closest("li");
    if (row !== null && row !== undefined) {
      vi.spyOn(row, "getBoundingClientRect").mockReturnValue(
        DOMRect.fromRect({ x: 0, y: index * ROW, width: 300, height: ROW }),
      );
    }
  });
}

/** Presses the handle of `id`, laid out, and drags it by `by` pixels. */
function drag(card: Card, id: KindId, by: number): HTMLElement {
  layOut(card);
  const handle = card.handle(id);
  const start = KIND_IDS.indexOf(id) * ROW + ROW / 2;
  pointer(handle, "pointerdown", start);
  pointer(handle, "pointermove", start + by);
  return handle;
}

const transforms = (card: Card) =>
  [...card.root.querySelectorAll<HTMLElement>(".sar-order-row")].map((row) => row.style.transform);

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("the Tag order card", () => {
  it("names a row and its handle by the person's chip text, with Steam's line beside", async () => {
    const { root, handle, settings } = await setup();
    await writeSettings(settings, withChipText(DEFAULT_SETTINGS, { pvp: { chip: "Versus" } }));
    const row = handle("pvp").closest("li");
    expect(row?.querySelector(".sar-order-chip")?.textContent).toBe("Versus");
    expect(row?.querySelector<HTMLElement>(".sar-order-heading")?.hidden).toBe(false);
    expect(handle("pvp").getAttribute("aria-label")).toBe(
      i18n.t("options_order_handle", { name: "Versus" }),
    );
    expect(root.querySelector(".sar-order-row .sar-order-chip")?.textContent).toBe(chip("ai"));
  });

  it("lists every kind in the stored order, with a named handle and the small marks", async () => {
    const order = parseOrder(["family", "pvp"]);
    const { root, handle, shown } = await setup(order);
    expect(shown()).toEqual(order);
    expect(root.querySelectorAll(".sar-order-list")).toHaveLength(1);
    expect(handle("family").getAttribute("aria-label")).toBe(
      i18n.t("options_order_handle", { name: chip("family") }),
    );
    const how = root.querySelector(`#${handle("family").getAttribute("aria-describedby") ?? ""}`);
    expect(how?.textContent).toBe(i18n.t("options_order_how"));
    const marked = [...root.querySelectorAll(".sar-order-small")].map((mark) =>
      !mark.hasAttribute("hidden")
    );
    expect(marked).toEqual(order.map((_, index) => index < OVERLAY_CHIPS));
  });

  it.each<[string, readonly ([string, KindId] | string)[], readonly KindId[], string]>([
    ["moves down with the arrows", [["pick", "ai"], "ArrowDown", "ArrowDown", ["pick", "ai"]], [
      "kernel",
      "anticheat",
      "ai",
    ], i18n.t("options_order_dropped", { name: chip("ai"), position: "3", count: "11" })],
    [
      "goes first with Home",
      [["pick", "drm"], "Home", ["pick", "drm"]],
      ["drm"],
      i18n.t(
        "options_order_dropped",
        { name: chip("drm"), position: "1", count: "11" },
      ),
    ],
    [
      "goes last with End",
      [["pick", "ai"], "End", ["pick", "ai"]],
      KIND_IDS.slice(1),
      i18n.t(
        "options_order_dropped",
        { name: chip("ai"), position: "11", count: "11" },
      ),
    ],
    [
      "stays first past the top",
      [["pick", "ai"], "ArrowUp", ["pick", "ai"]],
      [],
      i18n.t(
        "options_order_dropped",
        { name: chip("ai"), position: "1", count: "11" },
      ),
    ],
    [
      "goes back with Escape",
      [["pick", "ai"], "ArrowDown", "Escape"],
      [],
      i18n.t(
        "options_order_cancelled",
        { name: chip("ai"), position: "1" },
      ),
    ],
    [
      "takes another row's place on a click there",
      [["pick", "pvp"], ["pick", "ai"]],
      ["pvp"],
      i18n
        .t("options_order_dropped", { name: chip("pvp"), position: "1", count: "11" }),
    ],
  ])("%s", async (_case, steps, first, said) => {
    const card = await setup();
    for (const step of steps) {
      if (typeof step === "string") {
        press(card.root.querySelector("[aria-pressed=true]") ?? card.root, step);
      } else {
        card.handle(step[1]).click();
      }
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
    handle("eula").click();
    expect(handle("eula").getAttribute("aria-pressed")).toBe("true");
    await vi.waitFor(() => {
      expect(spoken()).toBe(
        i18n.t("options_order_picked", { name: chip("eula"), position: "6", count: "11" }),
      );
    });
    press(handle("eula"), "ArrowUp");
    await vi.waitFor(() => {
      expect(spoken()).toBe(i18n.t("options_order_moved", { position: "5", count: "11" }));
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
    const handle = drag(card, "ai", 2 * ROW + 5);
    expect(card.root.querySelector("[data-sar-dragging]")).not.toBeNull();
    expect(card.shown()).toEqual(KIND_IDS);
    expect(transforms(card).slice(0, 4)).toEqual([
      `translateY(${String(2 * ROW + 5)}px)`,
      `translateY(-${String(ROW)}px)`,
      `translateY(-${String(ROW)}px)`,
      "",
    ]);
    pointer(handle, "pointerup", 0);
    handle.click();
    const expected = parseOrder(["kernel", "anticheat", "ai"]);
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
    expect(card.root.querySelector("[data-sar-dragging]")).toBeNull();
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
    root.querySelector<HTMLElement>("[data-sar-order-reset]")?.click();
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
    await writeSettings(settings, { ...DEFAULT_SETTINGS, order: moved });
    expect(shown()).toEqual(moved);
    handle("ai").click();
    await writeSettings(settings, DEFAULT_SETTINGS);
    expect(shown()).toEqual(moved);
  });

  it("shows the error and the stored order when a drop cannot be saved", async () => {
    const { root, handle, shown, store } = await setup();
    handle("ai").click();
    press(handle("ai"), "ArrowDown");
    store.break();
    handle("ai").click();
    await vi.waitFor(() => {
      expect(root.querySelector<HTMLElement>(".sar-order-list ~ .sar-field-error")?.hidden).toBe(
        false,
      );
    });
    expect(shown()).toEqual(KIND_IDS);
  });
});
