import * as v from "valibot";
import { CHIP_TEXT_SCHEMAS, type ChipText } from "../../src/core/kinds/chip-text";
import { type HexColor, HexColorSchema } from "../../src/core/kinds/color";
import type { AppId } from "../../src/core/types";
import { appId } from "./app-ids";

/** Fresh app IDs start above every ID the captured fixtures hold. */
const APP_ID_BASE = 9_000_000;
/** Fresh instants start at 2026-10-20 midday UTC and lie a minute apart. */
const TIME_BASE = Date.UTC(2026, 9, 20, 12);
const MINUTE = 60_000;
/** An odd step walks every 24-bit color once before it repeats one. */
const COLOR_STEP = 0x9e_37_79;

let counter = 0;

/** The next number of the one sequence that every primitive source draws from. */
function next(): number {
  counter += 1;
  return counter;
}

/** A fresh app ID that no fixture holds. */
export function freshAppId(): AppId {
  return appId(APP_ID_BASE + next());
}

/** `count` fresh app IDs, in ascending order. */
export function freshAppIds(count: number): readonly AppId[] {
  return Array.from({ length: count }, () => freshAppId());
}

/** A fresh game name. */
export function freshName(): string {
  return `Game ${String(next())}`;
}

/** A fresh developer note. */
export function freshNote(): string {
  return `Note ${String(next())}`;
}

/** A fresh name of a service or product, such as an AI service or a DRM. */
export function freshService(): string {
  return `Service ${String(next())}`;
}

/** A fresh URL on a reserved test host. */
export function freshUrl(): string {
  return `https://example.test/${String(next())}`;
}

/** A fresh instant, in milliseconds since the epoch, later than the one before. */
export function freshTime(): number {
  return TIME_BASE + next() * MINUTE;
}

/** A fresh span, in milliseconds. */
export function freshDuration(): number {
  return next() * 1_000;
}

/** A fresh tag color in normal form. */
export function freshColor(): HexColor {
  const rgb = (next() * COLOR_STEP) % 0x1_00_00_00;
  return v.parse(HexColorSchema, rgb.toString(16).padStart(6, "0"));
}

/** A fresh chip text short enough for every chip text field. */
export function freshChipText(): ChipText {
  return v.parse(CHIP_TEXT_SCHEMAS.chipCompact, `Tag ${String(next())}`);
}
