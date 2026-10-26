import { afterEach, describe, expect, it } from "vitest";
import {
  BACKUP_TIME,
  backupContents,
  backupText,
  type EntriesSpec,
  gameEntries,
  pickedFile,
} from "../../../tests/helpers/backup";
import { countingStore } from "../../../tests/helpers/counting-store";
import { fakeFileTransfer } from "../../../tests/helpers/fake-file-transfer";
import { fixedClock } from "../../../tests/helpers/fixed-clock";
import { englishI18n } from "../../../tests/helpers/i18n";
import { memoryStore } from "../../../tests/helpers/memory-store";
import { withKind } from "../../../tests/helpers/settings";
import { BACKUP_VERSION, encodeBackup, MAX_BACKUP_SIZE, readBackup } from "../backup/format";
import type { BareMessageKey } from "../i18n/t";
import { createIgnoreLists } from "../ignored";
import type { PickedFile } from "../ports";
import { DEFAULT_SETTINGS, parseSettings } from "../settings/settings";
import { createSettingsSource } from "../settings/settings-source";
import { createSectionState } from "./section-state";
import { mountSettingsForm } from "./settings-form";

const i18n = englishI18n();
const HIDE_AI = withKind(DEFAULT_SETTINGS, "ai", { filter: "hide" });

/** Lets every promise the last action started settle. */
function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** The full page form over one store, with a fake file transfer and these games ignored. */
async function setup(games: EntriesSpec<number> = {}) {
  const store = countingStore(memoryStore());
  const clock = fixedClock(BACKUP_TIME);
  const settings = createSettingsSource(store);
  const lists = createIgnoreLists(store, clock);
  await lists.games.merge(gameEntries(games));
  const files = fakeFileTransfer();
  const root = document.createElement("main");
  document.body.append(root);
  await mountSettingsForm(root, {
    i18n,
    settings,
    lists,
    sectionState: createSectionState(store),
    context: "page",
    colors: true,
    locales: ["en"],
    backup: { files, clock },
  });
  const button = (key: BareMessageKey): HTMLButtonElement => {
    const found = [...root.querySelectorAll("button")].find((each) =>
      each.textContent === i18n.t(key)
    );
    if (found === undefined) {
      throw new TypeError(key);
    }
    return found;
  };
  /** The text of a node of the Backup card, or undefined while it or a parent is hidden. */
  const shown = (selector: string): string | undefined => {
    const card = root.querySelector(".sar-backup-help")?.parentElement;
    const node = card?.querySelector(selector);
    return node?.closest("[hidden]") === null ? node.textContent : undefined;
  };
  const pick = async (file: PickedFile): Promise<void> => {
    button("options_backup_restore").click();
    files.choose(file);
    await settle();
  };
  const click = async (key: BareMessageKey): Promise<void> => {
    button(key).click();
    await settle();
  };
  const stored = async () => parseSettings(await settings.read());
  return { root, store, files, lists, button, shown, pick, click, stored };
}

/** A backup file that hides AI results and ignores these games. */
function backupFile(games: EntriesSpec<number> = {}, name?: string): PickedFile {
  return pickedFile(
    encodeBackup(backupContents({ settings: HIDE_AI, games: gameEntries(games) })),
    name,
  );
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the Backup card", () => {
  it("is not in the form without a file transfer, as in the toolbar popup", async () => {
    const root = document.createElement("main");
    const store = memoryStore();
    await mountSettingsForm(root, {
      i18n,
      settings: createSettingsSource(store),
      lists: createIgnoreLists(store, fixedClock(0)),
      sectionState: createSectionState(store),
      context: "popup",
      colors: false,
      locales: ["en"],
    });
    expect(root.textContent).not.toContain(i18n.t("options_section_backup"));
  });

  it("downloads a backup of what is stored and says so", async () => {
    const { files, click, shown } = await setup({ all: [[10, "Ten", 1]] });
    await click("options_backup_download");
    const reading = readBackup(files.files[0]?.text ?? "");
    expect(reading.kind === "backup" ? reading.contents.games.all.size : 0).toBe(1);
    expect(shown(".sar-backup-status")).toBe(i18n.t("notice_backup_downloaded"));
  });

  it.each([
    ["the store cannot be read", "store"],
    ["the browser refuses the download", "browser"],
  ])("shows the create error when %s", async (_case, cause) => {
    const { store, files, click, shown } = await setup();
    if (cause === "store") {
      store.break();
    } else {
      files.refuse();
    }
    await click("options_backup_download");
    expect(shown(".sar-field-error")).toBe(i18n.t("error_backup_create"));
  });
});

