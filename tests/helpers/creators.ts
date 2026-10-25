import * as v from "valibot";
import {
  ClanIdSchema,
  type Creator,
  type CreatorKey,
  CreatorKeySchema,
  type CreatorRole,
  makeCreators,
} from "../../src/core/creator";
import type { AllowScope } from "../../src/core/settings/allow-data";
import type { BannerCreator, CreatorNote } from "../../src/core/ui/banner";

/** A creator in a test: its name, or its name with the clan ID Steam gave it. */
export type CreatorSpec = string | readonly [name: string, clan: number];

/** The developers and publishers of an item, as specs. */
export interface CreatorsSpec {
  readonly developers?: readonly CreatorSpec[];
  readonly publishers?: readonly CreatorSpec[];
}

function nameOf(spec: CreatorSpec): string {
  return typeof spec === "string" ? spec : spec[0];
}

/** One creator as GetItems sends it. */
function creatorEntry(spec: CreatorSpec): Readonly<Record<string, unknown>> {
  return typeof spec === "string"
    ? { name: spec }
    : { name: spec[0], creator_clan_account_id: spec[1] };
}

/**
 * Store item overrides holding a `basic_info` with these creators, for `storeItem(id, ...)`.
 * `short_description` stands for the keys of `basic_info` that no kind reads.
 */
export function basicInfo(creators: CreatorsSpec): Readonly<Record<string, unknown>> {
  return {
    basic_info: {
      short_description: "A description.",
      developers: (creators.developers ?? []).map(creatorEntry),
      publishers: (creators.publishers ?? []).map(creatorEntry),
    },
  };
}

function creatorsOf(specs: readonly CreatorSpec[] = []): readonly Creator[] {
  return makeCreators(
    specs.map((spec) => ({
      name: nameOf(spec),
      clan: typeof spec === "string" ? undefined : v.parse(ClanIdSchema, spec[1]),
    })),
  );
}

/** The creators a verdict holds for these specs, for `withRelations(verdicts, { creators })`. */
export function creatorsFor(
  creators: CreatorsSpec,
): { readonly developer: readonly Creator[]; readonly publisher: readonly Creator[]; } {
  return { developer: creatorsOf(creators.developers), publisher: creatorsOf(creators.publishers) };
}

/** One creator for a spec; throws when the name cannot be a key. */
export function creatorOf(spec: CreatorSpec): Creator {
  const [creator] = creatorsOf([spec]);
  if (creator === undefined) {
    throw new TypeError(nameOf(spec));
  }
  return creator;
}

/**
 * A row of the banner's creators section. `ignored` lists the scopes the creator is ignored in,
 * each on the list under the creator's own key.
 */
export function bannerCreator(
  role: CreatorRole,
  spec: CreatorSpec,
  ignored: readonly AllowScope[] = [],
): BannerCreator {
  const creator = creatorOf(spec);
  return { role, creator, ignored: ignored.map((scope) => ({ scope, key: creator.key })) };
}

/** A note for a creator ignored in a scope, under the creator's own key. */
export function creatorNote(role: CreatorRole, spec: CreatorSpec, scope: AllowScope): CreatorNote {
  const creator = creatorOf(spec);
  return { role, creator, key: creator.key, scope };
}

/** The creator key for a text such as `c:4` or `n:Valve`; throws for text that is none. */
export function keyOf(text: string): CreatorKey {
  return v.parse(CreatorKeySchema, text);
}
