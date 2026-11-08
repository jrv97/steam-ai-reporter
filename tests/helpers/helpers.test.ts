import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { LIST_FILTERS } from "../../src/core/kinds/kind-settings";
import { KINDS } from "../../src/core/kinds/registry";
import { fileTransferContract } from "../contracts/file-transfer.contract";
import { httpContract } from "../contracts/http.contract";
import { keyValueStoreContract } from "../contracts/key-value-store.contract";
import { make } from "./factory";
import { fakeFileTransferHarness } from "./fake-file-transfer";
import { fakeHttp } from "./fake-http";
import { fixedClock } from "./fixed-clock";
import { memoryStore } from "./memory-store";
import { strongestFilter } from "./settings";

keyValueStoreContract("memoryStore", () => memoryStore());
httpContract("fakeHttp", fakeHttp);
fileTransferContract("fakeFileTransfer", fakeFileTransferHarness);

describe("memoryStore", () => {
  it("starts from initial values", async () => {
    const store = memoryStore(new Map([["v1:settings", { badges: true }]]));
    expect(await store.get(["v1:settings"])).toStrictEqual(
      new Map([["v1:settings", { badges: true }]]),
    );
  });
});

describe("fakeHttp", () => {
  it("records calls and answers unrouted URLs with 404", async () => {
    const http = fakeHttp([]);
    const got = await http.get("https://store.steampowered.com/nothing");
    expect(got.kind === "response" ? got.status : undefined).toBe(404);
    expect(http.calls).toStrictEqual(["https://store.steampowered.com/nothing"]);
  });

  it("counts overlapping requests", async () => {
    const http = fakeHttp([]);
    await Promise.all([http.get("https://a.test/"), http.get("https://b.test/")]);
    expect(http.maxInFlight).toBe(2);
  });
});

describe("fixedClock", () => {
  it("stands still until moved", () => {
    const clock = fixedClock(1_000);
    expect(clock.now()).toBe(1_000);
    clock.advance(500);
    expect(clock.now()).toBe(1_500);
    clock.set(10);
    expect(clock.now()).toBe(10);
  });
});

describe("strongestFilter", () => {
  it("is off for no kind at all", () => {
    expect(strongestFilter([])).toBe("off");
  });

  it.each(LIST_FILTERS)("is %s for a single %s", (mode) => {
    expect(strongestFilter([mode])).toBe(mode);
  });

  it("lets hide win over dim over off, whatever the order", () => {
    expect(strongestFilter(["dim", "hide", "off"])).toBe("hide");
    expect(strongestFilter(["hide", "off", "dim"])).toBe("hide");
    expect(strongestFilter(["off", "off", "dim", "off"])).toBe("dim");
    expect(strongestFilter(new Set<"off" | "dim" | "hide">(["dim", "off"]))).toBe("dim");
  });
});

describe("make", () => {
  it.each([
    ["appId", make.appId],
    ["text.name", make.text.name],
    ["text.note", make.text.note],
    ["text.service", make.text.service],
    ["text.url", make.text.url],
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