describe("picking a backup file", () => {
  it("shows the check with the date and counts, focused, and changes nothing yet", async () => {
    const { root, pick, shown, stored } = await setup();
    await pick(backupFile({ all: [[10, "Ten", 1]], drm: [[20, "Twenty", 1]] }));
    const date = new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(BACKUP_TIME);
    expect(shown(".sar-backup-summary-title")).toBe(
      i18n.t("options_backup_summary_title", { date }),
    );
    expect(root.querySelector(".sar-backup-contents li")?.textContent).toBe(
      i18n.t("options_backup_summary_list", { list: i18n.t("options_section_allow"), number: "2" }),
    );
    expect(document.activeElement?.className).toBe("sar-backup-summary-title");
    expect(await stored()).toStrictEqual(DEFAULT_SETTINGS);
  });

  it.each(
    [
      ["not JSON", pickedFile("{", "a.json"), "error_backup_invalid"],
      ["not a backup", pickedFile('{"games":[]}', "a.json"), "error_backup_invalid"],
      [
        "too large",
        pickedFile(backupText(), "a.json", MAX_BACKUP_SIZE + 1),
        "error_backup_invalid",
      ],
      [
        "newer",
        pickedFile(backupText({ version: BACKUP_VERSION + 1 }), "a.json"),
        "error_backup_newer",
      ],
      [
        "unreadable",
        { name: "a.json", size: 1, text: () => Promise.reject(new Error()) },
        "error_backup_read",
      ],
    ] as const,
  )("names a file that is %s, and opens no check", async (_case, file, key) => {
    const { pick, shown } = await setup();
    await pick(file);
    expect(shown(".sar-field-error")).toBe(i18n.t(key, { name: "a.json" }));
    expect(shown(".sar-backup-summary-title")).toBeUndefined();
  });

  it("shows file text as text, never as markup", async () => {
    const markup = "<img src=x>";
    const { root, pick, click } = await setup();
    await pick(pickedFile("{", markup));
    await pick(backupFile({ all: [[10, markup, 1]] }));
    await click("options_backup_confirm");
    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toContain(markup);
  });

  it("closes the check on Cancel, changes nothing and returns focus", async () => {
    const { button, pick, click, shown, stored } = await setup();
    await pick(backupFile());
    await click("options_backup_cancel");
    expect(shown(".sar-backup-summary-title")).toBeUndefined();
    expect(await stored()).toStrictEqual(DEFAULT_SETTINGS);
    expect(document.activeElement).toBe(button("options_backup_restore"));
  });
});

describe("confirming a restore", () => {
  it("applies the file, redraws the lists, says what it added and returns focus", async () => {
    const { root, button, pick, click, shown, stored } = await setup({ all: [[10, "Ten", 1]] });
    await pick(backupFile({ all: [[10, "Ten", 1], [20, "Twenty", 1]] }));
    await click("options_backup_confirm");
    expect(await stored()).toStrictEqual(HIDE_AI);
    expect(root.textContent).toContain("Twenty");
    expect(shown(".sar-backup-status")).toBe(i18n.plural("notice_backup_restored", 1));
    expect(document.activeElement).toBe(button("options_backup_restore"));
  });

  it("counts the entries it left out, in the check and after", async () => {
    const { root, pick, click, shown } = await setup();
    await pick(pickedFile(backupText({ ignored: { games: { all: { 10: {}, 20: {} } } } })));
    const skipped = i18n.plural("options_backup_summary_skipped", 2);
    expect(root.querySelector(".sar-backup-contents")?.textContent).toContain(skipped);
    await click("options_backup_confirm");
    expect(shown(".sar-backup-status")).toBe(
      [i18n.plural("notice_backup_restored", 0), i18n.plural("notice_backup_skipped", 2)].join(" "),
    );
  });

  it("keeps the check open with the restore error when the write fails", async () => {
    const { store, pick, click, shown } = await setup();
    await pick(backupFile());
    store.break();
    await click("options_backup_confirm");
    expect(shown(".sar-field-error")).toBe(i18n.t("error_backup_restore"));
    expect(shown(".sar-backup-summary-title")).toBeDefined();
  });
});
