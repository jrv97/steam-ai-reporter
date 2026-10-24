import { SarError } from "../errors";
import { AI_KIND } from "./ai";
import type { KindId } from "./id";
import type { TagKind } from "./kind";

/**
 * The one place that lists the kinds. The kind ids, the kind list, the settings defaults and every
 * per-kind record derive from it, so a new kind is one entry here and its definition.
 */
export const KINDS = [AI_KIND] as const;

/** Whether `values` holds a value for every registered kind. */
export function hasEveryKind(values: Partial<Record<KindId, unknown>>): boolean {
  for (const kind of KINDS) {
    if (values[kind.id] === undefined) {
      return false;
    }
  }
  return true;
}

function isEveryKind<T>(
  values: Partial<Record<KindId, T>>,
): values is Readonly<Record<KindId, T>> {
  return hasEveryKind(values);
}

/**
 * One `make(kind)` result for each registered kind, keyed by kind id. `make` never returns
 * undefined. The hot paths loop over `KINDS` instead, so they allocate no closure per call.
 */
export function perKind<T>(make: (kind: TagKind) => T): Readonly<Record<KindId, T>> {
  const values: Partial<Record<KindId, T>> = {};
  for (const kind of KINDS) {
    values[kind.id] = make(kind);
  }
  if (isEveryKind(values)) {
    return values;
  }
  throw new SarError("error_unexpected", {});
}
