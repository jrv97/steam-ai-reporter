import { afterEach, describe, expect, it, vi } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { englishI18n } from "../../../tests/helpers/i18n";
import { writeSettings } from "../../../tests/helpers/settings";
import { mountForm } from "../../../tests/helpers/settings-form";
import { CATALOGS as CONTENT } from "../../platform/extension/content.catalogs.gen";
import { CATALOGS as OPTIONS } from "../../platform/extension/options.catalogs.gen";
import { CATALOGS as USERSCRIPT } from "../../platform/userscript/main.catalogs.gen";
import { SHIPPED_CATALOGS } from "../i18n/shipped";
import type { BareMessageKey } from "../i18n/t";
import { CHIP_TEXT_LIMITS, type ChipTextField } from "../kinds/chip-text";
import type { KindId } from "../kinds/id";
import { KIND_BY_ID } from "../kinds/registry";
import { parseSettings, type Settings } from "../settings/settings";
import { createSettingsSource } from "../settings/settings-source";

const i18n = englishI18n();

/** The options page over a store holding `settings`, with ways to reach a tag's chip fields. */
async function setup(settings: Settings = make.settings()) {
  const source = createSettingsSource(fake.store());
  await writeSettings(source, settings);
  const { root, tab } = await mountForm({ settings: source });
  const box = (id: KindId, field: ChipTextField): HTMLInputElement => {
    const found = root.querySelector(`input[data-tks-setting=${field}][data-tks-for=${id}]`);
    if (!(found instanceof HTMLInputElement)) {
      throw new TypeError([id, field].join(" "));
    }
    return found;
  };
  const reset = (id: KindId, field: ChipTextField) =>
    root.querySelector<HTMLElement>(`[data-tks-chip-reset=${field}][data-tks-for=${id}]`);
  /** The visible text of the preview's badge and small image chip. */
  const preview = (id: KindId) =>
    [
      ...(box(id, "chip").closest("[role=tabpanel]")?.querySelectorAll(".tks-chip-preview > *")
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
    ["ai", make.settings(), i18n.t("kind_ai_chip")],
    ["deck", make.settings(), i18n.t("kind_deck_chip")],
    ["family", make.settings(), i18n.t("kind_family_unsupported_chip")],
    [
      "family",
      make.settings.kind("family", { tagged: make.settings.tagged.many() }),
      i18n.t("kind_family_heading"),
    ],
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

  it.each<readonly [ChipTextField, BareMessageKey]>([
    ["chip", "options_chip_label"],
    ["chipCompact", "options_chip_compact_label"],
  ])("label %s and limit it", async (field, key) => {
    const { root, box } = await setup();
    const input = box("ai", field);
    expect(input.maxLength).toBe(CHIP_TEXT_LIMITS[field]);
    expect(root.querySelector(`label[for="${input.id}"]`)?.textContent).toBe(i18n.t(key));
  });

  it("save the text cleaned on change, and clear it once emptied", async () => {
    const { box, stored } = await setup();
    const text = make.chipText();
    type(box("ai", "chip"), `  ${text.split(" ").join("   ")} `, true);
    await vi.waitFor(async () => {
      expect((await stored("ai")).chip).toBe(text);
    });
    expect(box("ai", "chip").value).toBe(text);
    type(box("ai", "chip"), " ", true);
    await vi.waitFor(async () => {
      expect(await stored("ai")).not.toHaveProperty("chip");
    });
  });

  const own = make.chipText();
  const short = make.chipText();

  it.each<readonly [string, readonly (readonly [ChipTextField, string])[], readonly string[]]>([
    ["the catalog's word on both", [], [i18n.t("kind_ai_chip"), i18n.t("kind_ai_chip")]],
    ["the chip text on both", [["chip", own]], [own, own]],
    ["the short text on the small image", [["chip", own], ["chipCompact", short]], [own, short]],
  ])("preview, as typed, %s", async (_case, typed, labels) => {
    const { box, preview } = await setup();
    for (const [field, text] of typed) {
      type(box("ai", field), text);
    }
    expect(preview("ai")).toEqual([["tks-badge", labels[0]], ["tks-compact", labels[1]]]);
  });

  it("preview a tag with values by its first picked value", async () => {
    const { box, preview } = await setup(
      make.settings.kind("deck", { tagged: make.settings.tagged.one("playable") }),
    );
    const text = make.chipText();
    type(box("deck", "chip"), text);
    const label = i18n.t("kind_facet_chip", { chip: text, value: i18n.t("kind_compat_playable") });
    expect(preview("deck")).toEqual([["tks-badge", label], ["tks-compact", label]]);
  });

  it("count what each box holds, of the most it takes", async () => {
    const { root, box } = await setup();
    const text = make.chipText();
    type(box("ai", "chipCompact"), text);
    const count = root.querySelector(`#${box("ai", "chipCompact").id}-count`);
    expect(count?.textContent).toBe(
      i18n.t("options_chip_count", {
        count: String(text.length),
        max: String(CHIP_TEXT_LIMITS.chipCompact),
      }),
    );
    expect(box("ai", "chipCompact").getAttribute("aria-describedby")).toContain(count?.id);
  });

  it("offer Reset only for stored text, which clears it and returns focus", async () => {
    const { box, reset, stored } = await setup(
      make.settings.chipText({ ai: { chipCompact: make.chipText() } }),
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
    const text = make.chipText();
    type(box("ai", "chip"), text);
    await writeSettings(source, make.settings.kind("drm", { filter: "dim" }));
    expect(box("ai", "chip").value).toBe(text);
  });

  it("show text another tab stored", async () => {
    const { box, source } = await setup();
    const text = make.chipText();
    await writeSettings(source, make.settings.chipText({ drm: { chip: text } }));
    expect(box("drm", "chip").value).toBe(text);
  });

  it("keep the person's text out of every catalog", async () => {
    const catalogs = () => JSON.stringify([SHIPPED_CATALOGS, CONTENT, OPTIONS, USERSCRIPT]);
    const before = catalogs();
    const { box, stored } = await setup();
    const text = make.chipText();
    type(box("ai", "chip"), text, true);
    await vi.waitFor(async () => {
      expect((await stored("ai")).chip).toBe(text);
    });
    expect(catalogs()).toBe(before);
    expect(before).not.toContain(text);
  });
});
