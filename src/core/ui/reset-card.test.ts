import { afterEach, describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { englishI18n } from "../../../tests/helpers/i18n";
import { mountForm } from "../../../tests/helpers/settings-form";
import { CREATOR_ROLES } from "../creator";
import type { BareMessageKey } from "../i18n/t";
import { createIgnoreLists } from "../ignored";
import { KIND_IDS } from "../kinds/id";
import { perScope } from "../settings/allow-data";
import { DEFAULT_SETTINGS, parseSettings, wholePatch } from "../settings/settings";
import { createSettingsSource } from "../settings/settings-source";

const i18n = englishI18n();

/** Lets every promise the last action started settle. */
function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Every scope empty, as a list reads after Stop ignoring everything. */
const NOTHING = perScope(() => new Map());

/** Settings of the person's own: Spanish, debug on, a tag moved, colored and hidden. */
const OWN = make.settings.kind("drm", { filter: "hide", color: make.color() }, {
  ...DEFAULT_SETTINGS,
  locale: "es",
  debug: true,
  order: [...KIND_IDS].reverse(),
});

/** The full page over one store with those settings, two games and a developer ignored. */
async function setup() {
  const store = fake.countingStore(fake.store());
  const settings = createSettingsSource(store);
  await settings.patch(wholePatch(OWN));
  const lists = createIgnoreLists(store, fake.clock(make.time()));
  await lists.games.merge(
    make.allow.games({ all: [make.allow.gameRow()], drm: [make.allow.gameRow()] }),
  );
  await lists.creators.developer.merge(make.allow.creators({ all: [make.allow.clanRow()] }));
  const { root } = await mountForm({ settings, lists, store });
  const card = root.querySelector('[aria-labelledby$="-reset"]');
  const button = (key: BareMessageKey): HTMLButtonElement => {
    const found = [...(card?.querySelectorAll("button") ?? [])].find((each) =>
      each.textContent === i18n.t(key)
    );
    if (found === undefined) {
      throw new TypeError(key);
    }
    return found;
  };
  const click = async (key: BareMessageKey): Promise<void> => {
    button(key).click();
    await settle();
  };
  /** The texts of the card's nodes that `selector` matches and no hidden parent holds. */
  const shown = (selector: string): readonly string[] =>
    [...(card?.querySelectorAll(selector) ?? [])]
      .filter((node) => node.closest("[hidden]") === null)
      .map((node) => node.textContent);
  const stored = async () => parseSettings(await settings.read());
  return { root, store, lists, button, click, shown, stored };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the settings reset", () => {
  it("opens a check that lists what changes, focused, and changes nothing yet", async () => {
    const { click, shown, stored } = await setup();
    await click("options_reset_settings");
    expect(shown(".tks-confirm-title")).toStrictEqual([i18n.t("options_reset_settings_title")]);
    const lines = [
      "options_reset_settings_tags",
      "options_reset_settings_words",
      "options_reset_settings_order",
      "options_reset_settings_keep",
    ] as const;
    expect(shown(".tks-confirm-list li")).toStrictEqual(lines.map((key) => i18n.t(key)));
    expect(document.activeElement?.textContent).toBe(i18n.t("options_reset_settings_title"));
    expect(await stored()).toStrictEqual(OWN);
  });

  it("puts the defaults back, keeps language, debug and lists, and returns focus", async () => {
    const { lists, button, click, shown, stored } = await setup();
    const before = await lists.games.list();
    await click("options_reset_settings");
    await click("options_reset_settings_confirm");
    expect(await stored()).toStrictEqual({ ...DEFAULT_SETTINGS, locale: "es", debug: true });
    expect(await lists.games.list()).toStrictEqual(before);
    expect(shown(".tks-card-status")).toStrictEqual([i18n.t("notice_reset_settings_done")]);
    expect(document.activeElement).toBe(button("options_reset_settings"));
  });

  it("keeps the check open with the error when the write fails", async () => {
    const { store, click, shown } = await setup();
    await click("options_reset_settings");
    store.breakWrites();
    await click("options_reset_settings_confirm");
    expect(shown(".tks-field-error")).toStrictEqual([i18n.t("error_reset_settings")]);
    expect(shown(".tks-confirm-title")).toHaveLength(1);
  });
});

describe("the ignore lists reset", () => {
  it("counts each list from the form's read, then keeps the settings", async () => {
    const { click, shown } = await setup();
    await click("options_reset_lists");
    expect(shown(".tks-confirm-list li")).toStrictEqual([
      i18n.t("options_reset_lists_games", {
        list: i18n.t("options_section_allow"),
        all: "1",
        tags: "1",
      }),
      i18n.t("options_backup_summary_list", {
        list: i18n.t("options_section_allow_developers"),
        number: "1",
      }),
      i18n.t("options_backup_summary_list", {
        list: i18n.t("options_section_allow_publishers"),
        number: "0",
      }),
      i18n.t("options_reset_lists_keep"),
    ]);
  });

  it("empties every list, redraws them and keeps the settings", async () => {
    const { root, lists, click, shown, stored } = await setup();
    await click("options_reset_lists");
    await click("options_reset_lists_confirm");
    const emptied = await Promise.all([
      lists.games.list(),
      ...CREATOR_ROLES.map((role) => lists.creators[role].list()),
    ]);
    expect(emptied).toStrictEqual([NOTHING, NOTHING, NOTHING]);
    expect(root.querySelector(".tks-allow-name")).toBeNull();
    expect(await stored()).toStrictEqual(OWN);
    expect(shown(".tks-card-status")).toStrictEqual([i18n.t("notice_reset_lists_done")]);
  });

  it("keeps the check open with the error, and redraws the lists a failed write left", async () => {
    const { root, store, lists, click, shown } = await setup();
    await click("options_reset_lists");
    await Promise.all([lists.games.clear(), lists.creators.developer.clear()]);
    store.breakWrites();
    await click("options_reset_lists_confirm");
    expect(shown(".tks-field-error")).toStrictEqual([i18n.t("error_reset_lists")]);
    expect(shown(".tks-confirm-title")).toHaveLength(1);
    expect(root.querySelector(".tks-allow-name")).toBeNull();
  });

  it("closes on Cancel, empties nothing and returns focus", async () => {
    const { lists, button, click, shown } = await setup();
    const before = await lists.games.list();
    await click("options_reset_lists");
    await click("options_backup_cancel");
    expect(shown(".tks-confirm-title")).toStrictEqual([]);
    expect(await lists.games.list()).toStrictEqual(before);
    expect(document.activeElement).toBe(button("options_reset_lists"));
  });
});

describe("the Reset card", () => {
  it("is not in the toolbar popup", async () => {
    const { root } = await mountForm({ context: "popup", layout: "list", colors: false });
    expect(root.textContent).not.toContain(i18n.t("options_section_reset"));
  });
});
