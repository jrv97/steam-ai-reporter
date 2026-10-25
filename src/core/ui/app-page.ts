import type { KindId } from "../kinds/id";
import { KINDS } from "../kinds/registry";
import type { AnyDisclosed, KindVerdicts } from "../kinds/verdicts";
import type { MessageCatalog } from "../ports";
import { ALLOW_ALL, type AllowScope } from "../settings/allow-data";
import {
  type Banner,
  type BannerActions,
  type BannerCreator,
  type BannerOptions,
  type BannerView,
  createBanner,
  type CreatorNote,
  placeBanner,
} from "./banner";
import type { CardTriggers } from "./hover-card";
import { createTagSection } from "./tag-section";

/** What the app page shows for its own game. */
export interface AppPageView {
  readonly verdicts: KindVerdicts;
  /** Per scope: the game itself is on the ignore list there. */
  readonly ignored: Readonly<Record<AllowScope, boolean>>;
  /**
   * Per kind: nothing shows for the kind, because the game, or the base game of a DLC, is ignored
   * for it or for all kinds (`isIgnored`). It includes `ignored`; a kind only the base game
   * silences gets no banner entry and no note, since its Undo would be on the other game's page.
   */
  readonly suppressed: Readonly<Record<KindId, boolean>>;
  /** The game's developers and publishers, a row per name and role, and where each is ignored. */
  readonly creators: readonly BannerCreator[];
  /** Per kind: its badge switch is on, which the tag section follows. */
  readonly badge: Readonly<Record<KindId, boolean>>;
  /**
   * Per kind: its entry may show in the banner (the kind is enabled and its banner setting is on).
   * Each kind's badge switch is a root attribute (`applyKindSettings`).
   */
  readonly banner: Readonly<Record<KindId, boolean>>;
}

/** The game's own page: the banner above the purchase box and the tag section. */
export interface AppPageUi {
  /** Idempotent: an unchanged view changes nothing; a node a store re-render dropped returns. */
  render(view: AppPageView): void;
}

export interface AppPageOptions extends BannerOptions {
  /** Opens on the tag section's chips; without one they show no notes. */
  readonly card?: CardTriggers;
}

/**
 * What the banner shows: an entry for each disclosed kind the settings allow, a note for each
 * kind the game is ignored for, or one note for all kinds, and a note for each developer or
 * publisher ignored for a kind the banner would list, or for all kinds. A kind only the base game
 * of a DLC is ignored for shows nothing. Undefined when there is nothing.
 */
function bannerView(view: AppPageView): BannerView | undefined {
  const shown: AnyDisclosed[] = [];
  const ignored: AllowScope[] = [];
  const listed = new Set<KindId>();
  let silenced = false;
  for (const kind of KINDS) {
    const verdict = view.verdicts[kind.id];
    if (verdict.state !== "disclosed" || !view.banner[kind.id]) {
      continue;
    }
    listed.add(kind.id);
    if (view.ignored[ALLOW_ALL]) {
      silenced = true;
    } else if (view.ignored[kind.id]) {
      ignored.push(kind.id);
    } else if (!view.suppressed[kind.id]) {
      shown.push(verdict);
    }
  }
  if (silenced) {
    ignored.push(ALLOW_ALL);
  }
  const creatorNotes: CreatorNote[] = view.creators.flatMap((row) =>
    row.ignored
      .filter(({ scope }) => scope === ALLOW_ALL ? listed.size > 0 : listed.has(scope))
      .map(({ scope, key }) => ({ role: row.role, creator: row.creator, key, scope }))
  );
  return shown.length + ignored.length + creatorNotes.length === 0
    ? undefined
    : { shown, ignored, creators: view.creators, creatorNotes };
}

/**
 * The verdicts the tag section shows, in registry order: each disclosed kind with its badge on
 * that is not ignored for the game or, for a DLC, for its base game.
 */
function tagVerdicts(view: AppPageView): readonly AnyDisclosed[] {
  const shown: AnyDisclosed[] = [];
  for (const kind of KINDS) {
    const verdict = view.verdicts[kind.id];
    if (verdict.state === "disclosed" && view.badge[kind.id] && !view.suppressed[kind.id]) {
      shown.push(verdict);
    }
  }
  return shown;
}

/**
 * Renders the app page per components.mdx ("What renders for each state"): the banner, and the
 * tag section under the store's user-defined tags with one chip for each shown kind.
 */
export function createAppPageUi(
  doc: Document,
  i18n: MessageCatalog,
  actions: BannerActions,
  options: AppPageOptions = {},
): AppPageUi {
  let banner: Banner | undefined;
  const section = createTagSection(doc, i18n, options.card);

  function renderBanner(shown: BannerView | undefined): void {
    if (shown === undefined) {
      banner?.host.remove();
      return;
    }
    banner ??= createBanner(doc, i18n, actions, options);
    banner.show(shown);
    placeBanner(doc, banner.host);
  }

  return {
    render(view) {
      renderBanner(bannerView(view));
      section.render(tagVerdicts(view));
    },
  };
}
