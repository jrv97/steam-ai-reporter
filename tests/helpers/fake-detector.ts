import { type KindVerdicts, UNKNOWN_KINDS } from "../../src/core/kinds/verdicts";
import type { Detector, Http, HttpResult } from "../../src/core/ports";
import type { AppId } from "../../src/core/types";

export interface FakeDetector extends Detector {
  /** The IDs of every `detect` call, in order. */
  readonly calls: readonly (readonly AppId[])[];
}

/**
 * A `Detector` that answers each ID with `verdictsFor(id)` on a later microtask, so calls that are
 * not awaited overlap, and records what it was asked.
 */
export function fakeDetector(verdictsFor: (id: AppId) => KindVerdicts): FakeDetector {
  const calls: (readonly AppId[])[] = [];
  return {
    calls,
    async detect(ids) {
      calls.push(ids);
      await Promise.resolve();
      return new Map([...new Set(ids)].map((id): [AppId, KindVerdicts] => [id, verdictsFor(id)]));
    },
  };
}

/** A `Detector` whose every call rejects, like a link that throws. */
export function rejectingDetector(): Detector {
  return { detect: () => Promise.reject(new Error()) };
}

/**
 * A `Detector` that answers the requested IDs `answers` holds and leaves the others out of its
 * answer, like a faulty link.
 */
export function partialDetector(answers: ReadonlyMap<AppId, KindVerdicts>): Detector {
  return {
    detect: (ids) =>
      Promise.resolve(
        new Map(ids.flatMap((id): [AppId, KindVerdicts][] => {
          const found = answers.get(id);
          return found === undefined ? [] : [[id, found]];
        })),
      ),
  };
}

export interface HeldDetector extends FakeDetector {
  /** Lets every pending call answer. */
  release(): void;
}

/** A `Detector` whose calls answer with `verdictsFor(id)` only once the test calls `release`. */
export function heldDetector(verdictsFor: (id: AppId) => KindVerdicts): HeldDetector {
  const calls: (readonly AppId[])[] = [];
  const pending: (() => void)[] = [];
  return {
    calls,
    release: () => {
      for (const resolve of pending.splice(0)) {
        resolve();
      }
    },
    async detect(ids) {
      calls.push(ids);
      await new Promise<void>((resolve) => {
        pending.push(resolve);
      });
      return new Map(ids.map((id): [AppId, KindVerdicts] => [id, verdictsFor(id)]));
    },
  };
}

/** The app page URL prefix that `pageDetector` requests. */
export const PAGE_URL = "https://store.steampowered.com/app/";

/** The verdicts `pageDetector` gives for one page result. */
function pageVerdicts(result: HttpResult | undefined, answer: KindVerdicts): KindVerdicts {
  if (result?.kind === "withheld") {
    return UNKNOWN_KINDS["rate-limited"];
  }
  return result?.kind === "response" && result.status === 200 ? answer : UNKNOWN_KINDS.error;
}

/**
 * A stand-in for the HTML fallback detector: one app page request per distinct ID, all sent at
 * once (the worst case for pacing). A 200 answers `answer`; a withheld request is rate-limited.
 */
export function pageDetector(http: Http, answer: KindVerdicts): Detector {
  return {
    async detect(ids) {
      const distinct = [...new Set(ids)];
      const results = await Promise.all(
        distinct.map((id) => http.get(`${PAGE_URL}${String(id)}/`)),
      );
      return new Map(
        distinct.map((id, index): [AppId, KindVerdicts] => [
          id,
          pageVerdicts(results[index], answer),
        ]),
      );
    },
  };
}
