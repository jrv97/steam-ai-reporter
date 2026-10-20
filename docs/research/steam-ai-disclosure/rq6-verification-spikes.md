# RQ6: Verification spikes S1 to S7

Spikes from step 2 of `docs/plans/steam-ai-reporter-v1.md`, run on 2026-10-20. S8 (libraries and tooling) is in `rq7-library-study.md`.

Environment: the Claude desktop app's built-in Chromium browser, from a European location (prices in EUR). Unless a section says otherwise, the session was logged out and every request used `credentials: "omit"`. Calls ran from a `store.steampowered.com` page through the browser's JavaScript console, spaced at least 0.7 s apart. Fixtures captured during the spikes are listed in `tests/fixtures/README.md`.

## Answer in short

| Spike | Result | Default the code takes |
|---|---|---|
| S1 batch ceiling and 429 | The ceiling is the URL length: 250 IDs (6,886 characters) passed, 300 IDs (8,236 characters) failed with an unreadable answer. 30 back-to-back 50-ID calls all returned 200; no 429 was triggered. Error answers carry no CORS headers, so they surface as `TypeError` | 50 IDs per call plus a 4,000-character URL guard, one call in flight, 1 s spacing; a `TypeError` opens the breaker like a 429 |
| S2 item states | Adult-only, delisted and age-gated apps all return `success: 1` with `extra_details` cookie-less; an invalid ID returns `success: 15` and no `extra_details`; notes are localized when the developer translated them, but the set of disclosing apps did not change with the language | Key results by `id`; missing `extra_details` or `success != 1` is unknown `missing`; dedupe IDs before the call; treat `x-eresult != 1` or a missing `store_items` as a batch error |
| S3 CORS headers | CORS is an allow-list of Valve origins: store and community pages can read GetItems, a foreign origin (wikipedia.org) cannot; `x-eresult` is exposed. Steam sends no CORS headers to non-browser clients (posting), whatever the `Origin` | Content script calls GetItems directly where its requests carry the store origin; backoff without `Retry-After` unless S1 shows it |
| S4 extension fetch | A content script with no permissions reads GetItems in Chrome 155 and Firefox Nightly 160 (`type: "cors"`, 200); same-origin app page fetches work; `content.fetch` does not exist in MV3 | Content script only (ADR 0003): no background, no `host_permissions` |
| S5 surface map | Classic surfaces carry `data-ds-appid`; React surfaces (tag, category, specials, developer, wishlist, search suggestions) carry only `/app/<id>` links; the wishlist is a virtualized list | Link-based host finding with the refinements in "Proposed plan changes"; wishlist `hideable: false` |
| S6 userscript managers | Tampermonkey 5.5 on Chrome 155 and Firefox Nightly 160: plain `fetch` to GetItems works without `@connect`; `GM.*` values, `GM_addStyle`, a plain `<style>`, `GM_addValueChangeListener` and the menu command all work. Violentmonkey could not be tested | Plain `fetch`, no `@connect`; `GM_addStyle` with a `<style>` fallback |
| S7 HTML fallback | `?l=english` cookie-less fetch returns the full page and cannot change the store language; redirects to `/login/` and `/` confirmed; no `/agecheck/` redirect reproducible from this location; the AI block came first on every app with both blocks | Fallback as planned: final URL plus `#appHubAppName` guard, all `#game_area_content_descriptors`, heading match, notes from `p > i` |

## S1: batch ceiling and 429

**Method.** Run last, by the user, with a VPN on and in a Chrome 155 Incognito window on `https://store.steampowered.com/` while logged out, so no account and no home IP were involved. A console script refused to run off the store origin or with a signed-in session. Each call was `fetch(GetItems, {credentials: "omit", cache: "no-store"})` with synthetic IDs (multiples of 10, many invalid). Sequence: a 3-ID baseline; batches of 100, 200, 250, 300 and 400 IDs, 2 s apart; then 30 calls of 50 distinct IDs back to back with no delay, stopping at the first non-200. When a call threw, a second `mode: "no-cors"` request showed whether the server had answered at all.

**Result.**

