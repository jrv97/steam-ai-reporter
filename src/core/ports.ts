import type { JsonValue } from "./json";

// The capabilities core receives from a composition root (see src/core/AGENTS.md, "Ports"). Each
// port is one capability. Every implementation passes the suite in tests/contracts/.

/** The message catalog port: typed lookup of catalog text by key. */
export type { I18n as MessageCatalog } from "./i18n/t";
export type { Logger } from "./log";

/** Stops a subscription. Calling it again does nothing. */
export type Unsubscribe = () => void;

/** A readable HTTP answer, whatever its status. The body is read in full. */
export interface HttpResponse {
  readonly kind: "response";
  readonly status: number;
  /** The final URL after redirects; the HTML fallback checks it for gates. */
  readonly url: string;
  /** Response headers by lower-case name, as far as CORS exposes them. */
  readonly headers: ReadonlyMap<string, string>;
  readonly body: string;
}

/**
 * No readable answer: a network failure, or an error answer without CORS headers, which `fetch`
 * reports as a `TypeError` with no status (rq6, S1). `cause` is the rejection, for debug logs.
 */
export interface HttpFailure {
  readonly kind: "failed";
  readonly cause: unknown;
}

/** The request was not sent, because a breaker is open (the throttle decorator holds it back). */
export interface HttpWithheld {
  readonly kind: "withheld";
}

export type HttpResult = HttpResponse | HttpFailure | HttpWithheld;

/**
 * GET requests to the two Valve hosts (rule 1), always without credentials. Never rejects: every
 * outcome is an `HttpResult`. Decorators such as a throttle wrap an `Http` and are one themselves.
 */
export interface Http {
  get(url: string): Promise<HttpResult>;
}

/**
 * Batched key-value storage (`storage.local`, `GM.*`, memory). Reads are `unknown` until a schema
 * validates them. Values are copied in and out, so later mutation of either side has no effect.
 */
export interface KeyValueStore {
  /** The stored values of the keys that exist; absent keys are absent from the map. */
  get(keys: readonly string[]): Promise<ReadonlyMap<string, unknown>>;
  /** Writes every entry, replacing existing values. */
  set(entries: ReadonlyMap<string, JsonValue>): Promise<void>;
  /** Removes the keys; keys that do not exist are ignored. */
  remove(keys: readonly string[]): Promise<void>;
  /** Every stored key, in no particular order. */
  keys(): Promise<readonly string[]>;
}

/** Wall-clock time. Timers use the web-standard `setTimeout`, which tests fake. */
export interface Clock {
  /** Milliseconds since the Unix epoch. */
  now(): number;
}

/** The stored settings value and its changes, unvalidated; core's settings module validates it. */
export interface SettingsSource {
  /** The stored settings value, or undefined when none is stored. */
  read(): Promise<unknown>;
  /**
   * Calls `listener` with the new stored value when the settings change in any tab. Where the
   * platform cannot observe changes, it never calls it, and settings apply on the next page load.
   */
  subscribe(listener: (value: unknown) => void): Unsubscribe;
}
