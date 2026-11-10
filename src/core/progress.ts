import { isTransient } from "./cache/ttl";
import { KINDS } from "./kinds/registry";
import type { KindVerdicts } from "./kinds/verdicts";
import type { Unsubscribe } from "./ports";
import type { AppId } from "./types";

/** How far the tags of one store page have loaded. */
export interface LoadProgress {
  /** The distinct games the page's surfaces asked about. */
  readonly total: number;
  /** The games whose answer is final: known, or still unknown with no retry left. */
  readonly answered: number;
  /** The answered games with no known kind, after their retry rounds or in a final answer. */
  readonly unknown: number;
  /** When GetItems requests go out again (epoch milliseconds), while Steam's limit holds them. */
  readonly pausedUntil?: number;
}

/** What the capsule UI and the app page report about the games they ask for. */
export interface LoadTracker {
  /** Counts the games not seen before; a game asked for again keeps its state until it lands. */
  asked(ids: Iterable<AppId>): void;
  /** Records a game's answer; `retrying` when a retry round will ask for it again. */
  answered(id: AppId, verdicts: KindVerdicts, retrying: boolean): void;
}

/** The page's progress and its changes. */
export interface LoadProgressFeed {
  snapshot(): LoadProgress;
  /** Hears each new progress, at most once per microtask and only when it changed. */
  subscribe(listener: (progress: LoadProgress) => void): Unsubscribe;
}

/** What a load strip follows: a page's progress, or `undefined` when no store page answers. */
export interface ProgressSource {
  /** Hears the progress now and each change after it, until the returned call stops it. */
  subscribe(listener: (progress: LoadProgress | undefined) => void): Unsubscribe;
}

/**
 * The progress of an app that is starting: its snapshot once it runs, then each change. An app
 * that failed to start is `undefined`, heard as no store page.
 */
export function followProgress(feed: Promise<LoadProgressFeed | undefined>): ProgressSource {
  return {
    subscribe(listener) {
      let unsubscribe: Unsubscribe | undefined;
      let open = true;
      void feed.then((running) => {
        if (!open) {
          return;
        }
        listener(running?.snapshot());
        unsubscribe = running?.subscribe(listener);
      });
      return () => {
        open = false;
        unsubscribe?.();
      };
    },
  };
}

/** Where one game stands: waiting for its first answer, for a retry, or answered. */
type GameState = "waiting" | "retrying" | "known" | "unknown";

/** Whether some kind holds a value; an answer of only unknowns tells nothing of the game. */
function tellsAnything(verdicts: KindVerdicts): boolean {
  return KINDS.some((kind) => verdicts[kind.id].state !== "unknown");
}

function sameProgress(a: LoadProgress, b: LoadProgress): boolean {
  return a.total === b.total && a.answered === b.answered && a.unknown === b.unknown
    && a.pausedUntil === b.pausedUntil;
}

/**
 * One progress record per page. It keeps a state per game and running counts, so a snapshot
 * costs no walk, and it tells listeners once per microtask however many games landed.
 * `pausedUntil` reads the GetItems breaker's pause when a snapshot is taken.
 */
export function createLoadProgress(
  pausedUntil: () => number | undefined,
): LoadTracker & LoadProgressFeed {
  const games = new Map<AppId, GameState>();
  let answered = 0;
  let unknown = 0;
  const listeners = new Set<(progress: LoadProgress) => void>();
  let scheduled = false;
  let told: LoadProgress | undefined;

  function snapshot(): LoadProgress {
    const until = pausedUntil();
    const counts = { total: games.size, answered, unknown };
    return until === undefined ? counts : { ...counts, pausedUntil: until };
  }

  function tell(): void {
    scheduled = false;
    const now = snapshot();
    if (told !== undefined && sameProgress(told, now)) {
      return;
    }
    told = now;
    for (const listener of listeners) {
      listener(now);
    }
  }

  function changed(): void {
    if (!scheduled && listeners.size > 0) {
      scheduled = true;
      queueMicrotask(tell);
    }
  }

  /** Adds a state's share to the counts, or takes it away with `sign` -1. */
  function count(state: GameState | undefined, sign: 1 | -1): void {
    if (state === "known" || state === "unknown") {
      answered += sign;
    }
    if (state === "unknown") {
      unknown += sign;
    }
  }

  function move(id: AppId, next: GameState): void {
    count(games.get(id), -1);
    count(next, 1);
    games.set(id, next);
  }

  return {
    asked(ids) {
      for (const id of ids) {
        if (!games.has(id)) {
          move(id, "waiting");
        }
      }
      changed();
    },

    answered(id, verdicts, retrying) {
      let next: GameState = "known";
      if (isTransient(verdicts)) {
        next = retrying ? "retrying" : "unknown";
      } else if (!tellsAnything(verdicts)) {
        next = "unknown";
      }
      move(id, next);
      changed();
    },

    snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