| IDs | Encoded URL length | Outcome | Time |
|---|---|---|---|
| 3 | 333 | 200, 3 items | 216 ms |
| 100 | 2,836 | 200, 100 items | 551 ms |
| 200 | 5,536 | 200, 200 items | 953 ms |
| 250 | 6,886 | 200, 250 items | 1,490 ms |
| 300 | 8,236 | `TypeError: Failed to fetch`; the `no-cors` retry got an opaque answer | 277 ms |
| 400 | 10,936 | Same as 300 | 55 ms |

- **Ceiling.** It is the URL length, not an ID count: 6,886 characters passed and 8,236 failed, which fits the common 8 KB request-line limit of the `nginx` front end (the status was not captured; 414 is the likely code). With real 7-digit app IDs each ID costs about 31 encoded characters, so the same limit falls at about 250 IDs.
- **Error responses are unreadable.** The over-long request was answered without CORS headers, so JavaScript saw only a `TypeError`, not a status. A 429 from the same front end would very likely look the same, so `Retry-After` will not be readable in practice.
- **No rate limit hit.** All 30 back-to-back 50-ID calls returned 200 (1,500 IDs in about 17 s, average 557 ms, range 226 to 1,167 ms). No 429 and no `Retry-After` header appeared. Where the real limit lies stays unknown; it is above about 1.8 calls per second sustained for 30 calls from one IP.
- Earlier, a 50-ID call with real IDs (the 50 rows of `/search/?term=roguelike`) returned 50 items in request order in 1.16 s; its URL was 1,741 characters and its body 99,315 bytes (`content-length: 5187`, so gzip shrinks it about 19 times). Responses carry `cache-control: private, max-age=120`.

**Default the code takes.**
- Batches of at most 50 IDs, as planned, with a guard that splits any batch whose encoded URL would exceed 4,000 characters (half the observed limit), so the limit is never reached even with longer IDs or a larger context.
- One call in flight, 1 s spacing. S1 shows ample headroom, so these stay as safety margins for the user's own browsing on the same IP, not as measured limits.
- A `TypeError` from GetItems counts like a 429: open the breaker with the fixed backoff (60 s plus up to 10 s of jitter) and treat the batch as unknown `rate-limited`. `Retry-After` is read only if it ever becomes readable.

## S2: age gate and item states

**Method.** Cookie-less GetItems calls with `data_request.include_extra_details: true` and context `english`/`US` for 1938090 (violence descriptors), 339800 (adult only), 99999999 (invalid), 50300 and 241560 (delisted), then 5072580, 1808500 and 1938090 in `english`, `german`, `french`, `japanese` and `schinese`, then the 50-row roguelike batch in `english`/`US` and `german`/`DE`. Edge cases: duplicate IDs, an empty `ids` list, no `context`, and malformed `input_json`.

**Result.**

| App | `success` | `visible` | `extra_details` | Notes |
|---|---|---|---|---|
| 1938090 Call of Duty | 1 | true | yes, with `content_survey_ai_notes` | Not gated in the API |
| 339800 HuniePop (adult only) | 1 | true | yes, no AI notes; mature text in `content_survey_notes` | Not gated in the API, although its page redirects to sign-in |
| 99999999 (invalid) | 15 | false | absent | `id` echoes the request, `appid` is `0`, `name` is empty |
| 50300, 241560 (delisted) | 1 | true | yes | Extra key `unlisted: true` |

- **Language.** For 5072580 and 1808500 the notes were identical in all five languages. Call of Duty returned translated notes in each language (German 85 characters, Japanese 33, Simplified Chinese 29, English 70) and a localized `name`. In the 50-row batch the same 10 apps disclosed in English and German; 3 of the 10 had different German text. So presence does not depend on the language, but the text does when the developer translated it.
- **Batch behaviour.** Items come back in request order. Duplicate IDs are not merged: `[413150, 413150]` returned two items.
- **Malformed calls.** `ids: []` returns 200 `{"response":{}}` with `x-eresult: 1`. A request without `context`, or with no `input_json` at all, returns 200 `{"response":{}}` with `x-eresult: 8`. A malformed `input_json` returns 400 with an HTML body ("Invalid input_json parameter").
- **Headers readable from the store origin:** `cache-control`, `content-length`, `content-type`, `expires`, `x-eresult`. The last one is not CORS-safelisted, so the server exposes it.
- **Text shape.** Notes can contain `\r\n` line breaks, trailing spaces and zero-width spaces (`U+200B`), for example 5269270 in the roguelike batch.

