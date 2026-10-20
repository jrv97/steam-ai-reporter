# RQ5: Technical and policy constraints for a Chrome + Firefox MV3 extension and a userscript that flag AI-disclosing Steam games

Research date 2026-10-20. A sibling note covers the exact Steam markup and endpoints; this note covers extension mechanics, dynamic injection, rate limits and store/steam policy. Tags: `unverified` means not confirmed by a primary source in this run; `inference` means my own deduction from cited facts.

## Answer in short

- Content scripts on store.steampowered.com can fetch same-origin store pages themselves, but any cross-origin call (api.steampowered.com, other hosts) is subject to CORS in both Chrome and Firefox MV3 and must go through the background (service worker in Chrome, event page in Firefox) with `host_permissions`. Ship one manifest per browser, or one with both `background.service_worker` and `background.scripts`.
- Storage.local is 10 MB in Chrome (5 MB before Chrome 114), content-script readable, and extendable with `unlimitedStorage`; Firefox follows indexeddb limits with no fixed number published. A per-app flag cache fits easily; MV3 Chrome service workers die after 30 s idle, so persist queue state.
- App capsules on classic store pages carry `data-ds-appid` / `data-ds-packageid` or an `/app/<id>` href; Augmented Steam keys off those. Search infinite scroll is handled by hooking Steam's own page globals and firing a custom event; the react wishlist needs a MutationObserver and uses build-hashed class names that break on deploys.
- The 200 requests per 5 minutes figure for `appdetails` is community lore, not an official Valve number; Valve publishes no rate limit for store endpoints. 429s are per IP and can last hours on other store endpoints. Design for a throttled, cached, backoff-aware fetcher.
- Publishing blockers to plan for: Chrome Web Store limited use and no-remote-code rules (keep all logic in the package, do not send viewed appids to a server), and AMO source-code submission for bundled builds plus the mandatory `data_collection_permissions` key for new Firefox extensions. The Steam Subscriber Agreement has no explicit scraping clause; section 4.C bans bots/scripts that interact with Steam in ways listed there (accounts, fake stats, rewards, peer review).

## Findings

### 1a. Content script versus background for fetching store.steampowered.com pages

Content scripts send requests as the web origin they are injected into, and the same-origin policy applies to them; Chrome states cross-origin requests are always treated as cross-origin in content scripts, even with host permissions. (Source: https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)

Chrome 85 removed the ability for content scripts to bypass CORS; they get "the same request rules as the page they are running within", requests to the page's own origin work as before, cross-origin ones need a matching `Access-Control-Allow-Origin`. Chromium recommends moving cross-origin fetches to the background and relaying results by messaging, and fetching only fixed intended URLs rather than URLs supplied by the content script. (Source: https://www.chromium.org/Home/chromium-security/extension-content-script-fetches/)

Chrome docs advise the content script send a limited value (such as an item ID) and let the extension build the URL itself. (Source: https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)

Firefox MV3 is the same: since Firefox 101 content scripts follow the page's CORS policy, host permissions do not apply to content scripts but do apply to extension pages, and only background scripts have elevated cross-domain privileges. (Source: https://raw.githubusercontent.com/mdn/content/main/files/en-us/mozilla/add-ons/webextensions/content_scripts/index.md) the mdn `host_permissions` page agrees that the unrestricted xhr/fetch grant does not apply to requests from content scripts. (Source: https://raw.githubusercontent.com/mdn/content/main/files/en-us/mozilla/add-ons/webextensions/manifest.json/host_permissions/index.md)

Consequence for this project (inference): a content script on `https://store.steampowered.com/*` can fetch `/app/<id>` pages and `/api/appdetails` as ordinary same-origin requests (page cookies sent by default fetch semantics) and parse the HTML with the page's `DOMParser`, with no background hop. Anything on `api.steampowered.com` or another host must be proxied through the background, where host permissions lift CORS.

