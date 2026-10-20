import { describe, expect, it } from "vitest";
import { httpContract } from "../../tests/contracts/http.contract";
import { fakeFetch } from "../../tests/helpers/fake-http";
import { createFetchHttp } from "./http";

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
});