**Default the code takes.**
- Map results by `id` (the requested ID), never by `appid`, which is `0` for invalid items.
- Disclosed when `success === 1` and `extra_details.content_survey_ai_notes` is non-empty after trimming whitespace (including `U+200B`). Not disclosed when `success === 1` and `extra_details` is present without notes. Unknown `missing` otherwise.
- Dedupe IDs before building a batch.
- A 200 response is a batch error when `x-eresult` is present and not `1`, or when `store_items` is missing although IDs were sent.
- Normalize `\r\n` to `\n` before rendering; render with `white-space: pre-line`.
- Detection keeps the English context, as planned. See "Proposed plan changes" for a cheaper option for localized text.

Fixtures: `getitems/mixed-states.json`, `getitems/german-context.json`, `getitems/search-roguelike-50.json`, `getitems/empty-response.json`.

## S3: CORS headers

**Method.** The user ran the `posting/` collection (`posting/README.md`). The `on_response` hook saved every response's headers: GetItems with `Origin` set to `https://store.steampowered.com`, `https://example.com`, `moz-extension://<uuid>`, `chrome-extension://<id>` and none, plus two app page requests with redirects not followed. Because posting cannot send a browser's `Sec-Fetch-*` headers, the CORS decision was then checked in the built-in browser, which does enforce CORS: from a store page, a `help.steampowered.com` or `steamcommunity.com` HTML fetch fails. GetItems was then called from pages on three origins.

**Result.**
- **posting:** every GetItems response was 200 with the same headers (`server`, `content-type`, `x-eresult`, `vary: Accept-Encoding`, `content-encoding`, `content-length`, `cache-control: private, max-age=120`, `expires`, `date`, `connection`) and **no `access-control-*` header for any Origin**, the store origin included. Since a browser on the store origin does pass CORS (below), Steam must decide from request headers that a browser sends and posting does not, such as `Sec-Fetch-*` or `Referer` (inference; the exact trigger was not isolated). Posting therefore cannot show the allow-list.
- **Browser:**

| Page origin | `fetch(GetItems)` | `mode: "no-cors"` | Meaning |
|---|---|---|---|
| `https://store.steampowered.com` | 200, `type: "cors"`, body readable | n/a | Allowed |
| `https://steamcommunity.com` | 200, `type: "cors"`, body readable | n/a | Allowed |
| `https://www.wikipedia.org` | `TypeError: Failed to fetch` | 200 opaque | Blocked by CORS (the network path works) |

  CORS on GetItems is an allow-list of Valve origins, not `*`. A content script whose requests carry the store page's origin can read GetItems; a request carrying a `moz-extension://` or `chrome-extension://` origin falls outside the list, so only a host permission (which lifts CORS for extension pages and background scripts) would make it readable.
- **Exposed headers.** Readable from the store origin: `cache-control`, `content-length`, `content-type`, `expires` (all CORS-safelisted) and `x-eresult`. So `access-control-expose-headers` names `x-eresult`. Whether it names `retry-after` cannot be seen without a 429 (see S1).
- **App page, cookie-less.** `/app/413150/?l=english` returned 200 and set only the `steamCountry` and `sessionid` cookies, no language cookie. `/app/339800/?l=english` returned 302 with `location: https://store.steampowered.com/agecheck/app/339800/?l=english`, which then leads to sign-in (S7). The `content-security-policy` header matches S5.

**Default the code takes.** The content script calls GetItems directly with `credentials: "omit"` wherever its requests carry the store origin (Chrome, per S4). `x-eresult` is read for batch errors (S2). 429 backoff uses a fixed delay unless S1 shows that `Retry-After` is readable. ADR 0003 depends on S4: content script only if Firefox content-script requests carry the page origin, otherwise a background relay with `host_permissions: ["https://api.steampowered.com/*"]` for Firefox.

## S4: extension fetch

