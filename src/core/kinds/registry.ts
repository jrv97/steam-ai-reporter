import { AI_KIND } from "./ai";
import { KIND_IDS, type KindId } from "./id";
import type { TagKind } from "./kind";

// The one place that lists the kinds. Each literal here is checked against `KindId`, so a kind in
// `KIND_IDS` without an entry fails the type check.
const REGISTRY: Readonly<Record<KindId, TagKind>> = { ai: AI_KIND };

/** Every registered kind, in `KIND_IDS` order. */
export const KINDS: readonly TagKind[] = KIND_IDS.map((id) => REGISTRY[id]);

export function kindOf(id: KindId): TagKind {
  return REGISTRY[id];
}

/** One `make(kind)` result for each registered kind, keyed by kind id. */
export function perKind<T>(make: (kind: TagKind) => T): Readonly<Record<KindId, T>> {
  return { ai: make(REGISTRY.ai) };
}

/** The values keyed by kind id, or undefined when any kind has none. */
export function definedKinds<T>(
  values: Readonly<Record<KindId, T | undefined>>,
): Readonly<Record<KindId, T>> | undefined {
  const { ai } = values;
  return ai === undefined ? undefined : { ai };
}
