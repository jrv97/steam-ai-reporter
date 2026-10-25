import type { Http, HttpResult } from "./ports";

/** The part of `fetch` the HTTP port uses; composition roots pass `globalThis.fetch`. */
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** Every request goes without cookies or HTTP auth (rule 1), as the spikes ran them. */
const REQUEST: RequestInit = { credentials: "omit" };

/** How long a request may take before it counts as failed, so a hung one cannot hold a queue. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * The `Http` port over `fetch`, shared by the extension and the userscript: both can call plain
 * `fetch` from the store page (rq6, S4 and S6). This is the one place requests get their options.
 */
export function createFetchHttp(fetchFn: Fetch, timeoutMs = REQUEST_TIMEOUT_MS): Http {
  return {
    async get(url: string): Promise<HttpResult> {
      try {
        const response = await fetchFn(url, { ...REQUEST, signal: AbortSignal.timeout(timeoutMs) });
        const body = await response.text();
        // Browsers already iterate header names in lower case; happy-dom keeps the sent case.
        const headers = new Map<string, string>();
        response.headers.forEach((value, name) => {
          headers.set(name.toLowerCase(), value);
        });
        return {
          kind: "response",
          status: response.status,
          // Constructed responses have an empty URL; a fetched one always has its final URL.
          url: response.url === "" ? url : response.url,
          headers,
          body,
        };
      } catch (cause) {
        return { kind: "failed", cause };
      }
    },
  };
}
