# Obvious Steam AI (GothicMess)

Researched 2026-10-21. All counts are snapshots from that day unless a date is given. The extension code could not be read (see section 12). Sections 2, 3, 4 and 6 therefore hold listing claims and metadata inferences only. Asserted means listing copy. Proven means the AMO record derived from the shipped manifest.

Prior note: `docs/research/steam-ai-disclosure/rq4-prior-art.md` section 1.4. Confirmed against the primary pages: Firefox-only listing, version 1.0, license MPL-2.0, access to `store.steampowered.com`, no source repository on the listing, no users, no reviews (source: https://addons.mozilla.org/en-US/firefox/addon/obvious-steam-ai/ and https://addons.mozilla.org/api/v5/addons/addon/obvious-steam-ai/ , both read 2026-10-21). Corrections and additions are marked "correction" or "new" below.

## 1. Identity

- Name "Obvious Steam AI"; AMO add-on ID 2964356; GUID `@obvious-steam-ai`; slug `obvious-steam-ai`; type extension; status public (source: https://addons.mozilla.org/api/v5/addons/addon/obvious-steam-ai/ , raw JSON read in the built-in browser).
- Listing: https://addons.mozilla.org/en-US/firefox/addon/obvious-steam-ai/
- Author: "GothicMess", AMO user ID 19636022, profile https://addons.mozilla.org/en-US/firefox/user/19636022/ . The AMO username is an anonymous hash. The profile says "User since Dec 19, 2025" (the day of the upload) and "Number of add-ons 1" (source: the profile page; the API search `?author=19636022` also returns exactly one add-on, https://addons.mozilla.org/api/v5/addons/search/?author=19636022).
- License: MPL-2.0 (API source above). The versions page says "Source code released under Mozilla Public License 2.0" (https://addons.mozilla.org/en-US/firefox/addon/obvious-steam-ai/versions/).
- Size model: one signed file of 13,653 bytes (13.33 KB on the page) (API source above). For scale, the same API on 2026-10-21 reports 17,606 bytes for AI warning for Steam 1.1.2 and 68,628 bytes for AI Generated Content Filter for Steam 3.4.2 (https://addons.mozilla.org/api/v5/addons/addon/ai-warning-for-steam/ and .../ai-content-filter-for-steam/).
- Category: games-entertainment. Tags: none. Promoted status: none (API source above).
- Listing copy (asserted): the summary says the add-on makes games that disclose AI use obvious "without having to scroll to the bottom of the page" by adding a banner reading "AI sh*t in this game" to the top of the store page (API `summary`). The long description is null. There are no screenshots (`previews` is empty), no homepage, no support email and no support URL (API source above).
- Repository: none found. GitHub repository search for the add-on name returned 0 results (https://api.github.com/search/repositories?q=obvious-steam-ai+OR+%22obvious+steam+ai%22 , 2026-10-21). GitLab project search returned an empty list (https://gitlab.com/api/v4/projects?search=obvious-steam-ai). Codeberg search returned an empty list (https://codeberg.org/api/v1/repos/search?q=obvious-steam-ai).

## 2. Detection and accuracy

- Asserted: the banner appears for "games that disclose AI usage" (API `summary`). The listing does not say what it reads: the store-page heading text, a Steam data field or a list.
- Not retrievable: the matching logic, the language handling, the handling of negated or partial disclosures, and any misses. No review, issue tracker or press item describes a false flag or a miss for this tool, because none exists (see section 8).
- Inference from the declared permissions: the add-on has no `storage` permission and no host access beyond the store (section 5). It can read the open page. Any privileged lookup of other hosts is outside its declared reach. Whether it fetches other store pages is unknown.
- Asserted wording: the banner says "AI sh*t in this game" (listing copy). That wording is an opinion about the game. It states neither "AI use disclosed", nor the scope (pre-generated, live, marketing only), nor the developer's text. Whether the banner shows the disclosure text is unknown.

## 3. Surface coverage

- Proven: the single permission entry is the pattern for every path on `store.steampowered.com` (API source above). The AMO field also lists content-script match patterns (see the cross-check in section 5), so the add-on can run on any store page.
- Asserted: the banner goes to "the top of the Steam store page" (singular, the app page by context) (API `summary`). No search, wishlist, home, tag or event surface is claimed.
- Steam desktop client: nothing says it is supported (unverified; absence of a mention).
- Android: the AMO compatibility field lists Firefox desktop only (minimum 109.0a1, no maximum) and no Android entry. AI warning for Steam lists both (Firefox 109.0a1 and Android 120.0) in the same API on 2026-10-21 (sources: the two API URLs above). This points to no declared Android support for this tool (inference).
- Other browsers: no Chrome, Edge or Safari listing found (section 9).

## 4. UX and user control

- Asserted: one banner at the top of the app page. The listing mentions no settings, no dismissal and no per-game override (https://addons.mozilla.org/en-US/firefox/addon/obvious-steam-ai/).
- Proven: no `storage` permission. The extension API cannot persist a setting or a dismissal across sessions (API `file.permissions`). Page storage from a content script is possible and cannot be ruled out without the code (inference).
- UI languages: the listing is English only and the summary has no localized variants (API `summary` has one `en-US` key). The `default_locale` is `en-US`. Whether the banner text is localized is unknown.
- No options page, popup or toolbar action can be inferred from the listing; the record has no such field (unverified).

## 5. Privacy and permissions

- Proven (AMO record from the manifest): one required permission entry, `*://store.steampowered.com/*`; `host_permissions` empty; optional permissions empty (API `file.*` fields, https://addons.mozilla.org/api/v5/addons/addon/obvious-steam-ai/versions/ , 2026-10-21). The page renders this as "Access your data for store.steampowered.com" (listing page).
- Data collection: the developer declares "none" required and none optional (API `data_collection_permissions: ["none"]`; the page says "The developer says this extension doesn't require data collection").
- No privacy policy and no EULA (`has_privacy_policy` false, `has_eula` false).
- Cross-check of how AMO lists permissions: for AI warning for Steam (Manifest V3, `storage` plus two content-script matches, no `host_permissions`, per the prior note) the AMO file record lists `storage` and the two match patterns; for AI Generated Content Filter for Steam it lists `storage` and the all-store pattern (API sources in section 1, 2026-10-21). AMO therefore folds content-script matches into this list. For Obvious Steam AI the single entry is most likely one content-script match, and the missing `storage` entry points to an add-on that uses no storage API (inference).
- Outbound requests: unknown without the code. The declared permissions give no access to `api.steampowered.com` or any non-store host through the extension API.
- Remote code, minification, `eval`: not checkable.

## 6. Efficiency

- Proven: package size 13,653 bytes (section 1).
- Not retrievable: requests per page, caching, observers, scan timing. No `storage` permission means no extension-level cache (inference). Without the code, whether it issues any request at all is unknown.

## 7. Maintenance and responsiveness

- One version only: 1.0, created 2025-12-19 16:57 UTC, reviewed 2025-12-22 17:00 UTC (about 3 days from upload to public listing), release notes null (API source above; the versions API returns count 1, channel listed, https://addons.mozilla.org/api/v5/addons/addon/obvious-steam-ai/versions/).
- Correction: the listing page says "Last updated ... (Dec 19, 2025)" while the API `last_updated` is 2025-12-22, the review date. The first date is the upload date.
- No update in the 10 months to 2026-10-21. Per the prior note, Steam heading text caused three events for AI warning for Steam in that window: Russian broke 2026-02, Malay was added 2026-06, French broke 2026-09 (not re-verified here). Whether this tool still works in those languages is unknown; the listing gives no language scope.
- Author's other add-ons: none. The AMO profile counts 1 add-on and the author search returns 1 result (section 1). No issue channel: no repository, no support URL, no email (API source above).

## 8. Reach and trust

- Users: AMO shows "No Users"; the API `average_daily_users` is 0 and `weekly_downloads` is 0 (2026-10-21; the listing, the profile page and the API read one AMO backend, so this is one source). Ten months after the listing, daily users stand at zero. For scale, AI warning for Steam shows 5,551 daily users in the same API on 2026-10-21 (https://addons.mozilla.org/api/v5/addons/addon/ai-warning-for-steam/).
- Ratings and reviews: count 0, text reviews 0, average 0.0 (API source above; the ratings API returns count 0, https://addons.mozilla.org/api/v5/ratings/rating/?addon=obvious-steam-ai ; the listing shows "No reviews yet"). There is no review text to quote.
- Press and community mentions: none found. Searches 2026-10-21: six web searches on the add-on name, the slug, the author name and the banner phrase returned only the AMO listing as a direct hit; Hacker News (Algolia) returned 0 hits for the exact name (https://hn.algolia.com/api/v1/search?query=%22obvious%20steam%20ai%22); two GamingOnLinux threads on Steam AI plugins (2025-12 and 2026-01) had no mention of it (checked through a summarizer: https://www.gamingonlinux.com/2025/12/theres-now-an-ai-warning-notice-browser-plugin-for-itch-io-as-well-as-steam/ and https://www.gamingonlinux.com/2026/01/augmented-steam-browser-plugin-added-ai-features-from-vaporlens/ ; unverified in full). Reddit could not be searched (section 12).
- Trust signals present: signed by AMO, public review passed, data-collection declaration, OSS license label. Trust signals absent: author identity, source link, privacy policy, description, screenshots, any user or review.

## 9. Packaging and distribution

- Stores: Firefox Add-ons only. Edge Add-ons search for "obvious steam ai" returned 10 unrelated results, none this tool (https://microsoftedge.microsoft.com/addons/search/obvious%20steam%20ai , 2026-10-21, cookie banner rejected; search relevance caveat). Chrome Web Store: the built-in browser refuses the site; a web search found no Chrome listing (unverified). GreasyFork, OpenUserJS: a web search found nothing (unverified).
- Update path: AMO automatic updates; one version to date (section 7).
- Source availability: the license field says MPL-2.0 and the versions page repeats it, with no repository or source link on the listing. The code is public only inside the signed package (not read, section 12).
- Manifest version: not read. The Firefox minimum of 109.0a1 equals the value on AI warning for Steam, a known Manifest V3 add-on; AI Generated Content Filter for Steam, also Manifest V3, declares 128.0 itself. The value is consistent with Manifest V3 but does not settle it (inference).

## 10. Coverage and Restraint evidence

Supports Coverage:

- Content-script reach covers the whole store host, beyond app pages (section 3, inferred from the AMO permission list).
- Banner at the top of the page addresses the known problem that the disclosure sits at the bottom of the app page (listing copy).
- Against: only one surface is claimed, no language scope, no Android entry, no sign of search, wishlist or home coverage, and 0 users (sections 3 and 8).

Supports Restraint:

- One host permission, no `storage`, no `host_permissions`, no optional permissions, data collection "none" (section 5).
- Package size 13,653 bytes, the smallest of the three Firefox listings checked on 2026-10-21 (section 1).
- Against: the banner copy "AI sh*t in this game" judges the game and makes no neutral statement that the developer disclosed AI use. No scope split and no verbatim developer text is claimed. The user has no control: no `storage`, hence no setting or dismissal through the extension API.

## 11. Lessons for our design

- Match the placement idea: a banner at the top of the app page that reveals what the page buries at the bottom. Add what this tool cannot have: dismissal and per-surface settings stored in `storage`. Our permission set needs `storage`; this tool shows the floor without it.
- Avoid the verdict wording. "AI sh*t" contradicts our rule that the label states a disclosure and claims nothing about use or quality. Keep the neutral wording and show the developer's text verbatim.
- Avoid the empty listing. No description, no screenshots, no source link, no privacy text, no support channel, 0 users after 10 months. Our listings need all of these, and a source link is the cheapest trust signal.
- Plan for review lead time: first public listing took about 3 days on AMO (2025-12-19 to 2025-12-22). A heading fix for a new Steam language needs that lead time on the store build.
- Avoid a single-version, no-update posture. The same ten months brought three heading-language events for the leading tool (two breakages, one new language, per the prior note). A localized heading table plus an update path is the minimum for anything shipped to store audiences.

## 12. Not retrievable

- Extension code (manifest, content script, any CSS): not read. AMO's in-browser source viewer is the Code Manager at code.addons.mozilla.org; the built-in browser refused that host on two tries (navigate and preview_start) and the web fetch tool failed with a DNS error for the host (2026-10-21). The older viewer path `files/browse/4646932` redirects to a reviewers host and returns "Not Found". The reviewer API endpoints return "Not found" without a login. The version history page has no "view source" link. The only remaining route is the XPI download (https://addons.mozilla.org/firefox/downloads/file/4646932/obvious_steam_ai-1.0.xpi), which the brief forbids. I did not use it or any tool that fetches it.
- Behavior on live pages: not tested (no install allowed). Banner look, wording on screen, placement, whether it reads the heading in other languages: unknown.
- Chrome Web Store: the built-in browser refuses the site; Chrome presence was checked only through web search (nothing found).
- Reddit: refused by the built-in browser and blocked in the web search tool; no community discussion could be checked there.
- Wayback Machine availability API: returned 429 (https://archive.org/wayback/available). No earlier listing snapshot (for a user-count trend) was retrieved.
- The first read of the AMO record went through a summarizing fetch tool and shortened the summary text; every fact in this note comes from the raw JSON or page text read in the built-in browser.

## Sources

- https://addons.mozilla.org/api/v5/addons/addon/obvious-steam-ai/ and .../versions/ : record, permissions, dates, size, ADU.
- https://addons.mozilla.org/en-US/firefox/addon/obvious-steam-ai/ and .../versions/ : listing page, "No Users", license text, version history.
- https://addons.mozilla.org/en-US/firefox/user/19636022/ and https://addons.mozilla.org/api/v5/addons/search/?author=19636022 : author record.
- https://addons.mozilla.org/api/v5/ratings/rating/?addon=obvious-steam-ai : 0 reviews.
- https://addons.mozilla.org/api/v5/addons/addon/ai-warning-for-steam/ and .../ai-content-filter-for-steam/ : AMO permission-list behavior, sizes, compatibility for comparison.
- https://api.github.com/search/repositories , https://gitlab.com/api/v4/projects?search=obvious-steam-ai , https://codeberg.org/api/v1/repos/search?q=obvious-steam-ai : repository search.
- https://microsoftedge.microsoft.com/addons/search/obvious%20steam%20ai : Edge search.
- https://hn.algolia.com/api/v1/search : Hacker News search.
