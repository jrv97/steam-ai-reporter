import { afterEach, describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { englishI18n } from "../../../tests/helpers/i18n";
import { mountForm } from "../../../tests/helpers/settings-form";
import { encodeVerdicts } from "../cache/stored";
import type { BareMessageKey } from "../i18n/t";
import type { JsonValue } from "../json";
import { META_KEY, SETTINGS_KEY, verdictKey } from "../storage-keys";

const i18n = englishI18n();

/** A stored entry of a fresh app whose kinds all hold this state. */
function entry(state: Parameters<typeof make.verdicts.uniform>[0]): readonly [string, JsonValue] {
  return [
    verdictKey(make.appId()),
    encodeVerdicts(make.verdicts.uniform(state), make.time()) ?? null,
  ];
}

/** Lets every promise the last action started settle. */
function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Two answered games, one Steam never asked about a section for and two with no answer. */
const ENTRIES = [
  entry("disclosed"),
  entry("not-disclosed"),
  entry("unrequested"),
  entry("gated"),
  entry("missing"),
];
/** Keys that are no lookup results and stay. */
const OTHERS: readonly (readonly [string, JsonValue])[] = [
  [SETTINGS_KEY, make.raw.noGames()],
  [META_KEY, make.raw.noGames()],
];

/** The full page over a store holding `entries`, with the card's parts by role. */
async function setup(entries: readonly (readonly [string, JsonValue])[] = ENTRIES) {
  const store = fake.countingStore(fake.store(new Map([...entries, ...OTHERS])));
  const { root } = await mountForm({ store });
  await settle();
  const card = root.querySelector('[aria-labelledby$="-lookups"]');
  const text = (selector: string): string | undefined => {
    const node = card?.querySelector(selector);
    return node?.closest("[hidden]") === null ? node.textContent : undefined;
  };
  const click = async (key: BareMessageKey): Promise<void> => {
    const button = [...(card?.querySelectorAll("button") ?? [])].find((each) =>
      each.textContent === i18n.t(key)
    );
    button?.click();
    await settle();
  };
  return { store, card, text, click };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the stored lookups card", () => {
  it("counts the games kept and those Steam gave no answer for", async () => {
    const { text } = await setup();
    expect(text(".tks-card-help + .tks-card-help")).toBe(
      i18n.plural("options_lookups_count", 5, { unanswered: "2" }),
    );
  });

  it("says when nothing is kept", async () => {
    const { text } = await setup([]);
    expect(text(".tks-card-help + .tks-card-help")).toBe(i18n.t("options_lookups_empty"));
  });

  it.each<readonly [BareMessageKey, "notice_lookups_cleared" | "notice_lookups_rechecked", number]>(
    [
      ["options_lookups_clear", "notice_lookups_cleared", 5],
      ["options_lookups_recheck", "notice_lookups_rechecked", 2],
    ],
  )(
    "%s removes its entries at once, keeps other keys and says so",
    async (button, notice, gone) => {
      const { store, text, click } = await setup();
      await click(button);
      const left = await store.keys();
      expect(left.length).toBe(ENTRIES.length - gone + OTHERS.length);
      expect(left).toEqual(expect.arrayContaining(OTHERS.map(([key]) => key)));
      expect(text(".tks-card-status")).toBe(i18n.plural(notice, gone));
    },
  );

  it("refreshes the count after a clear", async () => {
    const { text, click } = await setup();
    await click("options_lookups_recheck");
    expect(text(".tks-card-help + .tks-card-help")).toBe(
      i18n.plural("options_lookups_count", 3, { unanswered: "0" }),
    );
  });

  it("shows the clear error when the store refuses", async () => {
    const { store, text, click } = await setup();
    store.break();
    await click("options_lookups_clear");
    expect(text(".tks-field-error")).toBe(i18n.t("error_lookups_clear"));
    expect(text(".tks-card-status")).toBeUndefined();
  });

  it("is not in a form without a store, as in the toolbar popup", async () => {
    const { root } = await mountForm();
    expect(root.textContent).not.toContain(i18n.t("options_section_lookups"));
  });
});
