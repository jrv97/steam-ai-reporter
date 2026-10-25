import { describe, expect, it, vi } from "vitest";
import { httpContract } from "../../tests/contracts/http.contract";
import { fakeFetch } from "../../tests/helpers/fake-http";
import { createFetchHttp, type Fetch } from "./http";

httpContract("createFetchHttp", (routes) => createFetchHttp(fakeFetch(routes).fetch));

describe("createFetchHttp", () => {
  it("sends every request without credentials", async () => {
    const backend = fakeFetch([]);
    const http = createFetchHttp(backend.fetch);
    await http.get("https://api.steampowered.com/IStoreBrowseService/GetItems/v1");
    await http.get("https://store.steampowered.com/app/413150/?l=english");
    expect(backend.calls.map(({ init }) => init.credentials)).toStrictEqual(["omit", "omit"]);
  });

  it("falls back to the requested URL when the response has none", async () => {
    const http = createFetchHttp(() => Promise.resolve(new Response("ok")));
    const got = await http.get("https://store.steampowered.com/");
    expect(got.kind === "response" ? got.url : undefined).toBe("https://store.steampowered.com/");
  });

  it("gives up on a request that outlasts its timeout", async () => {
    const hung: Fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new TypeError());
        });
      });
    const got = await createFetchHttp(hung, 20).get("https://store.steampowered.com/");
    expect(got.kind).toBe("failed");
  });

  it("waits 15 seconds by default", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    await createFetchHttp(() => Promise.resolve(new Response("ok"))).get("https://x.test/");
    expect(timeout).toHaveBeenCalledWith(15_000);
  });

  it("keeps requests without credentials when it adds the signal", async () => {
    const backend = fakeFetch([]);
    await createFetchHttp(backend.fetch).get("https://store.steampowered.com/");
    expect(backend.calls[0]?.init.credentials).toBe("omit");
    expect(backend.calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });
});
