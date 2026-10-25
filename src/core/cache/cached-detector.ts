import type { KindVerdicts } from "../kinds/verdicts";
import type { Logger } from "../log";
import type { AppId, Detector } from "../types";
import type { VerdictCache } from "./verdict-cache";

/**
 * A `Detector` that answers from the cache and asks `inner` only about the IDs the cache does not
 * hold, then remembers what `inner` answered. Storage is best effort: when the cache cannot be
 * read or written, the failure is logged and detection goes on without it, so this detector keeps
 * the contract of never rejecting.
 */
export function cachedDetector(
  inner: Detector,
  cache: VerdictCache,
  logger: Pick<Logger, "error">,
): Detector {
  return {
    async detect(ids) {
      const distinct = [...new Set(ids)];
      const verdicts = new Map<AppId, KindVerdicts>(
        await lookupQuietly(cache, distinct, logger),
      );
      const misses = distinct.filter((id) => !verdicts.has(id));
      if (misses.length === 0) {
        return verdicts;
      }
      const fetched = await inner.detect(misses);
      for (const [id, found] of fetched) {
        verdicts.set(id, found);
      }
      await cache.save(fetched).catch((problem: unknown) => {
        logger.error(problem);
      });
      return verdicts;
    },
  };
}

async function lookupQuietly(
  cache: VerdictCache,
  ids: readonly AppId[],
  logger: Pick<Logger, "error">,
): Promise<ReadonlyMap<AppId, KindVerdicts>> {
  try {
    return await cache.lookup(ids);
  } catch (problem) {
    logger.error(problem);
    return new Map();
  }
}
