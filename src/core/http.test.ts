import { describe, expect, it, vi } from "vitest";
import { httpContract } from "../../tests/contracts/http.contract";
import { make } from "../../tests/helpers/factory";
import { fake } from "../../tests/helpers/fakes";
import { createFetchHttp, type Fetch } from "./http";

httpContract("createFetchHttp", (routes) => createFetchHttp(fake.fetch(routes).fetch));

describe("createFetchHttp", () => {
  it("sends every request without credentials", async () => {
    const backend = fake.fetch([]);
    const http = createFetchHttp(backend.fetch);
    await http.get(make.text.url());
    await http.get(make.text.url());
    expect(backend.calls.map(({ init }) => init.credentials)).toStrictEqual(["omit", "omit"]);
  });

  it("falls back to the requested URL when the response has none", async () => {
    const url = make.text.url();
    const http = createFetchHttp(() => Promise.resolve(new Response("ok")));
    expect(await http.get(url)).toMatchObject({ kind: "response", url });
  });

  it("gives up on a request that outlasts its timeout", async () => {
    const hung: Fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new TypeError());
        });
      });
    const got = await createFetchHttp(hung, 20).get(make.text.url());
    expect(got.kind).toBe("failed");
  });

  it("waits 15 seconds by default", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    await createFetchHttp(() => Promise.resolve(new Response("ok"))).get(make.text.url());
    expect(timeout).toHaveBeenCalledWith(15_000);
  });
});