**Method.** A throwaway MV3 extension (kept outside the repo) with no permissions and one content script on `https://store.steampowered.com/*`. On `/app/1808500/` it called GetItems for 5072580, 1808500 and 413150 with `fetch(url, {credentials: "omit"})`, tried Firefox's `content.fetch`, and fetched `/app/413150/?l=english` same-origin. The user loaded it unpacked in Chrome 155 and as a temporary add-on in Firefox Nightly 160 (the project's Firefox; see AGENTS.md "Development browsers").

**Result.**

| Probe | Chrome 155 | Firefox Nightly 160 |
|---|---|---|
| `fetch` GetItems | 200, `type: "cors"`, 3 items, 2 disclosed, 237 ms | 200, `type: "cors"`, 3 items, 2 disclosed, 298 ms |
| Readable headers | safelisted plus `x-eresult` | same |
| `content.fetch` | not available | not available (no `content` global in an MV3 content script) |
| Same-origin `/app/413150/?l=english` | 200, `type: "basic"`, `#appHubAppName` present, 412 ms | 200, `type: "basic"`, `#appHubAppName` present, 312 ms |

Given S3 (CORS admits only Valve origins), a readable `cors` response means both browsers sent the content script's request with the store page's origin, not an extension origin. The request header itself was not inspected.

**Default the code takes.** ADR 0003 picks the content-script-only runtime: no background script, no `host_permissions`, permissions exactly `["storage"]`, as invariant 3 already states. Plain `fetch` in both browsers; `content.fetch` is not used.

## S5: surface map

**Method.** Each surface was opened in the built-in browser, first logged out, then logged in for the wishlist, the discovery queue and the logged-in home page. A console script counted `[data-ds-appid]` elements and `a[href*="/app/"]` links, read `<html lang>` and the `content-security-policy` header (same-origin `HEAD`), and tested three host rules (see "Host finding"). Capsule containers were cut out of the live DOM, sanitized and saved under `tests/fixtures/surfaces/`. Selectors below come from these observations only.

**Result.**

| Surface | Rendering | IDs on capsules | Capsule element | Notes |
|---|---|---|---|---|
| App page `/app/<id>/` | Classic server HTML with React islands (`[data-featuretarget]`) | `data-ds-appid` on DLC rows | `a.game_area_dlc_row` | Banner anchor: `.game_description_column` starts with `#game_area_purchase` on released, coming-soon and demo pages. The right column shows a `.DRM_notice` "Connects to 3rd-Party Service for AI Content Generation" when `ai_generation_service` is set (5072580) |
| Search `/search/` | Classic | `data-ds-appid` (single IDs only) | `a.search_result_row` in `#search_resultsRows` | Infinite scroll appends the next 50 rows to the same container |
| Home `/` | Classic, plus React rows | `data-ds-appid`; comma lists only next to `data-ds-packageid` or `data-ds-bundleid` | `a.store_main_capsule` (CSS background image, no `img`), `a.sale_capsule`, `a.tab_row_item` | The React rows (`discounts-and-events`, `discovery-queue-home`, `personal-calendar-home`) stayed empty in the automated session, logged in or out, so they go to the manual checklist. Logged in, owned and wishlisted capsules get `ds_flagged` |
| Tag hub `/tags/en/<tag>/` | React `sale-display`, hashed class names | Links only | `div.Panel` grid capsule; large `LibraryAssetExpandedDisplay` carousel capsule | Stable semantic classes next to the hashed ones: `CapsuleImageCtn`, `CapsuleDecorators`, `SaleSectionContainer`, `HeroCapsuleImageContainer` |
| Category hub `/category/<name>/` and `/specials` | Same React `sale-display` template as the tag hub | Links only | Same as the tag hub | Covered by the tag hub fixture |
| Developer `/developer/<name>` | React creator home | Links only | `StoreSaleWidgetOuterContainer` | Publisher pages use the creator home template too (not visited) |
| Wishlist `/wishlist/` | React, virtualized | Links only; the drag row ID is `WishlistItem-<appid>-0` | `div.Panel[data-index]` | Redirects to `/wishlist/id/<vanity>/`. An inner scroll container holds an absolutely positioned list moved with `translateY`; with 602 items only 16 to 28 rows are mounted. Rows scrolled out are unmounted and new elements are mounted (no element was reused for another app) |
| Discovery queue `/explore/` | Classic | Link only | `.discovery_queue_static` preview | The queue overlay was not opened, because stepping through it changes the account's queue |
| Search suggestions | React, inside the header root `[data-featuretarget="store-menu-v7"]` | Links only | `a` with an `img` per result | Results come from `api.steampowered.com/IStoreQueryService/SearchSuggestions` |
| Old `steamcommunity.com/profiles/<id>/wishlist/` | Redirect | n/a | n/a | Redirects to `store.steampowered.com/wishlist/id/<vanity>/`; no community match needed |