Reference implementations route through the background: SteamDB's extension accepts messages only from tabs and routes by `request.contentScriptQuery`, doing all Steam and SteamDB fetches there (source: https://raw.githubusercontent.com/SteamDatabase/BrowserExtension/master/scripts/background.js); Augmented Steam's `SteamStoreApi` runs in the background and fetches pages with `fetch(url, {credentials: "include"})` and `/api/appdetails/` with `credentials: "include"` and an optional `filter` (source: https://raw.githubusercontent.com/IsThereAnyDeal/AugmentedSteam/master/src/js/Background/Modules/Store/SteamStoreApi.ts).

### 1b. HTML parsing in the background (Chrome service worker has no DOM)

Chrome MV3 service workers cannot access the DOM or `window`; Chrome points to offscreen documents for DOM work. (Source: https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers) Augmented Steam does exactly this: on chrome/edge builds it creates an offscreen document with reason `DOM_PARSER` to parse fetched HTML, on Firefox it uses a native parser. (Sources: https://raw.githubusercontent.com/IsThereAnyDeal/AugmentedSteam/master/src/js/Background/Modules/Dom/DomParserFactory.ts, https://raw.githubusercontent.com/IsThereAnyDeal/AugmentedSteam/master/src/js/Background/Modules/Dom/OffscreenDomParser.ts) the offscreen helper there creates and closes the document around every parse call, and the fetch summary flagged a possible race when parses run concurrently (read from a single fetch of the file).

Inference: if the disclosure lives only in the app-page HTML, the simplest cross-browser design is to have the background return raw HTML text (or fetch same-origin in the content script) and parse in a context that has `DOMParser`, avoiding the offscreen permission and its reviewer justification.

### 1c. steamcommunity.com and the wishlist

The wishlist badge code in Augmented Steam lives under `Features/Store/Wishlist/` (store host), and the community side only has a profile link feature (source: file tree, https://api.github.com/repos/IsThereAnyDeal/AugmentedSteam/git/trees/master?recursive=1). Inference: a `steamcommunity.com` match is not needed for wishlist flagging; `store.steampowered.com/wishlist/*` is covered by the store match. Both Augmented Steam and SteamDB list steamcommunity.com for unrelated community features. (Sources: https://raw.githubusercontent.com/IsThereAnyDeal/AugmentedSteam/master/scripts/tools/manifest.mjs, https://raw.githubusercontent.com/SteamDatabase/BrowserExtension/master/manifest.json)

### 1d. CORS of store.steampowered.com/api/appdetails and api.steampowered.com

No official Valve documentation on CORS for these hosts was found. What exists is anecdotal: a 2019 Steam community thread reports browser calls to `api.steampowered.com` failing for lack of `Access-Control-Allow-Origin` and recommends a server-side proxy (source: https://steamcommunity.com/discussions/forum/1/1743358239838884448); a userscript on Greasy Fork fetches store pages via `GM_xmlhttpRequest` with `anonymous: true` to sidestep page CORS (source: search result summary, https://greasyfork.org/scripts/587297-steam-gamestatus). Cloudflare radar scans show CORS errors for third-party pages calling `store.steampowered.com/dynamicstore/saledata/` (source: search result summary, https://v2.radar.cfdata.org/es-la/scan/f2d5c21b-a13c-4fb8-8696-9298134f0f57/security).

`unverified`: the actual response headers of `/api/appdetails` for a foreign `Origin`. I had no way to issue an HTTP request in this run. Test with a one-off posting request, then also test from inside an extension service worker, before relying on either result. Design so it does not matter: same-origin from the store content script, or background fetch with host permission.

### 1e. Firefox MV3 differences that matter

- Background: Firefox does not support `background.service_worker` (bug 1573659); it supports `background.scripts` as a non-persistent event page. Chrome uses `service_worker` and (from Chrome 121) ignores `scripts`. Mdn's recommended cross-browser manifest lists both keys. Firefox before 120 failed to start the background page if `service_worker` was present; from 121 it starts regardless. (Source: https://raw.githubusercontent.com/mdn/content/main/files/en-us/mozilla/add-ons/webextensions/manifest.json/background/index.md)
- SteamDB ships one manifest with both `scripts` and `service_worker` pointing at `scripts/background.js`, `gecko.strict_min_version` 128.0 (source: https://raw.githubusercontent.com/SteamDatabase/BrowserExtension/master/manifest.json). Augmented Steam instead generates a per-browser manifest: `service_worker` for chrome/edge, `scripts` for Firefox, gecko ID, `strict_min_version` 140.0 (source: https://raw.githubusercontent.com/IsThereAnyDeal/AugmentedSteam/master/scripts/tools/manifestBuilder.mjs).
- Event pages in Firefox: listeners must be registered synchronously at top level, state kept in storage, timers replaced by alarms. (Source: https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/)
- Host permissions: mdn says most browsers treat `host_permissions` as optional because users can grant or revoke per host. Through Firefox 126 MV3 host permissions were not shown in the install prompt and effectively had to be granted by the user afterwards; from Firefox 127 permissions from `host_permissions` and `content_scripts` appear in the prompt and are granted at install. Chrome shows them at install. (Source: https://raw.githubusercontent.com/mdn/content/main/files/en-us/mozilla/add-ons/webextensions/manifest.json/host_permissions/index.md) because the user can revoke them later, check with `permissions.contains` and handle the revoked case. (Source: https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/)
- Registered content scripts only run if the extension has host permission for the matched domain in Firefox. (Source: https://raw.githubusercontent.com/mdn/content/main/files/en-us/mozilla/add-ons/webextensions/content_scripts/index.md; read via one fetch summary)
- `world: "MAIN"` content scripts: SteamDB's manifest uses one with `strict_min_version` 128 and Augmented Steam's manifest sets `world: "MAIN"` on its Steam scriptlet, built for Firefox too. (Sources: SteamDB and Augmented Steam manifests above) inference: main-world scripts work in Firefox 128 and later; the mdn page read did not state the Firefox version, so confirm on the compat table before depending on it.
- Chrome and Firefox match-pattern rules: `https://store.steampowered.com/*` matches only that host over HTTPS; `https://*.steampowered.com/*` matches any subdomain; the page does not confirm whether the wildcard form matches the bare apex. (Source: https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns) both reference extensions request `*://*.steampowered.com/*` for host permissions; the narrower single-host pattern better fits the Chrome "narrowest permissions" policy (see 4d).

### 1f. Chrome service worker lifetime

Chrome typically terminates an extension service worker after 30 s idle, when a single request takes longer than 5 minutes, or when a `fetch()` response takes longer than 30 s. Extension events and API calls reset the idle timer (API calls since Chrome 110); a long-lived port keeps it alive from Chrome 114. Global variables are lost, `localStorage` is unavailable; docs recommend `storage` APIs and saving queue progress after each step. (Sources: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle, https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers)

Consequence (inference): a throttled backfill of many appids must be a persisted queue that resumes on wake, driven by messages or `chrome.alarms`, not an in-memory loop with `setTimeout`.

### 1g. Storage quotas for caching per-app results

- `chrome.storage.local`: 10,485,760 bytes (5 MB in Chrome 113 and earlier); `unlimitedStorage` permission removes the cap; exposed to content scripts by default; `setAccessLevel` can restrict it to trusted contexts. (Source: https://developer.chrome.com/docs/extensions/reference/api/storage)
- `chrome.storage.sync`: about 100 KB total, 8 KB per item, 512 items, 120 writes per minute and 1800 per hour; unsuitable for a per-app cache. (Same source)
- `chrome.storage.session`: 10 MB, memory only, not exposed to content scripts by default. (Same source)
- Firefox `storage.local`: "the same storage limits as applied to IndexedDB databases"; `unlimitedStorage` needed for more; writes can still fail with quota exceeded at the global disk limit; no fixed figure given. (Source: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/local) note: that mdn page still says "in Chrome ... 5MB", which is stale against the Chrome reference above (10 MB since Chrome 114); trust the Chrome docs.
- Precedents: SteamDB caches in `storage.local` with TTLs (user data 1 hour, family data 6 hours); Augmented Steam uses indexeddb in the background with a 86,400 s TTL for package-to-app maps, localStorage for currency (1 day). (Sources: SteamDB background.js and Augmented Steam SteamStoreApi.ts above)
- Sizing (inference, an estimate not a measurement): a record of appid, tri-state flag, fetch time and a short evidence hash is on the order of tens of bytes per app, so tens of thousands of apps fit inside 10 MB; add an expiry/ttl and negative caching ("no disclosure section") so unchanged apps are not refetched.

### 2a. Userscript variant: GM APIs, @connect, caching, @match

What was fetched: the Tampermonkey documentation index page only lists section names and links (`@connect`, `@grant`, `GM_xmlhttpRequest(details)`, `GM_setValue`/`GM_getValue`, `@match/@include/@exclude`, `@run-at`, `@require/@resource`); it contains no semantics. (Source: https://www.tampermonkey.net/documentation.php) the detail pages (`?q=connect`, `?q=GM_xmlhttpRequest`, `?q=GM_values`, `?q=include`, `?q=run_at`, `?q=externals`) were not read.

So the following are from background knowledge and are all `unverified` until the detail pages and the Violentmonkey and Greasemonkey docs are read:

- `GM_xmlhttpRequest` / `GM.xmlHttpRequest` is the manager's CORS-free request API; Tampermonkey requires `@connect` entries for target hosts and prompts the user otherwise; `@grant` must list each `GM_*` or `GM.*` function used.
- `GM_setValue`/`GM_getValue` persist per script in the manager's storage, no fixed small quota known; use a ttl-wrapped cache like the extension's.
- Same-origin `fetch` from a script running on `store.steampowered.com` needs no `@connect` (inference from web standards; confirm).
- Greasemonkey 4+ exposes the promise-based `GM.*` namespace; Tampermonkey and Violentmonkey support both `GM_*` and `GM.*`.

Observed in the wild: a Greasy Fork Steam userscript uses `GM_xmlhttpRequest` with `anonymous: true` for store pages. (Source: https://greasyfork.org/scripts/587297-steam-gamestatus, via search summary)

### 2b. Sharing one codebase between extension and userscript

- `vite-plugin-monkey` builds userscripts for Tampermonkey, Violentmonkey, Greasemonkey and ScriptCat, injects the metadata block, collects the `GM_*` APIs your code imports to produce `@grant` automatically, and supports `@require`/`@resource` and a single-file output. (Source: https://raw.githubusercontent.com/lisonge/vite-plugin-monkey/main/README.md) the readme does not describe browser-extension output.
- WXT and plasmo: not researched in this run; any claim about their cross-browser manifest generation or userscript support is `unverified`.
- Precedent for one tree, many targets: Augmented Steam is one typescript/svelte source tree built per browser with build-time flags (`__CHROME`, `__EDGE`) and a `manifestBuilder.mjs` that emits per-browser manifests. (Sources: https://github.com/IsThereAnyDeal/AugmentedSteam, https://raw.githubusercontent.com/IsThereAnyDeal/AugmentedSteam/master/src/js/Background/Modules/Dom/DomParserFactory.ts, manifestBuilder.mjs above)
- Recommended shape (inference): a pure `core` module (appid discovery from the DOM, disclosure parsing, cache TTL logic, throttling queue) with two thin adapters behind one interface: `fetchText(url)` and `kv.get/set`. Extension adapter = `runtime.sendMessage` to the background plus `storage.local`; userscript adapter = `GM.xmlHttpRequest` (or plain same-origin `fetch`) plus `GM.setValue`. Build the extension with a vite-based tool and the userscript with vite-plugin-monkey from the same `core`.

### 3a. Which pages are server-rendered versus react, and how known extensions attach badges

Augmented Steam's current selector list for classic store capsules (from a file marked `@deprecated`, with a successor `HighlightsTagsUtils2.ts` not read): `.tab_item`, `.newonsteam_headercap`, `.comingsoon_headercap`, `.store_capsule`, `.dailydeal_ctn`, `.special.special_img_ctn`, `.store_main_capsule`, `.home_marketing_message[data-ds-appid]`, `.home_area_spotlight`, `.curator_giant_capsule`, `.home_content_item`, `.search_result_row`, `.small_cap`, `.game_area_dlc_row`, `.browse_tag_game`, `.similar_grid_item`, `.recommendation`, `.recommendation_carousel_item`, `.app_header`, and others. (Source: https://raw.githubusercontent.com/IsThereAnyDeal/AugmentedSteam/master/src/js/Content/Modules/Highlights/HighlightsTagsUtils.ts) the list covers home, tag/browse, discovery/recommendation and search surfaces, which implies those surfaces still expose classic markup; it is not proof of which are react (inference).

ID extraction: `AppId.fromElement` reads `element.dataset.dsAppid` first, then falls back to the `href` attribute parsed with a regex matching `store.steampowered.com|steamcommunity.com` followed by `/app/`, `/games/` or `/market/listings/` plus digits; images fall back to cdn URLs, `data-image-url`. (Source: https://raw.githubusercontent.com/IsThereAnyDeal/AugmentedSteam/master/src/js/Core/GameId/AppId.ts; the fetch summary garbled the regex in places, so re-read the file before copying it)

Attaching the badge: for each node, take the node or its first `<a>`, resolve app/sub/bundle ID, mark the node with class `es_highlight_checked` so later passes skip it, create or find a `div.es_tags` container whose placement depends on the node class (for `.tab_item`, prepend into `.tab_item_details`), and append a `<span class="es_tag_<tag>">`. A `clearDisconnectedTags()` pass removes tags whose host nodes have left the DOM. `data-ds-tagids` is read for tag checks. (Sources: HighlightsTagsUtils.ts above; https://raw.githubusercontent.com/IsThereAnyDeal/AugmentedSteam/master/src/js/Content/Features/Store/Wishlist/FWishlistHighlights.ts)

SteamDB's extension does not badge capsules in the files read: its `appicon.js` handles one icon on an app page with a single `querySelector` and no observer. (Source: https://raw.githubusercontent.com/SteamDatabase/BrowserExtension/master/scripts/appicon.js) so Augmented Steam is the relevant precedent for list-page badging.

### 3b. Search results and infinite scroll

`FSearchHighlights` does not use a MutationObserver. It queries `.search_result_row[data-ds-appid],.search_result_row[data-ds-packageid]` and re-runs on a `searchCompleted` event dispatched on `document`. That event is dispatched by a main-world scriptlet (`executeSearchOverride.js`) which wraps Steam's own `window.ExecuteSearch` and `window.SearchCompleted` and replaces `InitInfiniteScroll.oController.SetPageChangedHandler` so infinite-scroll page loads also dispatch it. Each run re-queries every row, not just new ones. (Sources: https://raw.githubusercontent.com/IsThereAnyDeal/AugmentedSteam/master/src/js/Content/Features/Store/Search/FSearchHighlights.ts, https://raw.githubusercontent.com/IsThereAnyDeal/AugmentedSteam/master/src/scriptlets/Store/Search/executeSearchOverride.js) this is why its manifest has a `world: "MAIN"`, `run_at: document_start` content script on store and community. (Source: manifest.mjs above)

Tradeoff (inference): hooking Steam's globals is exact but brittle and needs main-world injection (Firefox 128+, see 1e); a debounced `MutationObserver` on a stable container plus an `a[href*="/app/"]` scan works in a userscript with no page-global access and survives renames of Steam's functions.

### 3c. React surfaces (wishlist) and mutation observers

The wishlist is client-rendered. Augmented Steam's `WishlistDOM` finds the list through build-hashed class names (section `section.jGMVnjZbmZM-`, list `.PLkUpk974nY-.Panel`, row `.PE-3oq-yIvg-.Panel`, title link `a.I8vuMMV-osE-[href*='/app/']`), observes the section with `{subtree: true, childList: true, characterData: true}` (no `attributes`), rebuilds a snapshot and dispatches `onUpdate` on any mutation with no debounce. The hashed names are literal selectors, so a Steam redeploy that changes them breaks it; the observer is bound to the original section node and would watch a detached node if react replaced it; its own DOM edits can retrigger it. (Source: https://raw.githubusercontent.com/IsThereAnyDeal/AugmentedSteam/master/src/js/Content/Features/Store/Wishlist/Utils/WishlistDOM.ts; class names are a snapshot of the master branch at fetch time and may already be stale)

Design consequences (inference): anchor on the stable `/app/<id>` href rather than hashed classes; observe a high container (`document.body` or the nearest stable ancestor) with `childList + subtree`; debounce; mark processed nodes with a data attribute and re-verify on each pass because react can re-render and drop injected children; ignore mutations caused by your own badge nodes.

`unverified`: which of the store home carousels, discovery queue, tag/category hubs and sale/event pages are react-rendered in October 2026. Not checked directly; the Augmented Steam selector list suggests classic markup on several, and sale/event pages are widely reported to be react, but no source was fetched. Inspect each surface in devtools before choosing a strategy per page.

### 4a. Rate limits on store.steampowered.com/api/appdetails

There is no official Valve statement of a rate limit for `/api/appdetails` in the sources read. The "about 200 requests per 5 minutes" figure appears in (1) a community wiki page (https://github.com/Revadike/InternalSteamWebAPI/wiki/Get-App-Details) and (2) a blog post that says "i read somewhere" it is around 200 per 5 minutes and recommends caching (https://blog.kartones.net/post/steam-web-api-introduction/, published 2019-12-01). Treat these as one unofficial claim, not two independent confirmations, `unverified` against Valve. One search summary of an apis.io profile claims storefront endpoints are unofficial and 429 quickly above roughly 1 request per second per IP (https://apis.io/rate-limits/steam/steam-rate-limits/); also `unverified`. The two numbers conflict (200 per 300 s is about 0.67 per second); plan for the stricter.

Other `appdetails` facts from the same community wiki: `appids` accepts a comma list up to 100 only when `filters=price_overview`; otherwise multiple appids return a 400 with a `null` body, so the disclosure lookup costs one request per app. (Source: https://github.com/Revadike/InternalSteamWebAPI/wiki/Get-App-Details; read via one fetch summary)

Consequences of hitting limits: HTTP 429. SteamDB's extension backs off on 429 using `Retry-After` (default 60 s) plus up to 10 s of random jitter, and returns a "Rate limited" error to callers during the wait. (Source: SteamDB background.js above) Augmented Steam's `SteamStoreApi.ts` shows no 429 handling in the file read. Forum reports describe per-ip 429 blocks on other store/community endpoints (market, inventory) lasting hours and refreshing if you keep hitting them; applicability to `appdetails` is `unverified`. (Source: search result summary of Steam community threads, e.g. https://steamcommunity.com/discussions/forum/1/6670425060412516194) browser extensions that issue extra requests share the user's IP budget with the user's own Steam browsing, so a heavy crawler in every user's browser can degrade the user's own Steam session (inference).

Mitigations: lazy fetch only for capsules in or near the viewport, global concurrency of 1 to 2, a minimum spacing of about 1 s (stricter than the 200/5 min claim), persistent negative and positive cache with long TTLs, a persisted queue, jittered exponential backoff honoring `Retry-After`, and a circuit breaker that pauses all fetching for several minutes after a 429.

### 4b. Steam web API terms (api.steampowered.com)

The terms cap use at 100,000 calls per day, allow distributing Steam Data to end users only for their personal use through a registered "Application", require a privacy policy and disclosure of what Steam Data is stored, forbid presenting the application as endorsed by or affiliated with Valve, forbid uses that violate the Steam Subscriber Agreement or degrade Steam, and let Valve revoke access at its sole discretion. They do not mention scraping or browser extensions. (Source: https://steamcommunity.com/dev/apiterms) the official webapi overview mentions neither a daily cap nor store-host limits. (Source: https://partner.steamgames.com/doc/webapi_overview)

Applicability (inference): these terms bind users of a keyed Steam Web API application. An extension that only calls store-host endpoints from the user's browser without a key is not clearly inside them, but the "no implied endorsement" and "no degrading Steam" principles are sensible constraints either way. If the project ever adds a keyed `api.steampowered.com` call, the key cannot be embedded in a public extension or userscript (the overview says do not share keys: https://partner.steamgames.com/doc/webapi_overview).

### 4c. Steam Subscriber Agreement

Last updated September 10, 2026 per section 11 of the agreement page (confirmed by two fetches of the page and a third-party capture dated 2026-09-11 at https://conductatlas.com/platform/steam/steam-subscriber-agreement/provision/CA-P-029839/prohibition-on-all-forms-of-automation-on-steam/).

- Section 4.C (automation): "you may not use any form of scripts, bots, macros, or other non-human-controlled systems" for a listed set of purposes: automating account creation, faking gameplay statistics, earning rewards or progress without genuine user input, and automated participation in peer review/overwatch. (source: https://store.steampowered.com/subscriber_agreement/ and https://store.steampowered.com/agreement)
- Section 4.D: Valve may enforce using automated detection and human review and may restrict accounts without notice. (Same source)
- Section 2.G: no copying, modifying, decompiling, reverse engineering or creating derivative works of the Content and Services without consent. (Same source)
- The agreement text contains no occurrence of "scrap", "crawl", "spider" or "data mining" (per a fetch search of the English page). (Source: https://store.steampowered.com/subscriber_agreement/english/)

Reading (inference, not legal advice): a read-only overlay that adds a badge in the user's own browser is not one of the section 4.C purposes, and two long-lived store-listed extensions (Augmented Steam, SteamDB) do far more on the same pages, but a mass crawler that fetches thousands of app pages is closer to "non-human-controlled" access. Keep fetching user-driven (pages the user is looking at), throttled and cached.

### 4d. Chrome Web Store policy

- Single purpose: "an extension must have a single purpose that is narrow and easy to understand." (source: https://developer.chrome.com/docs/webstore/program-policies/policies)
- Use of permissions: request the narrowest permissions; avoid future-proofing. Match `https://store.steampowered.com/*` rather than every Steam subdomain. (Same source)
- Privacy: if the product handles any user data you must post an accurate privacy policy linked in the dashboard; prominent disclosure and affirmative consent are needed for collection. (Sources: https://developer.chrome.com/docs/webstore/program-policies/privacy, policies page above) the privacy page does not define whether reading the appids a user browses counts as user data (`unverified`).
- Limited use: use of user data limited to the single purpose; "collection and use of web browsing activity is prohibited" except as required by a user-facing feature; the restrictions "also apply to scraped content or otherwise automatically gathered user data"; an affirmative limited-use statement must be on a site belonging to the extension. (Source: https://developer.chrome.com/docs/webstore/program-policies/limited-use) design implication: do not transmit viewed appids to any server; if a shared flag database is ever added, fetch from it with a fixed request that does not leak browsing history, and write the privacy policy accordingly.
- MV3 code rules: all logic in the package; no script tags to outside resources, no `eval` on fetched strings, no interpreters of remote commands; loading external data and remote config is allowed so long as logic stays local; the full functionality must be discernible from submitted code and obfuscation is banned (minification is fine). (Sources: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements, https://developer.chrome.com/docs/extensions/develop/migrate/improve-security) fetching Steam html/json for parsing by packaged code is a data request, not remote code. A remotely updated JSON list of disclosure patterns or selectors is allowed as data, but a remote script of selector logic is not.
- Impersonation and IP: do not represent the product as authorized or endorsed by another company; using "Steam" in the name or the Valve logo is a trademark question the policy excerpt does not settle (`unverified`; add an unaffiliated notice and avoid Valve branding). The working repo name contains profanity; whether that conflicts with listing/metadata policy was not checked (`unverified`). (Source: policies page above)
- Anything that would block publishing (summary): obfuscated or remotely-loaded logic; permissions broader than needed; missing or inaccurate privacy disclosures; transmitting browsing activity; misleading name or endorsement implication. None is inherent to the concept.

### 4e. Mozilla add-on policies (addons.mozilla.org)

- Remote code: add-ons must be self-contained and must not load remote code for execution; request only necessary permissions; do not relax page security headers. (Source: https://extensionworkshop.com/documentation/publish/add-on-policies/; section numbers as summarized from a single fetch, `unverified`)
- Obfuscation: not allowed; minification allowed but reviewers need the pre-minified source. (Same source)
- Source submission: required for minifiers, bundlers (webpack, browserify; by extension vite), template engines and custom preprocessing. You must attach matching source to each version with build instructions (readme with OS, tool versions, every command), a lockfile, and open-source local build tools only; reviewers rebuild and compare output to the submitted package, which must match exactly. Default reviewer environment per the page is Ubuntu 24.04.4 lts desktop, node 24.14.0, npm 11.9.0, arm64, 10 GB ram, 6 vcpus, 35 GB disk (two fetches agree; state your own environment in the readme if different, or the submission may be rejected). (Sources: https://extensionworkshop.com/documentation/publish/source-code-submission/, https://raw.githubusercontent.com/mozilla/extension-workshop/master/src/content/documentation/publish/source-code-submission.md)
- Data collection key: all new extensions from November 3, 2025 must declare `browser_specific_settings.gecko.data_collection_permissions`; use `"required": ["none"]` when nothing is collected or transmitted; built-in consent exists in Firefox desktop 140+ and Android 142+, so older versions need `strict_min_version` set accordingly or a custom consent flow; the page does not say what happens if the key is omitted. (Sources: https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/, https://raw.githubusercontent.com/mozilla/extension-workshop/master/src/content/documentation/develop/firefox-builtin-data-consent.md) Augmented Steam declares `required: ["none"]`, `optional: ["websiteContent"]` and `strict_min_version` 140.0. (Source: manifestBuilder.mjs above)
- Add-on ID: an ID at `browser_specific_settings.gecko.id` is required to publish. (Source: https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/)
- The add-on policies do not address scraping third-party sites; closest rules are the data transmission and privacy sections (limit transmission to what is necessary, explicit opt-in for personal data). (Source: policies page above)

## Caveats and version notes

- No HTTP request tool was available, so CORS headers, response codes and the real behavior of `/api/appdetails` were not tested; every CORS statement about Steam hosts is from forum and scan reports.
- The userscript half (Tampermonkey `@connect`, `GM_*` semantics, Violentmonkey and Greasemonkey differences) and wxt/plasmo were not read from primary docs. The Tampermonkey documentation index page was all that loaded.
- Augmented Steam files were read from the `master` branch at fetch time; the hashed wishlist class names and the deprecated `HighlightsTagsUtils.ts` may be out of date. The successor `HighlightsTagsUtils2.ts` and `DynamicStore.ts` were not read.
- Several fetch tool outputs were summaries by a small model; where a regex or quote looked garbled (the `AppId` href regex) it is flagged. The Subscriber Agreement 4.C text and date, the AMO source-code environment and the Firefox data-consent dates were each confirmed by at least two fetches.
- `store.steampowered.com/api/appdetails` rate limit: only unofficial figures exist. Nothing here is a guarantee.
- Legal readings in 4b and 4c are not legal advice.
- The 5 MB vs 10 MB Chrome quota conflict between mdn and the Chrome reference is resolved in favor of the Chrome reference.

## Sources

- https://developer.chrome.com/docs/extensions/develop/concepts/network-requests: Chrome doc on content script vs extension-origin requests, host_permissions; used for 1a.
- https://www.chromium.org/Home/chromium-security/extension-content-script-fetches/: Chrome 85 content script CORS change and recommendation to use the background; used for 1a.
- https://developer.chrome.com/docs/extensions/reference/api/storage: storage quotas and content script access; used for 1g.
- https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle: service worker termination timings; used for 1f.
- https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers: no DOM, no localStorage, top-level listeners; used for 1b and 1f.
- https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts: content script APIs, run_at, world; used for context in 1a.
- https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns: match pattern rules; used for 1e.
- https://developer.chrome.com/docs/extensions/develop/migrate/improve-security: MV3 remote code rules; used for 4d.
- https://raw.githubusercontent.com/mdn/content/main/files/en-us/mozilla/add-ons/webextensions/manifest.json/host_permissions/index.md: Firefox host_permissions behavior and the Firefox 127 install prompt change; used for 1a and 1e.
- https://raw.githubusercontent.com/mdn/content/main/files/en-us/mozilla/add-ons/webextensions/manifest.json/background/index.md: Firefox background scripts vs service_worker; used for 1e.
- https://raw.githubusercontent.com/mdn/content/main/files/en-us/mozilla/add-ons/webextensions/content_scripts/index.md: Firefox MV3 content script CORS from Firefox 101; used for 1a and 1e.
- https://raw.githubusercontent.com/mdn/content/main/files/en-us/mozilla/add-ons/webextensions/manifest.json/content_scripts/index.md: content_scripts key, world, run_at; used for 1e.
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/local: Firefox storage.local limits; used for 1g.
- https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/: Firefox MV3 migration (event pages, host permissions, content script requests, gecko ID); used for 1e and 4e.
- https://extensionworkshop.com/documentation/publish/add-on-policies/: AMO add-on policies; used for 4e.
- https://extensionworkshop.com/documentation/publish/source-code-submission/: AMO source submission rules; used for 4e.
- https://raw.githubusercontent.com/mozilla/extension-workshop/master/src/content/documentation/publish/source-code-submission.md: raw copy used to confirm the default reviewer environment.
- https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/: data_collection_permissions requirement; used for 4e.
- https://raw.githubusercontent.com/mozilla/extension-workshop/master/src/content/documentation/develop/firefox-builtin-data-consent.md: raw copy used to confirm the 2025-11-03 date and minimum versions.
- https://developer.chrome.com/docs/webstore/program-policies/policies: Chrome Web Store program policies; used for 4d.
- https://developer.chrome.com/docs/webstore/program-policies/limited-use: limited use text; used for 4d.
- https://developer.chrome.com/docs/webstore/program-policies/privacy: privacy policy requirement; used for 4d.
- https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements: MV3 remote code requirement; used for 4d.
- https://github.com/IsThereAnyDeal/AugmentedSteam: Augmented Steam repo (gpl-3.0, per its readme); used for 2b.
- https://api.github.com/repos/IsThereAnyDeal/AugmentedSteam/git/trees/master?recursive=1: file tree; used to locate source files.
- https://raw.githubusercontent.com/IsThereAnyDeal/AugmentedSteam/master/scripts/tools/manifest.mjs: base manifest (permissions, host permissions, content scripts); used for 1c, 3b.
- https://raw.githubusercontent.com/IsThereAnyDeal/AugmentedSteam/master/scripts/tools/manifestBuilder.mjs: per-browser manifest build, gecko settings; used for 1e, 4e.
- https://raw.githubusercontent.com/IsThereAnyDeal/AugmentedSteam/master/src/js/Content/Modules/Highlights/HighlightsTagsUtils.ts: capsule selectors and tag attachment; used for 3a.
- https://raw.githubusercontent.com/IsThereAnyDeal/AugmentedSteam/master/src/js/Core/GameId/AppId.ts: appid extraction from data-ds-appid and href; used for 3a.
- https://raw.githubusercontent.com/IsThereAnyDeal/AugmentedSteam/master/src/js/Content/Features/Store/Search/FSearchHighlights.ts: search highlight and searchCompleted event; used for 3b.
- https://raw.githubusercontent.com/IsThereAnyDeal/AugmentedSteam/master/src/scriptlets/Store/Search/executeSearchOverride.js: main-world hooks for infinite scroll; used for 3b.
- https://raw.githubusercontent.com/IsThereAnyDeal/AugmentedSteam/master/src/js/Content/Features/Store/Wishlist/Utils/WishlistDOM.ts: wishlist MutationObserver and hashed selectors; used for 3c.
- https://raw.githubusercontent.com/IsThereAnyDeal/AugmentedSteam/master/src/js/Content/Features/Store/Wishlist/FWishlistHighlights.ts: wishlist highlight flow; used for 3a and 3c.
- https://raw.githubusercontent.com/IsThereAnyDeal/AugmentedSteam/master/src/js/Background/Modules/Store/SteamStoreApi.ts: background fetches, caching, no 429 handling; used for 1a and 4a.
- https://raw.githubusercontent.com/IsThereAnyDeal/AugmentedSteam/master/src/js/Background/Modules/Dom/DomParserFactory.ts and https://raw.githubusercontent.com/IsThereAnyDeal/AugmentedSteam/master/src/js/Background/Modules/Dom/OffscreenDomParser.ts: offscreen DOM parser on Chrome; used for 1b.
- https://raw.githubusercontent.com/SteamDatabase/BrowserExtension/master/manifest.json: SteamDB MV3 manifest; used for 1c, 1e.
- https://raw.githubusercontent.com/SteamDatabase/BrowserExtension/master/scripts/background.js: SteamDB background fetch proxy, caching and 429 handling; used for 1a, 1g, 4a.
- https://raw.githubusercontent.com/SteamDatabase/BrowserExtension/master/scripts/appicon.js: SteamDB app icon script; used for 3a.
- https://github.com/Revadike/InternalSteamWebAPI/wiki/Get-App-Details: community wiki on appdetails params and the 200 per 5 minutes claim; used for 4a.
- https://blog.kartones.net/post/steam-web-api-introduction/: 2019 blog with the secondhand 200 per 5 minutes figure; used for 4a.
- https://apis.io/rate-limits/steam/steam-rate-limits/: aggregator profile (seen only via a search summary); used for the 1 request per second claim, `unverified`.
- https://steamcommunity.com/discussions/forum/1/1743358239838884448: 2019 forum thread on missing CORS header at api.steampowered.com; used for 1d.
- https://steamcommunity.com/discussions/forum/1/6670425060412516194: forum thread on 429 blocks (seen via search summary); used for 4a.
- https://greasyfork.org/scripts/587297-steam-gamestatus and https://v2.radar.cfdata.org/es-la/scan/f2d5c21b-a13c-4fb8-8696-9298134f0f57/security: userscript using GM_xmlhttpRequest and a scan showing CORS errors on a store endpoint (both seen via search summaries only); used for 1d.
- https://steamcommunity.com/dev/apiterms: Steam web API terms of use; used for 4b.
- https://partner.steamgames.com/doc/webapi_overview: official web API overview, key handling and 403 rate limits on the partner host; used for 4b.
- https://store.steampowered.com/subscriber_agreement/, https://store.steampowered.com/subscriber_agreement/english/ and https://store.steampowered.com/agreement: Steam Subscriber Agreement; used for 4c.
- https://conductatlas.com/platform/steam/steam-subscriber-agreement/provision/CA-P-029839/prohibition-on-all-forms-of-automation-on-steam/: third-party capture of the automation clause and capture date; used to cross-check 4c.
- https://www.tampermonkey.net/documentation.php: Tampermonkey docs index only; used for 2a (no semantics obtained).
- https://raw.githubusercontent.com/lisonge/vite-plugin-monkey/main/README.md: vite-plugin-monkey readme; used for 2b.
