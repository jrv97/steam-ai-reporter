import { afterEach, describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { englishI18n } from "../../../tests/helpers/i18n";
import { BACKUP_VERSION, encodeBackup, MAX_BACKUP_SIZE, readBackup } from "../backup/format";
import type { BareMessageKey } from "../i18n/t";
import { createIgnoreLists } from "../ignored";
import type { PickedFile } from "../ports";
import { DEFAULT_SETTINGS, parseSettings } from "../settings/settings";
import { createSettingsSource } from "../settings/settings-source";
import { mountSettingsForm } from "./settings-form";
import { createUiState } from "./ui-state";

const i18n = englishI18n();
const HIDE_AI = make.settings.kind("ai", { filter: "hide" });

/** Ignored games by scope: rows of app ID, name and the time each was ignored. */
type Games = NonNullable<Parameters<typeof make.allow.games>[0]>;

/** One fresh row of an ignored games list. */
const game = () => [make.appId(), make.text.name(), make.time()] as const;

/** Lets every promise the last action started settle. */
function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** The full page form over one store, with a fake file transfer and these games ignored. */
async function setup(games: Games = {}) {
  const store = fake.countingStore(fake.store());
  const clock = fake.clock(make.backup.time);
  const settings = createSettingsSource(store);
  const lists = createIgnoreLists(store, clock);
  await lists.games.merge(make.allow.games(games));
  const files = fake.fileTransfer();
  const root = document.createElement("main");
  document.body.append(root);
  await mountSettingsForm(root, {
    i18n,
    settings,
    lists,
    uiState: createUiState(store),
    context: "page",
    layout: "tabs",
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
    const card = root.querySelector(".tks-backup-help")?.parentElement;
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

type Card = Awaited<ReturnType<typeof setup>>;

/** A backup file that hides AI results and ignores these games. */
function backupFile(games: Games = {}): PickedFile {
  return make.backup.file(
    encodeBackup(make.backup.contents({ settings: HIDE_AI, games: make.allow.games(games) })),
  );
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the Backup card", () => {
  it("is not in the form without a file transfer, as in the toolbar popup", async () => {
    const root = document.createElement("main");
    const store = fake.store();
    await mountSettingsForm(root, {
      i18n,
      settings: createSettingsSource(store),
      lists: createIgnoreLists(store, fake.clock(make.time())),
      uiState: createUiState(store),
      context: "popup",
      layout: "list",
      colors: false,
      locales: ["en"],
    });
    expect(root.textContent).not.toContain(i18n.t("options_section_backup"));
  });

  it("downloads a backup of what is stored and says so", async () => {
    const games = { all: [game()] };
    const { files, click, shown } = await setup(games);
    await click("options_backup_download");
    expect(files.files.map((file) => readBackup(file.text))).toMatchObject([
      { kind: "backup", contents: { games: make.allow.games(games) } },
    ]);
    expect(shown(".tks-backup-status")).toBe(i18n.t("notice_backup_downloaded"));
  });

  it.each<readonly [string, (card: Card) => void]>([
    ["the store cannot be read", ({ store }) => {
      store.break();
    }],
    ["the browser refuses the download", ({ files }) => {
      files.refuse();
    }],
  ])("shows the create error when %s", async (_case, fail) => {
    const card = await setup();
    fail(card);
    await card.click("options_backup_download");
    expect(card.shown(".tks-field-error")).toBe(i18n.t("error_backup_create"));
  });
});

describe("picking a backup file", () => {
  it("shows the check with the date and counts, focused, and changes nothing yet", async () => {
    const { root, pick, shown, stored } = await setup();
    const games = { all: [game()], drm: [game()] };
    await pick(backupFile(games));
    const number = String(Object.values(games).flat().length);
    const date = new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(make.backup.time);
    expect(shown(".tks-backup-summary-title")).toBe(
      i18n.t("options_backup_summary_title", { date }),
    );
    expect(root.querySelector(".tks-backup-contents li")?.textContent).toBe(
      i18n.t("options_backup_summary_list", { list: i18n.t("options_section_allow"), number }),
    );
    expect(document.activeElement?.className).toBe("tks-backup-summary-title");
    expect(await stored()).toStrictEqual(DEFAULT_SETTINGS);
  });

  const name = make.text.fileName();

  it.each(
    [
      ["not JSON", make.backup.file(make.http.body(), name), "error_backup_invalid"],
      [
        "not a backup",
        make.backup.file(JSON.stringify(make.text.note()), name),
        "error_backup_invalid",
      ],
      [
        "too large",
        make.backup.file(make.backup.text(), name, MAX_BACKUP_SIZE + 1),
        "error_backup_invalid",
      ],
      [
        "newer",
        make.backup.file(make.backup.text({ version: BACKUP_VERSION + 1 }), name),
        "error_backup_newer",
      ],
      ["unreadable", make.backup.unreadableFile(name), "error_backup_read"],
    ] as const,
  )("names a file that is %s, and opens no check", async (_case, file, key) => {
    const { pick, shown } = await setup();
    await pick(file);
    expect(shown(".tks-field-error")).toBe(i18n.t(key, { name }));
    expect(shown(".tks-backup-summary-title")).toBeUndefined();
  });

  it("shows file text as text, never as markup", async () => {
    const [fileName, gameName] = [make.text.markup(), make.text.markup()];
    const { root, pick, click } = await setup();
    await pick(make.backup.file(make.http.body(), fileName));
    expect(root.textContent).toContain(fileName);
    await pick(backupFile({ all: [[make.appId(), gameName, make.time()]] }));
    await click("options_backup_confirm");
    expect(root.textContent).toContain(gameName);
    expect(root.querySelector("b")).toBeNull();
  });

  it("closes the check on Cancel, changes nothing and returns focus", async () => {
    const { button, pick, click, shown, stored } = await setup();
    await pick(backupFile());
    await click("options_backup_cancel");
    expect(shown(".tks-backup-summary-title")).toBeUndefined();
    expect(await stored()).toStrictEqual(DEFAULT_SETTINGS);
    expect(document.activeElement).toBe(button("options_backup_restore"));
  });
});

describe("confirming a restore", () => {
  it("applies the file, redraws the lists, says what it added and returns focus", async () => {
    const [kept, added] = [game(), game()];
    const { root, button, pick, click, shown, stored } = await setup({ all: [kept] });
    await pick(backupFile({ all: [kept, added] }));
    await click("options_backup_confirm");
    expect(await stored()).toStrictEqual(HIDE_AI);
    expect(root.textContent).toContain(added[1]);
    expect(shown(".tks-backup-status")).toBe(i18n.plural("notice_backup_restored", 1));
    expect(document.activeElement).toBe(button("options_backup_restore"));
  });

  it("counts the entries it left out, in the check and after", async () => {
    const { root, pick, click, shown } = await setup();
    const broken = make.appIds(2).map((id) => [String(id), {}] as const);
    const all = Object.fromEntries(broken);
    await pick(make.backup.file(make.backup.text({ ignored: { games: { all } } })));
    const skipped = i18n.plural("options_backup_summary_skipped", broken.length);
    expect(root.querySelector(".tks-backup-contents")?.textContent).toContain(skipped);
    await click("options_backup_confirm");
    expect(shown(".tks-backup-status")).toBe(
      [
        i18n.plural("notice_backup_restored", 0),
        i18n.plural("notice_backup_skipped", broken.length),
      ].join(" "),
    );
  });

  it("keeps the check open with the restore error when the write fails", async () => {
    const { store, pick, click, shown } = await setup();
    await pick(backupFile());
    store.break();
    await click("options_backup_confirm");
    expect(shown(".tks-field-error")).toBe(i18n.t("error_backup_restore"));
    expect(shown(".tks-backup-summary-title")).toBeDefined();
  });
});