- **App link shapes.** `/app/<id>/<slug>/?snr=...` (classic), `/app/<id>/<slug>?snr=...` (React, no trailing slash), `/app/<id>?snr=...` (no slug) and `/app/<id>/?snr=...#app_reviews_hash` (review score links). Every one was absolute on `https://store.steampowered.com`.
- **`<html lang>`** follows the Steam language: `english` en, `german` de, `french` fr, `spanish` es, `latam` es-419, `portuguese` pt, `brazilian` pt-br, `schinese` zh-cn, `tchinese` zh-tw, `japanese` ja, `koreana` ko, `russian` ru, `ukrainian` uk, `polish` pl, `turkish` tr, `thai` th, `vietnamese` vi, `indonesian` id, `arabic` ar, `czech` cs, `danish` da, `dutch` nl, `finnish` fi, `greek` el, `hungarian` hu, `italian` it, `norwegian` no, `romanian` ro, `swedish` sv, `bulgarian` bg.
- **CSP.** Identical on the app page, search, home, tag, category, specials and developer pages: `default-src blob: data: https: 'unsafe-inline' 'unsafe-eval'`, with `script-src`, `object-src`, `connect-src`, `frame-src` and `frame-ancestors`, and no `style-src`. Inline styles therefore fall back to `default-src`, which allows them: a `<style>` element inserted from the console applied. `connect-src` lists `https://api.steampowered.com/`, so page-context code (a userscript injected into the page) may call GetItems.
- **Logged-in data on the page.** `#application_config[data-userinfo]` holds the Steam ID and account name. The fixture sanitizer removes that element; product code must never read it.

**Host finding.** Three rules were compared on the tag hub (56 app links, 27 apps):
- The plan's rule, "highest ancestor up to 8 levels whose links all name one app", gave the right capsule in most cases but climbed into a 1326 x 663 px `SaleSectionTabListContainer` when a tab section showed a single app.
- "Lowest ancestor that contains an image" never overshot, but on carousel capsules the image link and the title block are siblings, so it produced two hosts for one capsule.
- "Lowest image-bearing ancestor, then climb at most 3 more levels while the links still name one app, then drop hosts nested in another host of the same app" gave one host per capsule and no section-sized host. It returned the same host counts as the plan's rule (43 hosts for 27 apps; repeats are carousel clones and apps listed in several sections).
- The home main carousel capsule has no `img`; its image is a CSS `background-image` on a child `div`. An "image" test must accept an inline `background-image` too.
- The header root holds the search suggestions, so the scanner cannot skip the header wholesale. Its navigation links have no images, so the image test already drops them.

**Default the code takes.** Candidates come from `[data-ds-appid]` with a single numeric ID, then from `a[href]` whose URL is on `store.steampowered.com` with a path matching `^/app/(\d+)(?:[/?#]|$)`. Hosts follow the third rule above. Wishlist rows are `hideable: false`. Locale `auto` maps `<html lang>` through the table above.

Fixtures: `surfaces/search/rows.html`, `surfaces/home/capsules.html`, `surfaces/tag-hub/capsules.html`, `surfaces/developer/widgets.html`, `surfaces/wishlist/rows.html`, `surfaces/search-suggestions/popup.html`, plus the DLC rows in `app-page/1808500-ai-only.html`.

## S6: userscript managers

**Method.** A throwaway userscript (kept outside the repo) with `@match https://store.steampowered.com/*`, `@noframes`, `@run-at document-idle`, no `@connect`, and `@grant` for `GM.getValue`, `GM.setValue`, `GM.deleteValue`, `GM.listValues`, `GM_addStyle`, `GM.registerMenuCommand`, `GM_addValueChangeListener` and `GM_info`. On `/app/1808500/` it called GetItems with plain `fetch`, round-tripped an object through the `GM.*` value calls, injected a rule with `GM_addStyle` and another through a plain `<style>` element, registered a value change listener and a menu command, and reported `GM_info.injectInto` and `GM_info.sandboxMode`.

