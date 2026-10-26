import { afterEach, describe, expect, it, vi } from "vitest";
import { englishI18n } from "../../../tests/helpers/i18n";
import { memoryStore } from "../../../tests/helpers/memory-store";
import { withChipText, withKind, writeSettings } from "../../../tests/helpers/settings";
import { mountForm } from "../../../tests/helpers/settings-form";
import { CATALOGS as CONTENT } from "../../platform/extension/content.catalogs.gen";
import { CATALOGS as OPTIONS } from "../../platform/extension/options.catalogs.gen";
import { CATALOGS as USERSCRIPT } from "../../platform/userscript/main.catalogs.gen";
import { SHIPPED_CATALOGS } from "../i18n/shipped";
import { CHIP_TEXT_LIMITS, type ChipTextField } from "../kinds/chip-text";
import type { KindId } from "../kinds/id";
import { KIND_BY_ID } from "../kinds/registry";
import { DEFAULT_SETTINGS, parseSettings, type Settings } from "../settings/settings";
import { createSettingsSource } from "../settings/settings-source";

const i18n = englishI18n();

/** The options page over a store holding `settings`, with ways to reach a tag's chip fields. */
async function setup(settings: Settings = DEFAULT_SETTINGS) {
  const source = createSettingsSource(memoryStore());
  await writeSettings(source, settings);
  const { root, tab } = await mountForm({ settings: source });
  const box = (id: KindId, field: ChipTextField): HTMLInputElement => {
    const found = root.querySelector(`input[data-sar-setting=${field}][data-sar-for=${id}]`);
    if (!(found instanceof HTMLInputElement)) {
      throw new TypeError([id, field].join(" "));
    }
    return found;
  };
  const reset = (id: KindId, field: ChipTextField) =>
    root.querySelector<HTMLElement>(`[data-sar-chip-reset=${field}][data-sar-for=${id}]`);
  /** The visible text of the preview's badge and small image chip. */
  const preview = (id: KindId) =>
    [
      ...(box(id, "chip").closest("[role=tabpanel]")?.querySelectorAll(".sar-chip-preview > *")
        ?? []),
    ].map((chip) => [chip.className, chip.querySelector("[aria-hidden]")?.textContent]);
  const stored = async (id: KindId) => parseSettings(await source.read()).kinds[id];
  return { root, tab, source, box, reset, preview, stored };
}

