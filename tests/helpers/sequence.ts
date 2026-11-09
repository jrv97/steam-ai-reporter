import * as v from "valibot";
import { CHIP_TEXT_SCHEMAS, type ChipText } from "../../src/core/kinds/chip-text";
import { type HexColor, HexColorSchema } from "../../src/core/kinds/color";
import type { AppId } from "../../src/core/types";
import { appId } from "./app-ids";

/** Fresh app IDs start above every ID the captured fixtures hold. */
const APP_ID_BASE = 9_000_000;
/** Fresh clan IDs start above every clan ID the captured fixtures hold. */
const CLAN_ID_BASE = 90_000_000;
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

/** The `count` largest valid app IDs (32 bits), largest first, for URL length limits. */
export function largestAppIds(count: number): readonly AppId[] {
  return Array.from({ length: count }, (_, index) => appId(0xffff_ffff - index));
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

/** A fresh text of exactly `length` characters, for size caps. */
export function freshTextOfLength(length: number): string {
  return freshNote().padEnd(length, "x").slice(0, length);
}

/** A fresh build version in the release pipeline's `YYYY.M.N` form. */
export function freshVersion(): string {
  return `2026.11.${String(next())}`;
}

/** A fresh URL on a reserved test host. */
export function freshUrl(): string {
  return `https://example.test/${String(next())}`;
}

/** A fresh browser tab or window ID. */
export function freshBrowserId(): number {
  return next();
}

/** A fresh developer or publisher name. */
export function freshCreator(): string {
  return `Studio ${String(next())}`;
}

/** A fresh clan ID of a developer or publisher, above every clan the fixtures hold. */
export function freshClanId(): number {
  return CLAN_ID_BASE + next();
}

/** A fresh text that holds markup, which a surface must show as literal text. */
export function freshMarkup(): string {
  return `<b>Markup ${String(next())}</b>`;
}

/** A fresh Steam localization token, such as an anti-cheat's `name_loc`. */
export function freshToken(): string {
  return `#Token_${String(next())}`;
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

/** A fresh file name, as a download or a picked file carries it. */
export function freshFileName(): string {
  return `file-${String(next())}.json`;
}

/** A fresh response body or file text. */
export function freshBody(): string {
  return `Body ${String(next())}`;
}
