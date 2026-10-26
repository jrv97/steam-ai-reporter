import { KIND_IDS, type KindId } from "./id";
import type { TagKind } from "./kind";
import { KIND_BY_ID } from "./registry";

/**
 * Chips a capsule overlay shows, the first kinds of the order: the image is narrow and the store's
 * own flags sit on it. A "+N" chip stands for the rest.
 */
export const OVERLAY_CHIPS = 2;

/**
 * Every kind once: the known ids of `stored` in its order, then the kinds it lacks in registry
 * order, so a new kind comes last. An unknown or repeated id is dropped.
 */
export function parseOrder(stored: readonly unknown[]): readonly KindId[] {
  const order: KindId[] = [];
  for (const value of [...stored, ...KIND_IDS]) {
    const id = KIND_IDS.find((each) => each === value);
    if (id !== undefined && !order.includes(id)) {
      order.push(id);
    }
  }
  return order;
}

/** Whether two orders list the same kinds in the same places. */
export function sameOrder(a: readonly KindId[], b: readonly KindId[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

const definitions = new WeakMap<readonly KindId[], readonly TagKind[]>();

/** The definitions of `order`, built once per order the settings hold. */
export function kindsInOrder(order: readonly KindId[]): readonly TagKind[] {
  let kinds = definitions.get(order);
  if (kinds === undefined) {
    kinds = order.map((id) => KIND_BY_ID[id]);
    definitions.set(order, kinds);
  }
  return kinds;
}
