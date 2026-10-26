import * as v from "valibot";
import { Uint32IdSchema } from "./types";

/** The two roles a creator has on a store item; the ignore lists keep them apart. */
export const CREATOR_ROLES = ["developer", "publisher"] as const;

export type CreatorRole = (typeof CREATOR_ROLES)[number];

/** One `make(role)` result for every role. */
export function perRole<T>(make: (role: CreatorRole) => T): Readonly<Record<CreatorRole, T>> {
  return { developer: make("developer"), publisher: make("publisher") };
}

/** The most creators of one role an app keeps; Steam lists a few. */
const MAX_CREATORS = 8;
/** The longest creator name kept; an entry with a longer one is dropped. */
const MAX_NAME_LENGTH = 200;

const CLAN_PREFIX = "c:";
const NAME_PREFIX = "n:";

/** A Steam clan (community group) account ID, which Valve gives to a developer or publisher. */
export const ClanIdSchema = v.pipe(Uint32IdSchema, v.brand("ClanId"));

export type ClanId = v.InferOutput<typeof ClanIdSchema>;

function isKeyText(text: string): boolean {
  if (text.startsWith(CLAN_PREFIX)) {
    const digits = text.slice(CLAN_PREFIX.length);
    return /^[1-9]\d*$/.test(digits) && v.is(ClanIdSchema, Number(digits));
  }
  return text.startsWith(NAME_PREFIX) && text.length > NAME_PREFIX.length;
}

/**
 * What the ignore list stores for a creator: `c:<clan id>` when Steam sends an ID, else `n:<name>`
 * with the name exactly as Steam sent it. The brand is applied only by this schema.
 */
export const CreatorKeySchema = v.pipe(
  v.string(),
  v.maxLength(NAME_PREFIX.length + MAX_NAME_LENGTH),
  v.check(isKeyText),
  v.brand("CreatorKey"),
);

export type CreatorKey = v.InferOutput<typeof CreatorKeySchema>;

/** The value as a creator key, or undefined when it is not one. */
export function toCreatorKey(value: unknown): CreatorKey | undefined {
  const result = v.safeParse(CreatorKeySchema, value);
  return result.success ? result.output : undefined;
}

/** A developer or publisher of a store item. */
export interface Creator {
  /** As Steam sends it. */
  readonly name: string;
  readonly clan?: ClanId;
  /** What Ignore stores: the clan key when there is a clan ID, else the name key. */
  readonly key: CreatorKey;
  /** Every key the creator matches on: `key`, then the name key when `key` is the clan key. */
  readonly keys: readonly CreatorKey[];
}

/** A creator as Steam or storage gives it, before its keys are made. */
export interface CreatorInput {
  readonly name: string;
  readonly clan?: ClanId | undefined;
}

/** The creator, or undefined when its name cannot be a key (empty or too long). */
export function makeCreator({ name, clan }: CreatorInput): Creator | undefined {
  const byName = toCreatorKey(NAME_PREFIX + name);
  if (byName === undefined) {
    return undefined;
  }
  if (clan === undefined) {
    return { name, key: byName, keys: [byName] };
  }
  const byClan = v.parse(CreatorKeySchema, CLAN_PREFIX + String(clan));
  return { name, clan, key: byClan, keys: [byClan, byName] };
}

/**
 * The creators of one role, in Steam's order. An entry whose name cannot be a key is dropped, a
 * repeat of a key collapses into the first, and at most `MAX_CREATORS` stay.
 */
export function makeCreators(inputs: readonly CreatorInput[]): readonly Creator[] {
  const found = new Map<CreatorKey, Creator>();
  for (const input of inputs) {
    const creator = makeCreator(input);
    if (creator !== undefined && !found.has(creator.key)) {
      found.set(creator.key, creator);
    }
  }
  return [...found.values()].slice(0, MAX_CREATORS);
}
