import { describe, expect, it } from "vitest";
import { httpContract } from "../contracts/http.contract";
import { keyValueStoreContract } from "../contracts/key-value-store.contract";
import { fakeHttp } from "./fake-http";
import { fixedClock } from "./fixed-clock";
import { memoryStore } from "./memory-store";

keyValueStoreContract("memoryStore", () => memoryStore());
httpContract("fakeHttp", fakeHttp);

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
