import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { LIST_FILTERS, type ListFilter } from "../../src/core/kinds/kind-settings";
import { KINDS } from "../../src/core/kinds/registry";
import { LEGACY_SETTINGS_KEY } from "../../src/core/storage-keys";
import { fileTransferContract } from "../contracts/file-transfer.contract";
import { httpContract } from "../contracts/http.contract";
import { keyValueStoreContract } from "../contracts/key-value-store.contract";
import { make } from "./factory";
import { fake } from "./fakes";
import { strongestFilter } from "./settings";

keyValueStoreContract("memoryStore", () => fake.store());
httpContract("fakeHttp", fake.http);
fileTransferContract("fakeFileTransfer", fake.fileTransferHarness);

describe("memoryStore", () => {
  it("starts from initial values", async () => {
    const initial = new Map([[LEGACY_SETTINGS_KEY, make.raw.v1Settings()]]);
    expect(await fake.store(initial).get([LEGACY_SETTINGS_KEY])).toStrictEqual(initial);
  });
});

describe("fakeHttp", () => {
  it("records calls and answers unrouted URLs with 404", async () => {
    const http = fake.http([]);
    const url = make.text.url();
    const got = await http.get(url);
    expect(got).toMatchObject({ kind: "response", status: 404 });
    expect(http.calls).toStrictEqual([url]);
  });

  it("counts overlapping requests", async () => {
    const http = fake.http([]);
    await Promise.all([http.get(make.text.url()), http.get(make.text.url())]);
    expect(http.maxInFlight).toBe(2);
  });
});

describe("fixedClock", () => {
  it("stands still until moved", () => {
    const [start, step, later] = [make.time(), make.duration(), make.time()];
    const clock = fake.clock(start);
    const seen = [clock.now()];
    clock.advance(step);
    seen.push(clock.now());
    clock.set(later);
    seen.push(clock.now());
    expect(seen).toStrictEqual([start, start + step, later]);
  });
});

describe("strongestFilter", () => {
  it.each<readonly [Iterable<ListFilter>, ListFilter]>([
    [[], "off"],
    ...LIST_FILTERS.map((mode) => [[mode], mode] as const),
    [["dim", "hide", "off"], "hide"],
    [["hide", "off", "dim"], "hide"],
    [["off", "off", "dim", "off"], "dim"],
    [new Set<ListFilter>(["dim", "off"]), "dim"],
  ])("is the strongest of %j, hide over dim over off: %s", (modes, strongest) => {
    expect(strongestFilter(modes)).toBe(strongest);
  });
});

describe("make", () => {
  it.each([
    ["appId", make.appId],
    ["text.name", make.text.name],
    ["text.note", make.text.note],
    ["text.service", make.text.service],
    ["text.url", make.text.url],
    ["text.fileName", make.text.fileName],
    ["http.body", make.http.body],
    ["raw.json", make.raw.json],
    ["time", make.time],
    ["duration", make.duration],
    ["color", make.color],
    ["chipText", make.chipText],
  ])("gives a fresh %s on every call", (_name, source) => {
    expect(source()).not.toStrictEqual(source());
  });

  it.each([
    ["verdict.disclosed", (value: string) => make.verdict.disclosed("ai", { notes: value }).notes],
    ["item.store", (value: string) => make.item.store(make.appId(), { name: value })["name"]],
    ["raw.v1Settings", (value: string) => make.raw.v1Settings({ locale: value }).locale],
    ["raw.allowEntry", (value: string) => make.raw.allowEntry({ name: value }).name],
    [
      "backup.contents",
      (value: string) =>
        make.backup.contents({ settings: make.settings({ locale: value }) }).settings.locale,
    ],
  ])("lets an override win in %s", (_name, build) => {
    const value = make.text.name();
    expect(build(value)).toBe(value);
  });

  it.each(KINDS)("builds a disclosed $id verdict that the kind stores as it is", (kind) => {
    const verdict = make.verdict.disclosed(kind.id);
    expect(v.parse(kind.stored, verdict)).toStrictEqual(verdict);
  });
});
