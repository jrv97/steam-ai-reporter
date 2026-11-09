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
  /** A package in `kinds.json`: `categories` and no `extra_details`. */
  packageItem: appId(320795),
  /** A bundle in `kinds.json`: `success: 15`, neither `categories` nor `extra_details`. */
  bundle: appId(1),
  /** A disclosed row of `search-roguelike-50.json` whose notes hold `
` line breaks. */
  roguelikeLineBreaks: appId(4431800),
  /** A disclosed row of `search-roguelike-50.json` whose notes hold zero-width spaces. */
  roguelikeZeroWidth: appId(5269270),
} as const;

/** The 10 disclosed rows of `search-roguelike-50.json`, in row order. */
export const ROGUELIKE_DISCLOSED = appIds(
  4461450,
  5269270,
  4829430,
  4431800,
  5245850,
  5000470,
  4529660,
  5383550,
  5271980,
  5081750,
);

/** Games of `kinds.json` that declare nothing and have no PvP or In-App Purchases category. */
export const KINDS_DECLARING_NOTHING = appIds(
  813230,
  1145360,
  413150,
  504230,
  367520,
  2379780,
  620,
);

/** Items of `kinds.json` without `extra_details`: package 320795, bundle 1 and an invalid ID. */
export const KINDS_WITHOUT_DETAILS = [
  FIXTURE_APPS.packageItem,
  FIXTURE_APPS.bundle,
  FIXTURE_APPS.invalid,
] as const;

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

/** The apps of the other captured surfaces, in the order the scanner finds their hosts. */
export const SURFACE_APPS = {
  /** Two main carousel slides, two discount capsules and two tab rows. */
  home: appIds(4356430, 1867240, 466560, 1121640, 1091500, 1174180),
  /** Three sale capsules; the first one's app also fills the large carousel capsule. */
  tagHub: appIds(632360, 3845070, 2124120),
  nextFest: appIds(5053640, 4783070, 4631870),
  developer: appIds(1902490, 546560),
  wishlist: appIds(5072580, 3664320),
  /** The DLC rows of the ARC Raiders page in `SURFACES["dlc-rows"]`. */
  dlcRows: appIds(5201760, 3948510, 4920260, 4210150, 4424920, 4741040),
  /** The previous, current and next slides of the discovery queue player. */
  queue: appIds(4576490, 5037510, 4262460),
  /** The "Similar to games you've played" icons of the first queue slide, then of the last. */
  queueSimilar: appIds(730, 570, 440, 620),
} as const;

/** Clan IDs that `creators.json` holds. */
export const FIXTURE_CLANS = { valve: 4, cdProjektRed: 32989758 } as const;

/** `release.steam_release_date` of the Early Access capture, in Unix seconds. */
export const EARLY_ACCESS_RELEASED = 1731596424;

/** `rtime` of the latest update post on the Early Access game's page, in Unix seconds. */
export const LAST_UPDATE_RTIME = 1793121240;
