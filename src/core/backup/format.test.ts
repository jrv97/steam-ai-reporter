import { describe, expect, it } from "vitest";
import {
  BACKUP_TIME,
  backupContents,
  backupText,
  creatorEntries,
  gameEntries,
} from "../../../tests/helpers/backup";
import { hexColor, withKind } from "../../../tests/helpers/settings";
import { DEFAULT_SETTINGS } from "../settings/settings";
import { BACKUP_VERSION, countEntries, encodeBackup, MAX_BACKUP_SIZE, readBackup } from "./format";

const VALID_GAME = { name: "Kept", added: BACKUP_TIME };

/** The reading of a file whose ignored games are `games`, with one valid entry beside them. */
function readGames(games: Readonly<Record<string, unknown>>) {
  return readBackup(backupText({ ignored: { games: { all: { 10: VALID_GAME }, ...games } } }));
}

describe("readBackup", () => {
  it("reads back what encodeBackup wrote", () => {
    const drm = withKind({ ...DEFAULT_SETTINGS, locale: "es" }, "drm", {
      filter: "hide",
      color: hexColor("#ff8800"),
    });
    const contents = backupContents({
      settings: withKind(withKind(drm, "iap", { enabled: true, filter: "dim" }), "deck", {
        enabled: true,
        facets: ["verified", "playable"],
      }),
      games: gameEntries({ all: [[10, "Ten", 1]], ai: [[20, "Twenty", 2]] }),
      creators: {
        developer: creatorEntries({ drm: [["c:4", "Studio", 3]] }),
        publisher: creatorEntries({ all: [["n:Label", "Label", 4]] }),
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
    ["another format", backupText({ format: "other" })],
    ["no format", backupText({ format: undefined })],
    ["version 0", backupText({ version: 0 })],
    ["a version that is text", backupText({ version: "1" })],
    ["a fractional version", backupText({ version: 1.5 })],
    ["no date", backupText({ created: undefined })],
    ["a negative date", backupText({ created: -1 })],
    ["no settings", backupText({ settings: undefined })],
    ["settings that are text", backupText({ settings: "on" })],
    ["settings that are an array", backupText({ settings: [] })],
    ["a file over the size cap", backupText().padEnd(MAX_BACKUP_SIZE + 1, " ")],
  ])("calls %s invalid", (_case, text) => {
    expect(readBackup(text)).toStrictEqual({ kind: "invalid" });
  });

  it("calls a later format version newer", () => {
    expect(readBackup(backupText({ version: BACKUP_VERSION + 1 }))).toStrictEqual({
      kind: "newer",
    });
  });

  it.each([
    ["a key that is no app ID", { all: { 10: VALID_GAME, abc: VALID_GAME, 0: VALID_GAME } }, 2],
    ["a __proto__ key", { all: { 10: VALID_GAME, ["__proto__"]: VALID_GAME } }, 1],
    ["an unknown scope", { nope: { 30: VALID_GAME } }, 1],
    ["a name that is a number", { drm: { 30: { name: 1, added: 1 } } }, 1],
    ["a missing date", { drm: { 30: { name: "x" } } }, 1],
    ["a date that is text", { drm: { 30: { name: "x", added: "now" } } }, 1],
    ["a huge array of junk", { drm: Array.from({ length: 10_000 }, () => 0) }, 10_000],
  ])("skips and counts %s, and keeps the valid entry", (_case, games, skipped) => {
    const reading = readGames(games);
    expect(reading.kind === "backup" ? [reading.skipped, reading.contents.games.all.size] : [])
      .toStrictEqual([skipped, 1]);
  });

  it("skips a date too large for JSON numbers, which parses as Infinity", () => {
    const text = backupText({ ignored: { games: { all: { 10: VALID_GAME } } } })
      .replace(`"added":${String(BACKUP_TIME)}`, '"added":1e999');
    const reading = readBackup(text);
    expect(reading.kind === "backup" ? reading.skipped : undefined).toBe(1);
  });

  it("skips a creator key without its prefix", () => {
    const reading = readBackup(
      backupText({ ignored: { developer: { all: { Valve: VALID_GAME, "n:Valve": VALID_GAME } } } }),
    );
    expect(reading.kind === "backup" ? reading.skipped : undefined).toBe(1);
  });

  it("keeps the last of a game listed twice in one scope, as JSON does", () => {
    const text = `{"format":"sar-backup","version":1,"created":1,"settings":{},`
      + `"ignored":{"games":{"all":{"10":{"name":"First","added":1},`
      + `"10":{"name":"Second","added":2}}}}}`;
    const reading = readBackup(text);
    expect(
      reading.kind === "backup" ? [...reading.contents.games.all.values()] : [],
    ).toStrictEqual([{ name: "Second", added: 2 }]);
  });

  it("never touches Object.prototype through __proto__ keys", () => {
    const text = `{"__proto__":{"polluted":1},"format":"sar-backup","version":1,"created":1,`
      + `"settings":{"__proto__":{"polluted":1},"kinds":{"__proto__":{"polluted":1}}},`
      + `"ignored":{"__proto__":{"polluted":1},`
      + `"games":{"__proto__":{"1":{"name":"x","added":1}}}}}`;
    expect(readBackup(text).kind).toBe("backup");
    expect(Object.prototype).not.toHaveProperty("polluted");
  });

  it("reads each bad settings field as its default, as stored settings do", () => {
    const reading = readBackup(
      backupText({ settings: { locale: 5, kinds: { drm: { filter: "explode", badge: false } } } }),
    );
    expect(reading.kind === "backup" ? reading.contents.settings : undefined).toStrictEqual(
      withKind(DEFAULT_SETTINGS, "drm", { badge: false }),
    );
  });
});

describe("countEntries", () => {
  it("counts one entry per key and scope, over every list", () => {
    const games = gameEntries({ all: [[10, "Ten", 1]], ai: [[10, "Ten", 1], [20, "Twenty", 1]] });
    expect(countEntries([games, creatorEntries({ drm: [["c:4", "Studio", 1]] })])).toBe(4);
  });
});
