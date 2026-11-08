import { appId, appIds } from "./app-ids";

/** Apps of the captured fixtures, by what they show (tests/fixtures/README.md). */
export const FIXTURE_APPS = {
  /** Disclosed AI with `ai_generation_service`; AI block first on its page. */
  aiWithService: appId(5072580),
  /** ARC Raiders: AI notes, kernel anti-cheat, EULA; the base game of 5201760 and 4210150. */
  arcRaiders: appId(1808500),
  /** Disclosed AI without a service; its German notes are in `german-context.json`. */
  germanNotes: appId(1938090),
  /** Declares nothing; its page has no disclosure block. */
  noBlock: appId(413150),
  /** Adult-only: `success: 1`, mature notes only; its page redirects to sign-in. */
  adultOnly: appId(339800),
  /** An ID that does not exist: `success: 15`; its page redirects home. */
  invalid: appId(99999999),
  /** Delisted: `unlisted: true`. */
  delisted: appId(50300),
  /** DRM, account and EULA. */
  drmAccountEula: appId(3751950),
  /** Kernel anti-cheat with boot protection and no vendor name. */
  kernelBootProtection: appId(2807960),
  /** No declaration of any kind and no PvP category. */
  noKind: appId(813230),
  /** Counter-Strike 2: free, non-kernel VAC, Valve with clan 4 in both roles. */
  vac: appId(730),
  /** Dota 2: free, non-kernel VAC. */
  vacOther: appId(570),
  /** PvP categories 49 and 36. */
  pvp: appId(105600),
  /** PvP categories; the base game of the large DLC 2778580. */
  pvpOther: appId(1245620),
  /** Kernel anti-cheat named Easy Anti-Cheat, PvP, account and EULA. */
  easyAntiCheat: appId(1172470),
  /** Delisted, kernel anti-cheat named BattlEye. */
  battlEye: appId(271590),
  /** Early Access with a note and a release date (KIKICAPS). */
  earlyAccess: appId(2514910),
  /** Left Early Access: no flag, a release date and a note (Slay the Spire). */
  leftEarlyAccess: appId(646570),
  /** AI notes with line breaks on the page. */
  lineBreaks: appId(4618750),
  /** Cyberpunk 2077: CD PROJEKT RED with clan 32989758, Deck and Machine Verified. */
  verified: appId(1091500),
  /** A paid game whose feature list leaves out Family Sharing. */
  familyLeftOut: appId(1174180),
  /** Deck and Machine Verified, Family Sharing listed. */
  verifiedOther: appId(1145360),
  /** Unreleased; the full game of the demo 4513800. */
  demoParent: appId(3489340),
  /** A demo of 3489340 that declares nothing itself. */
  demo: appId(4513800),
  /** A cosmetic DLC of 1808500 with AI notes. */
  dlc: appId(5201760),
  /** A large DLC of 1245620. */
  largeDlc: appId(2778580),
  /** Another cosmetic DLC of 1808500. */
  dlcOther: appId(4210150),
  /** The disclosed row of the search capture. */
  searchDisclosed: appId(4461450),
  /** The large carousel capsule of the tag hub capture. */
  hubCarousel: appId(632360),
  /** The second row of the wishlist capture (the first is 5072580). */
  wishlisted: appId(3664320),
} as const;

/** The apps of the search capture's rows, in page order. */
export const SEARCH_ROWS = appIds(
  4075620,
  3934270,
  3784030,
  1045010,
  3432110,
  3664320,
  4461450,
  2624160,
);

/** The apps of the search suggestions capture, in order. */
export const SUGGESTIONS = appIds(4075620, 3934270, 3784030);

/** Clan IDs that `creators.json` holds. */
export const FIXTURE_CLANS = { valve: 4, cdProjektRed: 32989758 } as const;

/** `release.steam_release_date` of the Early Access capture, in Unix seconds. */
export const EARLY_ACCESS_RELEASED = 1731596424;

/** `rtime` of the latest update post on the Early Access game's page, in Unix seconds. */
export const LAST_UPDATE_RTIME = 1793121240;
