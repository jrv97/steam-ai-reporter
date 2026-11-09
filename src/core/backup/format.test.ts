import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupReading,
  countEntries,
  encodeBackup,
  MAX_BACKUP_SIZE,
  readBackup,
} from "./format";

const VALID_ID = String(make.appId());
const VALID_GAME = { name: make.text.name(), added: make.backup.time };
const JUNK = Array.from({ length: 10_000 }, () => 0);

/** The reading of a backup file; throws when the file is not read as a backup. */
function backupOf(reading: BackupReading) {
  if (reading.kind !== "backup") {
    throw new TypeError(reading.kind);
  }
  return reading;
}

/** The reading of a file whose ignored games are `games`, with one valid entry beside them. */
function readGames(games: Readonly<Record<string, unknown>>) {
  return backupOf(
    readBackup(
      make.backup.text({ ignored: { games: { all: { [VALID_ID]: VALID_GAME }, ...games } } }),
    ),
  );
}

describe("readBackup", () => {
  it("reads back what encodeBackup wrote", () => {
    const settings = make.settings.kind(
      "family",
      {
        enabled: true,
        banner: true,
        tagged: make.settings.tagged.many("supported", "unsupported"),
      },
      make.settings.kind(
        "deck",
        { enabled: true, tagged: make.settings.tagged.one("playable") },
        make.settings.kind(
          "iap",
          { enabled: true, filter: "dim" },
          make.settings.kind(
            "drm",
            { filter: "hide", color: make.color() },
            make.settings({
              locale: "es",
            }),
          ),
        ),
      ),
    );
    const contents = make.backup.contents({
      settings,
      games: make.allow.games({ all: [make.allow.gameRow()], ai: [make.allow.gameRow()] }),
      creators: {
        developer: make.allow.creators({
          drm: [make.allow.clanRow()],
        }),
        publisher: make.allow.creators({ all: [make.allow.nameRow()] }),
      },
    });
    expect(readBackup(encodeBackup(contents))).toStrictEqual({
      kind: "backup",
      contents,
      skipped: 0,
    });
  });

  it.each([
    ["text that is not JSON", "{"],
    ["an empty file", ""],
    ["a JSON array", "[]"],
    ["JSON null", "null"],
    ["deeply nested arrays", `${"[".repeat(100_000)}${"]".repeat(100_000)}`],
    ["another format", make.backup.text({ format: "other" })],
    ["no format", make.backup.text({ format: undefined })],
    ["version 0", make.backup.text({ version: 0 })],
    ["a version that is text", make.backup.text({ version: "1" })],
    ["a fractional version", make.backup.text({ version: 1.5 })],
    ["no date", make.backup.text({ created: undefined })],
    ["a negative date", make.backup.text({ created: -1 })],
    ["no settings", make.backup.text({ settings: undefined })],
    ["settings that are text", make.backup.text({ settings: "on" })],
    ["settings that are an array", make.backup.text({ settings: [] })],
    ["a file over the size cap", make.backup.text().padEnd(MAX_BACKUP_SIZE + 1, " ")],
  ])("calls %s invalid", (_case, text) => {
    expect(readBackup(text)).toStrictEqual({ kind: "invalid" });
  });

  it("calls a later format version newer", () => {
    expect(readBackup(make.backup.text({ version: BACKUP_VERSION + 1 }))).toStrictEqual({
      kind: "newer",
    });
  });

  it.each<readonly [string, Readonly<Record<string, unknown>>, number]>([
    [
      "a key that is no app ID",
      { all: { [VALID_ID]: VALID_GAME, abc: VALID_GAME, 0: VALID_GAME } },
      2,
    ],
    ["a __proto__ key", { all: { [VALID_ID]: VALID_GAME, ["__proto__"]: VALID_GAME } }, 1],
    ["an unknown scope", { nope: { [String(make.appId())]: VALID_GAME } }, 1],
    ["a name that is a number", { drm: { [String(make.appId())]: { name: 1, added: 1 } } }, 1],
    ["a missing date", { drm: { [String(make.appId())]: { name: make.text.name() } } }, 1],
    [
      "a date that is text",
      { drm: { [String(make.appId())]: { name: make.text.name(), added: "now" } } },
      1,
    ],
    ["a huge array of junk", { drm: JUNK }, JUNK.length],
  ])("skips and counts %s, and keeps the valid entry", (_case, games, skipped) => {
    const reading = readGames(games);
    expect([reading.skipped, reading.contents.games.all.size]).toStrictEqual([skipped, 1]);
  });

  it("skips a date too large for JSON numbers, which parses as Infinity", () => {
    const text = make.backup.text({ ignored: { games: { all: { [VALID_ID]: VALID_GAME } } } })
      .replace(`"added":${String(make.backup.time)}`, '"added":1e999');
    expect(backupOf(readBackup(text)).skipped).toBe(1);
  });

  it("skips a creator key without its prefix", () => {
    const name = make.text.creator();
    const developer = { all: { [name]: VALID_GAME, [`n:${name}`]: VALID_GAME } };
    expect(backupOf(readBackup(make.backup.text({ ignored: { developer } }))).skipped).toBe(1);
  });

  it("keeps the last of a game listed twice in one scope, as JSON does", () => {
    const [first, second] = [make.raw.allowEntry(), make.raw.allowEntry()];
    const text = `{"format":"${BACKUP_FORMAT}","version":${String(BACKUP_VERSION)},`
      + `"created":${String(make.backup.time)},`
      + `"settings":{},"ignored":{"games":{"all":{"${VALID_ID}":${JSON.stringify(first)},`
      + `"${VALID_ID}":${JSON.stringify(second)}}}}}`;
    expect([...backupOf(readBackup(text)).contents.games.all.values()]).toStrictEqual([second]);
  });

  it("never touches Object.prototype through __proto__ keys", () => {
    const text = `{"__proto__":{"polluted":1},"format":"${BACKUP_FORMAT}","version":1,`
      + `"created":${String(make.backup.time)},`
      + `"settings":{"__proto__":{"polluted":1},"kinds":{"__proto__":{"polluted":1}}},`
      + `"ignored":{"__proto__":{"polluted":1},`
      + `"games":{"__proto__":{"${VALID_ID}":${JSON.stringify(VALID_GAME)}}}}}`;
    expect(readBackup(text).kind).toBe("backup");
    expect(Object.prototype).not.toHaveProperty("polluted");
  });

  it("reads each bad settings field as its default, as stored settings do", () => {
    const reading = readBackup(
      make.backup.text({
        settings: { locale: 5, kinds: { drm: { filter: "explode", badge: false } } },
      }),
    );
    expect(backupOf(reading).contents.settings).toStrictEqual(
      make.settings.kind("drm", { badge: false }),
    );
  });

  it.each(
    [
      [["unsupported", "playable"], "playable"],
      [[], "unsupported"],
    ] as const,
  )(
    "reads a device's list of values %j, the shape before one rating, as %s",
    (facets, facet) => {
      const reading = readBackup(
        make.backup.text({ settings: { kinds: { machine: { facets } } } }),
      );
      expect(backupOf(reading).contents.settings).toStrictEqual(
        make.settings.kind("machine", { tagged: make.settings.tagged.one(facet) }),
      );
    },
  );
});

describe("countEntries", () => {
  it("counts one entry per key and scope, over every list", () => {
    const shared = make.allow.gameRow();
    const all = [shared];
    const ai = [shared, make.allow.gameRow()];
    const drm = [make.allow.clanRow()];
    const lists = [make.allow.games({ all, ai }), make.allow.creators({ drm })];
    expect(countEntries(lists)).toBe(all.length + ai.length + drm.length);
  });
});