**Result.**

| Check | Chrome 155, Tampermonkey 5.5.1 | Firefox Nightly 160, Tampermonkey 5.5.0 |
|---|---|---|
| Plain `fetch` to GetItems, no `@connect` | 200, 2 items | 200, 2 items |
| `GM.setValue` / `getValue` / `listValues` / `deleteValue` | all pass; objects stored as objects | same |
| `GM_addStyle` | applies | applies |
| Plain `<style>` element | applies | applies |
| `GM_addValueChangeListener` | fires locally with `remote = false` | same |
| `GM.registerMenuCommand` | the menu entry runs its callback | same |
| Context | `sandboxMode: "raw"` (page context) | `sandboxMode: "raw"` |

Violentmonkey was not tested. Its `@inject-into` fallback therefore stays unverified; Steam's CSP allows inline scripts (`script-src 'unsafe-inline'`, S5), so Violentmonkey's default page injection should not need the fallback.

**Default the code takes.** Plain `fetch` with no `@connect` and no `GM.xmlHttpRequest`; `GM_addStyle` with a `<style>` element fallback (both work under Steam's CSP); settings apply live through `GM_addValueChangeListener` where it exists.

## S7: HTML fallback

**Method.** From a store page: `fetch("/app/<id>/?l=english", {credentials: "omit"})` for 413150, 5072580, 1808500, 1938090, 339800, 99999999, 50300 and 4618750, plus six more apps with mature descriptors (271590, 1174180, 782330, 1091500, 1245620, 2050650) to look for an age check. Language stickiness: a top-level visit to `/app/1808500/?l=german`, then a visit without `l`. Block order: every app with both blocks among those sampled.

**Result.**
- **Full page.** 413150 returned 200, no redirect, 136 KB, `lang="en"`, `#appHubAppName` present, in about 1.4 s. Pages ran from 104 KB to 351 KB. One HTML fetch costs about as much as a 50-item GetItems call.
- **Language.** The top-level `?l=german` visit rendered German (`lang="de"`); the next visit without `l` was English again, and no language cookie was readable. A `credentials: "omit"` fetch neither sends nor stores cookies, so it cannot change the store language, logged in or not.
- **Redirects.** 339800 (adult only) ended at `/login/?redir=...%2Fagecheck%2Fapp%2F339800%2F%3Fl%3Denglish` with a 200 "Sign In" page. 99999999 ended at `/` (the 960 KB home page). `Response.redirected` was true for both. Delisted 50300 served a normal page with `#appHubAppName` and no block.
- **Age check.** None of the seven mature apps redirected to `/agecheck/` from this location; even a direct `/agecheck/app/1938090/` bounced back to the app page. rq2 saw the redirect through a third-party fetcher in another region, so the redirect depends on the region. The agecheck fixture is synthetic.
- **Block order.** The AI block came before the mature block on all four apps that have both (5072580, 1938090, 4431800, 4461450). The mature-first fixture is synthetic.
- **Live DOM.** After Steam's scripts run, the block sits in `.game_page_autocollapse_ctn > .game_page_autocollapse[style="max-height: none;"]` with a `.game_page_autocollapse_fade` "READ MORE" sibling. `#game_area_content_descriptors > h2` still matches.
- **Line breaks.** 4618750's notes are `...product.\r\n\r\nThe game does not use AI...` in GetItems. The page renders `<br>` tags, each followed by a newline in the source, so `textContent` keeps the breaks. The text inside `<i>` starts with a newline and five tabs and ends with four tabs.
- **Embedded data.** The app page's `apppage-store-browse-cache` mount carries GetItems data for the current app, but without `include_extra_details`, so it has no AI notes.

**Default the code takes.** As planned: unknown `gated` when the final URL is under `/agecheck/` or `/login/` or not under `/app/<id>`, or when `#appHubAppName` is missing; otherwise collect every `#game_area_content_descriptors`, keep the one whose trimmed `h2` is `AI Generated Content Disclosure`, and read the notes from `p > i` with trimming. At most 10 HTML fetches per page view.

Fixtures: everything under `tests/fixtures/app-page/`.

## Proposed plan changes

The main session decides; each item names the plan section it touches.

1. **Step 5, parser:** key results by `id`, dedupe IDs before the call, and treat `x-eresult != 1` (readable cross-origin) or a missing `store_items` as a batch error.
2. **Step 9, host finding:** replace "highest ancestor, at most 8 levels" with "lowest ancestor that contains an `img` or an inline `background-image`, then at most 3 more levels while every link names the same app; drop a host nested in another host of the same app". Do not skip `[data-featuretarget="store-menu-v7"]` wholesale (it hosts the search suggestions); the image test already drops navigation links.
3. **Step 9, app link parsing:** accept `/app/<id>` followed by `/`, `?`, `#` or the end; React links have no trailing slash.
4. **Step 13, placements:** the wishlist is virtualized, so `hideable: false`. Its rows also expose the app ID as `data-rfd-draggable-id="WishlistItem-<appid>-0"`, a second source next to the links.
5. **Step 10, display language (open choice for the user):** S2 showed that notes are localized when the developer translated them, but that the set of disclosing apps does not change. Two options:
   - As planned: detect in English; on the app page, one extra GetItems call in the store language for the banner.
   - Query every batch in the page's language (`<html lang>` mapped back to the Steam name): no extra banner call, and badge tooltips are localized too. The cache record stores the language; the banner re-fetches only that one app if the cached language differs.
   Recommendation: the second, since it removes a request and shows the developer's own translation everywhere.
6. **Step 8, locale mapping:** use the `<html lang>` table in S5 for `auto`.
7. **Risks:** add "the adult-only app page redirects to sign-in cookie-less, but GetItems answers for it", so the old risk "adult-only apps may stay unknown" no longer holds for the API path. Mark "Firefox content-script fetch may fail CORS" as resolved (S4), and "`Retry-After` is probably unreadable" as confirmed in practice (S1: error answers carry no CORS headers).
8. **Step 3, ADR 0003:** S3 and S4 pick the content-script-only runtime; the relay branch in step 3 ("If S3 or S4 showed ...") can be dropped. Invariant 3 stands as written.
9. **Steps 5 and 7, batching and backoff:** keep 50 IDs per call, and add a guard that splits a batch whose encoded GetItems URL would exceed 4,000 characters (S1 found the server limit between 6,886 and 8,236). Treat a `TypeError` from GetItems like a 429 (breaker, fixed backoff), because error answers are unreadable cross-origin.
10. **Step 12, userscript:** S6 confirms no `@connect` and no `GM.xmlHttpRequest` for Tampermonkey on Chrome and Firefox Nightly; the "manager that failed in S6" branch is not needed for Tampermonkey. Violentmonkey stays untested and goes on the manual checklist.

## Caveats

- One browser, one region, one day. The age check redirect and the CSP may differ elsewhere.
- Logged-in checks used the user's own account in the built-in browser. To capture wishlist rows without publishing the account's wishlist, two neutral apps (5072580 and 3664320) were added, captured and removed again with the user's permission; the wishlist count returned to its earlier value.
- React sections that render only when scrolled into a visible viewport (home rows) were not captured.
- S1 ran over a VPN exit IP with synthetic IDs (many invalid), once. Steam may rate-limit residential IPs, other regions or heavier items differently; the 429 behaviour itself was never observed.
- S3, S4 and S6 ran on the user's machine; their results come from the result text the throwaway scripts printed, not from inspecting request headers.

## Sources

- `https://api.steampowered.com/IStoreBrowseService/GetItems/v1` with `input_json` as described per spike (keyless, cookie-less).
- `https://store.steampowered.com/app/<id>/?l=english` for the apps named in S7; `https://store.steampowered.com/login/?l=<language>` for the `<html lang>` table.
- Store pages visited for S5: `/`, `/search/?term=roguelike`, `/tags/en/Roguelike/`, `/category/action/`, `/specials`, `/developer/valve`, `/wishlist/`, `/explore/`, and the search box suggestions.
- Earlier findings: `rq2-data-surface.md` (main-thread verification) and `rq5-extension-constraints.md`.
