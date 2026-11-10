import type { Section } from "../kinds/sections";
import type { KindVerdicts } from "../kinds/verdicts";
import type { Logger } from "../log";
import type { Detector } from "../ports";
import type { AppId } from "../types";
import type { VerdictCache } from "./verdict-cache";

/**
 * A `Detector` that answers from the cache and asks `inner` only about the IDs the cache does not
 * hold, then remembers what `inner` answered. Storage is best effort: when the cache cannot be
 * read or written, the failure is logged and detection goes on without it, so this detector keeps
 * the contract of never rejecting. An entry that lacks a section `need` names is a miss. The sink
 * hears the hits at once, then each part `inner` lets it hear, which is saved as it lands.
 */
export function cachedDetector(
  inner: Detector,
  cache: VerdictCache,
  logger: Pick<Logger, "error">,
  need: () => readonly Section[] = () => [],
): Detector {
  return {
    async detect(ids, sink) {
      const distinct = [...new Set(ids)];
      const verdicts = new Map<AppId, KindVerdicts>(
        await lookupQuietly(cache, distinct, need(), logger),
      );
      if (verdicts.size > 0) {
        sink?.(new Map(verdicts));
      }
      const misses = distinct.filter((id) => !verdicts.has(id));
      if (misses.length === 0) {
        return verdicts;
      }
      const saves: Promise<void>[] = [];
      const saved = new Set<AppId>();
      const save = (found: ReadonlyMap<AppId, KindVerdicts>): void => {
        for (const id of found.keys()) {
          saved.add(id);
        }
        saves.push(saveQuietly(cache, found, logger));
      };
      const fetched = await inner.detect(
        misses,
        sink === undefined ? undefined : (partial) => {
          save(partial);
          sink(partial);
        },
      );
      for (const [id, found] of fetched) {
        verdicts.set(id, found);
      }
      const rest = new Map([...fetched].filter(([id]) => !saved.has(id)));
      if (rest.size > 0) {
        save(rest);
      }
      await Promise.all(saves);
      return verdicts;
    },
  };
}

function saveQuietly(
  cache: VerdictCache,
  verdicts: ReadonlyMap<AppId, KindVerdicts>,
  logger: Pick<Logger, "error">,
): Promise<void> {
  return cache.save(verdicts).catch((problem: unknown) => {
    logger.error(problem);
  });
}

async function lookupQuietly(
  cache: VerdictCache,
  ids: readonly AppId[],
  need: readonly Section[],
  logger: Pick<Logger, "error">,
): Promise<ReadonlyMap<AppId, KindVerdicts>> {
  try {
    return await cache.lookup(ids, need);
  } catch (problem) {
    logger.error(problem);
    return new Map();
  }
}
