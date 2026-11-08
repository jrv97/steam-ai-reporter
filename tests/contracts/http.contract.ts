import { describe, expect, it } from "vitest";
import type { Http, HttpResult } from "../../src/core/ports";
import { make } from "../helpers/factory";
import type { Route } from "../helpers/fake-http";

function response(result: HttpResult) {
  expect(result.kind).toBe("response");
  return result.kind === "response" ? result : undefined;
}

/**
 * The behavior every `Http` must have (src/core/AGENTS.md, "The contract-test rule"). `harness`
 * builds the implementation over a server that answers from `routes`.
 */
export function httpContract(name: string, harness: (routes: readonly Route[]) => Http): void {
  describe(`Http contract: ${name}`, () => {
    it("returns the status, final URL, headers and the whole body", async () => {
      const [url, body] = [make.text.url(), make.http.body()];
      const http = harness([[url, { body, headers: { "Content-Type": "application/json" } }]]);
      const got = response(await http.get(url));
      expect(got?.status).toBe(200);
      expect(got?.url).toBe(url);
      expect(got?.headers.get("content-type")).toBe("application/json");
      expect(got?.body).toBe(body);
    });

    it("names headers in lower case", async () => {
      const url = make.text.url();
      const http = harness([[url, { headers: { "X-EResult": "8" } }]]);
      const got = response(await http.get(url));
      expect(got?.headers.get("x-eresult")).toBe("8");
      expect([...(got?.headers.keys() ?? [])].every((key) => key === key.toLowerCase())).toBe(true);
    });

    it("reports the URL a redirect ended at", async () => {
      const [url, final] = [make.text.url(), make.text.url()];
      const http = harness([[url, { body: make.http.body(), url: final }]]);
      expect(response(await http.get(url))?.url).toBe(final);
    });

    it.each([400, 429, 503])("returns status %i as a response, with its body", async (status) => {
      const [url, body] = [make.text.url(), make.http.body()];
      const http = harness([[url, { status, body }]]);
      const got = response(await http.get(url));
      expect([got?.status, got?.body]).toStrictEqual([status, body]);
    });

    it("reports a request that gets no readable answer as failed, without rejecting", async () => {
      const url = make.text.url();
      const http = harness([[url, "network-error"]]);
      const got = await http.get(url);
      expect(got.kind).toBe("failed");
      expect(got.kind === "failed" ? got.cause : undefined).toBeInstanceOf(TypeError);
    });

    it("reports a body that cannot be read as failed", async () => {
      const url = make.text.url();
      const http = harness([[url, "body-error"]]);
      expect((await http.get(url)).kind).toBe("failed");
    });

    it("answers overlapping requests independently", async () => {
      const routes = [make.text.url(), make.text.url()].map(
        (url) => [url, { body: make.http.body() }] as const,
      );
      const http = harness(routes);
      const got = await Promise.all(routes.map(([url]) => http.get(url)));
      expect(got.map((each) => response(each)?.body)).toStrictEqual(
        routes.map(([, reply]) => reply.body),
      );
    });
  });
}
