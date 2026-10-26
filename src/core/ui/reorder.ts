/**
 * A list a person reorders: the order on screen and, while a row is held, that row and the order
 * it was picked up from, which Cancel puts back.
 */
export type Reorder<T> =
  | { readonly mode: "idle"; readonly order: readonly T[]; }
  | {
    readonly mode: "held";
    readonly order: readonly T[];
    readonly held: T;
    readonly before: readonly T[];
  };

/** A step of a reorder, from a pointer, a key or a click alike. */
export type ReorderAction<T> =
  | { readonly type: "pick"; readonly id: T; }
  | { readonly type: "move"; readonly to: number; }
  | { readonly type: "drop"; }
  | { readonly type: "cancel"; }
  | { readonly type: "load"; readonly order: readonly T[]; };

/** The order with `id` taken out and put at `to`. */
function moved<T>(order: readonly T[], id: T, to: number): readonly T[] {
  const rest = order.filter((each) => each !== id);
  return [...rest.slice(0, to), id, ...rest.slice(to)];
}

/**
 * The next state: a row is picked up, moved to a place (clamped to the list), dropped where it is,
 * or put back where it was. A stored order loads only while nothing is held, so another tab's save
 * never moves a row under the person's hand.
 */
export function reorder<T>(state: Reorder<T>, action: ReorderAction<T>): Reorder<T> {
  switch (action.type) {
    case "pick":
      return state.mode === "idle" && state.order.includes(action.id)
        ? { mode: "held", order: state.order, held: action.id, before: state.order }
        : state;
    case "move": {
      if (state.mode === "idle") {
        return state;
      }
      const to = Math.min(Math.max(action.to, 0), state.order.length - 1);
      return to === state.order.indexOf(state.held)
        ? state
        : { ...state, order: moved(state.order, state.held, to) };
    }
    case "drop":
      return { mode: "idle", order: state.order };
    case "cancel":
      return { mode: "idle", order: state.mode === "held" ? state.before : state.order };
    case "load":
      return state.mode === "idle" ? { mode: "idle", order: action.order } : state;
  }
}

/** The held row's place, from 0; -1 while nothing is held. */
export function heldIndex<T>(state: Reorder<T>): number {
  return state.mode === "held" ? state.order.indexOf(state.held) : -1;
}

/**
 * Where a dragged row lands: the number of other rows whose middle lies above the dragged row's
 * middle. `middles` are the rows' middles as they stood when the drag began.
 */
export function dropIndex(middles: readonly number[], from: number, middle: number): number {
  return middles.filter((each, index) => index !== from && each < middle).length;
}
