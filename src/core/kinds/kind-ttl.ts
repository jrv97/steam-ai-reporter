export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

/** How long a kind's verdicts stay fresh in the cache, by state. Unknown ones have their own. */
export interface KindTtl {
  readonly disclosed: number;
  readonly notDisclosed: number;
}

/** A declaration the developer rarely changes: both answers keep for a week. */
export const WEEK_TTL: KindTtl = { disclosed: 7 * DAY_MS, notDisclosed: 7 * DAY_MS };
