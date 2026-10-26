import { SarError } from "../errors";
import { ACCOUNT_KIND } from "./account";
import { AI_KIND } from "./ai";
import { ANTICHEAT_KIND } from "./anticheat";
import { DECK_KIND } from "./deck";
import { DRM_KIND } from "./drm";
import { EULA_KIND } from "./eula";
import { FAMILY_KIND } from "./family";
import { IAP_KIND } from "./iap";
import type { KindId } from "./id";
import { KERNEL_KIND } from "./kernel";
import type { TagKind } from "./kind";
import { MACHINE_KIND } from "./machine";
import { PVP_KIND } from "./pvp";

/**
 * The one place that lists the kinds. The kind ids, the settings defaults and every per-kind
 * record derive from it. A new kind is one entry here and its definition.
 */
export const KINDS = [
  AI_KIND,
  KERNEL_KIND,
  ANTICHEAT_KIND,
  DRM_KIND,
  ACCOUNT_KIND,
  EULA_KIND,
  PVP_KIND,
  IAP_KIND,
  DECK_KIND,
  MACHINE_KIND,
  FAMILY_KIND,
] as const;

function anyValue(): boolean {
  return true;
}

/**
 * Whether `values` holds a value for every registered kind, and `fits` accepts each one in its
 * slot. Builders fill one slot per kind from that kind's own definition.
 */
export function holdsEveryKind<T>(
  values: Partial<Record<KindId, T>>,
  fits: (id: KindId, value: T) => boolean = anyValue,
): values is Readonly<Record<KindId, T>> {
  for (const kind of KINDS) {
    const value = values[kind.id];
    if (value === undefined || !fits(kind.id, value)) {
      return false;
    }
  }
  return true;
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
  if (holdsEveryKind(values)) {
    return values;
  }
  throw new SarError("error_unexpected", {});
}

/** Each registered kind's definition by id, for code that holds a verdict and needs its words. */
export const KIND_BY_ID: Readonly<Record<KindId, TagKind>> = perKind((kind) => kind);
