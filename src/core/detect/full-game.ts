import type { KindId } from "../kinds/id";
import { KINDS } from "../kinds/registry";
import { isKindVerdicts, type KindVerdict, type KindVerdicts } from "../kinds/verdicts";
import type { Detector } from "../ports";
import type { AppId } from "../types";
import { settle } from "./settle";

/** The full game of a demo; undefined for any other app, a DLC included. */
function fullGameOf(verdicts: KindVerdicts): AppId | undefined {
  return verdicts.demo === true ? verdicts.parent : undefined;
}

/**
 * One kind of a demo, given its full game's. The demo's own disclosure wins, then the game's,
 * marked as the game's. An unknown game leaves the kind unknown, as the game may disclose it; a
 * game that answered without a disclosure leaves the demo's own answer.
 */
function inherit(own: KindVerdict, game: KindVerdict): KindVerdict {
  if (own.state === "disclosed") {
    return own;
  }
  if (game.state === "disclosed") {
    return { ...game, fullGame: true };
  }
  return game.state === "unknown" ? game : own;
}

/** A demo's verdicts with its full game's merged per kind; the same object when nothing moved. */
function withFullGame(own: KindVerdicts, game: KindVerdicts): KindVerdicts {
  const merged: Partial<Record<KindId, KindVerdict>> = {};
  let moved = false;
  for (const kind of KINDS) {
    const verdict = inherit(own[kind.id], game[kind.id]);
    merged[kind.id] = verdict;
    moved ||= verdict !== own[kind.id];
  }
  return moved && isKindVerdicts(merged) ? { ...own, ...merged } : own;
}

/**
 * A `Detector` that shows a demo its full game's declarations (GetItems `type` 1 with a
 * `parent`). It asks `inner` for the IDs, then once more, in one call, for the full games it was
 * not asked about, so the cache and the batching serve them like any app. Each answer stays the
 * app's own; the merge happens on every read and is never stored. One level: a full game that is
 * a demo itself lends only its own declarations.
 */
export function createFullGameDetector(inner: Detector): Detector {
  return {
    async detect(ids) {
      const own = await inner.detect(ids);
      const games = new Set<AppId>();
      for (const verdicts of own.values()) {
        const game = fullGameOf(verdicts);
        if (game !== undefined && !own.has(game)) {
          games.add(game);
        }
      }
      const fetched = games.size === 0 ? own : await settle(inner, [...games]);
      const answers = new Map<AppId, KindVerdicts>();
      for (const [id, verdicts] of own) {
        const game = fullGameOf(verdicts);
        const lent = game === undefined ? undefined : own.get(game) ?? fetched.get(game);
        answers.set(id, lent === undefined ? verdicts : withFullGame(verdicts, lent));
      }
      return answers;
    },
  };
}
