import { describe, expect, it } from "vitest";
import type { Http, HttpResult } from "../../src/core/ports";
import type { Route } from "../helpers/fake-http";

const API = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=%7B%7D";
const PAGE = "https://store.steampowered.com/app/413150/?l=english";
const LOGIN = "https://store.steampowered.com/login/?redir=app%2F339800";

function response(result: HttpResult) {
  expect(result.kind).toBe("response");
  return result.kind === "response" ? result : undefined;
}

/**
 * The behavior every `Http` must have (src/core/AGENTS.md, "The contract-test rule"). `make`
 * builds the implementation over a server that answers from `routes`.
 */
export function httpContract(name: string, make: (routes: readonly Route[]) => Http): void {
  describe(`Http contract: ${name}`, () => {
    it("returns the status, final URL, headers and the whole body", async () => {
      const http = make([[API, { body: "{}", headers: { "Content-Type": "application/json" } }]]);
      const got = response(await http.get(API));
      expect(got?.status).toBe(200);
      expect(got?.url).toBe(API);
      expect(got?.headers.get("content-type")).toBe("application/json");
      expect(got?.body).toBe("{}");
    });

    it("names headers in lower case", async () => {
      const http = make([[API, { headers: { "X-EResult": "8" } }]]);
      const got = response(await http.get(API));
      expect(got?.headers.get("x-eresult")).toBe("8");
      expect([...(got?.headers.keys() ?? [])].every((key) => key === key.toLowerCase())).toBe(true);
    });

    it("reports the URL a redirect ended at", async () => {
      const http = make([[PAGE, { body: "<html></html>", url: LOGIN }]]);
      expect(response(await http.get(PAGE))?.url).toBe(LOGIN);
    });

    it("returns error statuses as responses, with their bodies", async () => {
      const http = make([
        [`${API}&s=400`, { status: 400, body: "Invalid input_json parameter" }],
        [`${API}&s=429`, { status: 429 }],
        [`${API}&s=503`, { status: 503 }],
      ]);
      const bad = response(await http.get(`${API}&s=400`));
      expect(bad?.status).toBe(400);
      expect(bad?.body).toBe("Invalid input_json parameter");
      expect(response(await http.get(`${API}&s=429`))?.status).toBe(429);
      expect(response(await http.get(`${API}&s=503`))?.status).toBe(503);
    });

    it("reports a request that gets no readable answer as failed, without rejecting", async () => {
      const http = make([[API, "network-error"]]);
      const got = await http.get(API);
      expect(got.kind).toBe("failed");
      expect(got.kind === "failed" ? got.cause : undefined).toBeInstanceOf(TypeError);
    });

    it("reports a body that cannot be read as failed", async () => {
      const http = make([[API, "body-error"]]);
      expect((await http.get(API)).kind).toBe("failed");
    });

    it("answers overlapping requests independently", async () => {
      const http = make([[API, { body: "api" }], [PAGE, { body: "page" }]]);
      const [api, page] = await Promise.all([http.get(API), http.get(PAGE)]);
      expect(response(api)?.body).toBe("api");
      expect(response(page)?.body).toBe("page");
    });
  });
}
