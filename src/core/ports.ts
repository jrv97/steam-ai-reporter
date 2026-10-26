import type { JsonValue } from "./json";
import type { KindVerdicts } from "./kinds/verdicts";
import type { AppId } from "./types";

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

/**
 * One source of verdicts: GetItems, the HTML fallback, or a chain or decorator of them. Its
 * contract (tests/contracts/detector.contract.ts): it never rejects, and the result holds exactly
 * one `KindVerdicts` per distinct requested ID, with `unknown` for anything it could not settle.
 */
export interface Detector {
  detect(ids: readonly AppId[]): Promise<ReadonlyMap<AppId, KindVerdicts>>;
}

/** A file the person picked: its name and size as the browser reports them, and its text. */
export interface PickedFile {
  readonly name: string;
  /** In bytes. */
  readonly size: number;
  /** The whole text; rejects when the file cannot be read. */
  text(): Promise<string>;
}

/**
 * Files on the person's device, without the network: offer text as a download, and open the file
 * chooser. Both run from the person's click, which browsers require for either.
 */
export interface FileTransfer {
  /** Offers `text` as a JSON file named `name`. Throws when the browser refuses. */
  save(name: string, text: string): void;
  /**
   * Opens the file chooser, labelled `label`. `onPick` hears the picked file and nothing when the
   * person cancels; a later call replaces it.
   */
  pick(label: string, onPick: (file: PickedFile) => void): void;
}