/** Types into a box as a person does, then commits it when `commit` is set. */
function type(input: HTMLInputElement, text: string, commit = false): void {
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  if (commit) {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the chip text fields", () => {
  it.each<readonly [KindId, Settings, string]>([
    ["ai", DEFAULT_SETTINGS, i18n.t("kind_ai_chip")],
    ["deck", DEFAULT_SETTINGS, i18n.t("kind_deck_chip")],
    ["family", DEFAULT_SETTINGS, i18n.t("kind_family_unsupported_chip")],
    ["family", withKind(DEFAULT_SETTINGS, "family", { facets: [] }), i18n.t("kind_family_heading")],
  ])(
    "show the catalog's word for %s, the default, as each placeholder",
    async (id, settings, word) => {
      const { box } = await setup(settings);
      expect([box(id, "chip").placeholder, box(id, "chipCompact").placeholder]).toEqual([
        word,
        word,
      ]);
    },
  );

  it.each<ChipTextField>(["chip", "chipCompact"])("label %s and limit it", async (field) => {
    const { root, box } = await setup();
    const input = box("ai", field);
    expect(input.maxLength).toBe(CHIP_TEXT_LIMITS[field]);
    expect(root.querySelector(`label[for="${input.id}"]`)?.textContent).toBe(
      i18n.t(field === "chip" ? "options_chip_label" : "options_chip_compact_label"),
    );
  });

  it("save the text cleaned on change, and clear it once emptied", async () => {
    const { box, stored } = await setup();
    type(box("ai", "chip"), "  My   tag ", true);
    await vi.waitFor(async () => {
      expect((await stored("ai")).chip).toBe("My tag");
    });
    expect(box("ai", "chip").value).toBe("My tag");
    type(box("ai", "chip"), " ", true);
    await vi.waitFor(async () => {
      expect(await stored("ai")).not.toHaveProperty("chip");
    });
  });

  it.each<readonly [string, Partial<Record<ChipTextField, string>>, readonly string[]]>([
    ["the catalog's word on both", {}, [i18n.t("kind_ai_chip"), i18n.t("kind_ai_chip")]],
    ["the chip text on both", { chip: "Mine" }, ["Mine", "Mine"]],
    ["the short text on the small image", { chip: "Mine", chipCompact: "Me" }, ["Mine", "Me"]],
  ])("preview, as typed, %s", async (_case, typed, labels) => {
    const { box, preview } = await setup();
    for (const [field, text] of Object.entries(typed)) {
      if (field === "chip" || field === "chipCompact") {
        type(box("ai", field), text);
      }
    }
    expect(preview("ai")).toEqual([["sar-badge", labels[0]], ["sar-compact", labels[1]]]);
  });

  it("preview a tag with values by its first picked value", async () => {
    const { box, preview } = await setup(
      withKind(DEFAULT_SETTINGS, "deck", { facets: ["playable"] }),
    );
    type(box("deck", "chip"), "SD");
    const label = i18n.t("kind_facet_chip", { chip: "SD", value: i18n.t("kind_compat_playable") });
    expect(preview("deck")).toEqual([["sar-badge", label], ["sar-compact", label]]);
  });

  it("count what each box holds, of the most it takes", async () => {
    const { root, box } = await setup();
    type(box("ai", "chipCompact"), "Mine");
    const count = root.querySelector(`#${box("ai", "chipCompact").id}-count`);
    expect(count?.textContent).toBe(i18n.t("options_chip_count", { count: "4", max: "16" }));
    expect(box("ai", "chipCompact").getAttribute("aria-describedby")).toContain(count?.id);
  });

  it("offer Reset only for stored text, which clears it and returns focus", async () => {
    const { box, reset, stored } = await setup(
      withChipText(DEFAULT_SETTINGS, { ai: { chipCompact: "Me" } }),
    );
    expect(reset("ai", "chip")?.hidden).toBe(true);
    expect(reset("ai", "chipCompact")?.getAttribute("aria-label")).toBe(
      i18n.t("options_chip_compact_reset_label", {
        heading: i18n.t(KIND_BY_ID.ai.messages.heading),
      }),
    );
    reset("ai", "chipCompact")?.click();
    await vi.waitFor(async () => {
      expect(await stored("ai")).not.toHaveProperty("chipCompact");
    });
    expect(document.activeElement).toBe(box("ai", "chipCompact"));
    expect(reset("ai", "chipCompact")?.hidden).toBe(true);
  });

  it("keep text still being typed when another tab saves something else", async () => {
    const { box, source } = await setup();
    type(box("ai", "chip"), "Mi");
    await writeSettings(source, withKind(DEFAULT_SETTINGS, "drm", { filter: "dim" }));
    expect(box("ai", "chip").value).toBe("Mi");
  });

  it("show text another tab stored", async () => {
    const { box, source } = await setup();
    await writeSettings(source, withChipText(DEFAULT_SETTINGS, { drm: { chip: "Locks" } }));
    expect(box("drm", "chip").value).toBe("Locks");
  });

  it("keep the person's text out of every catalog", async () => {
    const catalogs = () => JSON.stringify([SHIPPED_CATALOGS, CONTENT, OPTIONS, USERSCRIPT]);
    const before = catalogs();
    const { box, stored } = await setup();
    type(box("ai", "chip"), "Zq own words", true);
    await vi.waitFor(async () => {
      expect((await stored("ai")).chip).toBe("Zq own words");
    });
    expect(catalogs()).toBe(before);
    expect(before).not.toContain("Zq own words");
  });
});
