# Test fixtures

Captured from the live store on 2026-10-20 from a European location (prices in EUR). GetItems and app page captures were cookie-less (`credentials: "omit"`). Surface captures came from the live DOM; `wishlist/` and `search-suggestions/` needed a signed-in session, and no capture contains account data. Spike notes: `docs/research/steam-ai-disclosure/rq6-verification-spikes.md`. The tag kind fixtures (`getitems/kinds.json` and the four pages named in the app-page table) were captured the same way on 2026-10-24.

These files are data, not code we own: formatters and the line width rule skip `tests/fixtures/**`.

## Sanitizing

Every file was reduced before it was saved:

- Removed: `script`, `style`, `link`, `noscript`, `iframe`, `svg`, `template`, `video`, `object` and `embed` elements, comments, `on*` handler attributes, `srcset`, `data-props` (React mount payloads), `data-panel`, every `data-ds-*` attribute except `data-ds-appid`, `data-ds-packageid`, `data-ds-bundleid` and `data-ds-itemkey`, `#application_config`, session ID inputs, and anything matching `[class*="avatar"]` or `[data-miniprofile]`. No account names, avatars or Steam IDs remain (the captures were logged out).
- Trimmed: page chrome (global header, menus, footer, modals), media carousels, reviews, related items, language tables and the long tail of the "About this game" text. The app page structure around `#appHubAppName` and `.game_description_column` is kept as served.
- Whitespace: whitespace-only text nodes became a single newline, and runs of spaces and tabs in other text collapsed to one space, except inside `#game_area_content_descriptors`, which keeps the server's exact whitespace (the developer text starts with a newline and tabs).
- Encoding: every file is ASCII. JSON uses `\uXXXX` escapes; HTML uses numeric character references (`&#8217;`, `&#9;` for a tab). Both parse to the same strings as the original.
- GetItems JSON keeps every field Steam returned except the bulky ones listed per file below. Each fixture was checked byte for byte against a SHA-256 of the captured object.

## getitems/

Request shape: `GET https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=...` with `data_request.include_extra_details: true`, keyless. Responses were 200 with `x-eresult: 1`.

| File | Request | Notes |
|---|---|---|
| `mixed-states.json` | 5072580, 1808500, 1938090, 413150, 339800, 99999999, 50300; `english`, `US` | Disclosed with `ai_generation_service` (5072580); disclosed without it (1808500, 1938090); not disclosed (413150); adult-only, `success: 1` with mature notes in `content_survey_notes` only (339800); invalid ID, `success: 15`, `appid: 0`, no `extra_details` (99999999); delisted, `unlisted: true` (50300). Removed: `related_items`, `best_purchase_option`, and the `extra_details` keys `system_requirements`, `early_access`, `partner_awards_bbcode`, `links_and_info`, `press_review`, `legal_notice_bbcode`, `eula`, `section`. |
| `german-context.json` | 1938090, 5072580; `german`, `DE` | 1938090 returns German notes; 5072580 (no translation) returns the English text. Same removals as above. |
| `search-roguelike-50.json` | The 50 rows of `/search/?term=roguelike`; `english`, `US` | 10 disclosed. Response order equals request order. Trimmed to the item keys `item_type`, `id`, `success`, `visible`, `name`, `appid`, `type`, `is_free`, `is_early_access`, `is_coming_soon`, `content_descriptorids`, `unlisted` and the `extra_details` keys `vetted`, `ai_generation_service`, `content_survey_ai_notes`. Notes include `\r\n` line breaks, trailing spaces and zero-width spaces (U+200B), kept verbatim. |
| `kinds.json` | 3751950, 2807960, 1808500, 813230, 730, 570, 105600, 1245620, 1172470, 271590, package 320795, bundle 1, 99999999; `english`, `US` | One batch for the tag kinds (captured 2026-10-24). DRM, account and EULA (3751950); kernel anti-cheat with boot protection, no vendor name, account and EULA (2807960); kernel anti-cheat named Denuvo, EULA and AI notes (1808500); no declaration of any kind (813230); non-kernel VAC anti-cheat (730, 570); PvP categories 49 and 36 (105600, 1245620, 1172470); kernel anti-cheat named Easy Anti-Cheat, account and EULA (1172470); delisted, kernel anti-cheat named BattlEye (271590); a package, which has `categories` and no `extra_details` (320795); a bundle and an ID that does not exist, `success: 15` with neither (1, 99999999). No item has `drm_activation_limit`. Removed: `related_items`, `best_purchase_option`, and the `extra_details` keys `system_requirements`, `early_access`, `partner_awards_bbcode`, `links_and_info`, `press_review`, `legal_notice_bbcode`, `section`; the `eula` links stay. |
| `empty-response.json` | `ids: []`, or a request without `context` | Steam answers 200 with this body; without `context` the `x-eresult` header is `8` (invalid parameter). |

## app-page/

Fetched as `fetch("/app/<id>/?l=english", {credentials: "omit"})` from a store page. The final URL is what `Response.url` reported; tests pass it to the parser.

| File | Final URL | Notes |
|---|---|---|
| `5072580-ai-first.html` | `https://store.steampowered.com/app/5072580/?l=english` | AI block, then the mature block; both use `id="game_area_content_descriptors"`. Also shows the `.DRM_notice` for the AI service. |
| `1808500-ai-only.html` | `https://store.steampowered.com/app/1808500/?l=english` | AI block only. Includes DLC rows with `data-ds-appid` (other apps on an app page). |
| `3751950-drm-account-eula.html` | `https://store.steampowered.com/app/3751950/?l=english` | The features list holds a `.DRM_notice` with the DRM name, a `<br>` and the activation limit, the account notice and the EULA notice (`role="button"`). Language table, purchase area and DLC list removed. Captured 2026-10-24. |
| `2807960-kernel-boot-protection.html` | `https://store.steampowered.com/app/2807960/?l=english` | `.anticheat_section.DRM_notice` with two `.anticheat_name` lines: the custom name `GetItems` omits, then the boot protection line. Also the account notice and two EULA notices. Same removals. Captured 2026-10-24. |
| `730-anticheat-nonkernel.html` | `https://store.steampowered.com/app/730/?l=english` | `.anticheat_section.anticheat_nonkernel_notice` with the VAC name and no `.DRM_notice`. Same removals. Captured 2026-10-24. |
| `1172470-kernel-easyac.html` | `https://store.steampowered.com/app/1172470/?l=english` | Kernel anti-cheat named Easy Anti-Cheat with the manual removal note in `.anticheat_uninstalls`, between the account and EULA notices. Same removals. Captured 2026-10-24. |
| `413150-no-block.html` | `https://store.steampowered.com/app/413150/?l=english` | No `#game_area_content_descriptors`. Right column, DLC and legal blocks removed. |
| `4618750-ai-line-breaks.html` | `https://store.steampowered.com/app/4618750/?l=english` | AI block only; the notes hold two `<br>` tags, each followed by a newline (GetItems has `\r\n\r\n` there). Includes the Early Access header. Right column, purchase area and system requirements removed. |
| `1808500-live-dom.html` | `https://store.steampowered.com/app/1808500/ARC_Raiders/` | The live document after Steam's scripts ran: the block is wrapped in `.game_page_autocollapse_ctn` with a "READ MORE" fade. Unrelated sections removed. |
| `339800-login-redirect.html` | `https://store.steampowered.com/login/?redir=https%3A%2F%2Fstore.steampowered.com%2Fagecheck%2Fapp%2F339800%2F%3Fl%3Denglish` | Adult-only app, cookie-less: redirected to sign-in. Body reduced to the top-level containers. |
| `99999999-home-redirect.html` | `https://store.steampowered.com/` | Invalid ID: redirected to the home page (about 960 KB raw). Body reduced to the top-level containers. |
| `synthetic-mature-first.html` | `https://store.steampowered.com/app/5072580/?l=english` | **Synthetic.** `5072580-ai-first.html` with the two blocks swapped. Four sampled apps with both blocks (5072580, 1938090, 4431800, 4461450) all served the AI block first. |
| `synthetic-heading-in-description.html` | `https://store.steampowered.com/app/413150/?l=english` | **Synthetic.** `413150-no-block.html` with the heading text added inside `#game_area_description`; must not count as a disclosure. |
| `synthetic-agecheck.html` | `https://store.steampowered.com/agecheck/app/1938090/` | **Synthetic.** The login skeleton retitled. From the capture location, no app redirected to `/agecheck/` cookie-less (1938090, 271590, 1174180, 782330, 1091500, 1245620 and 2050650 all served the full page), so the redirect could not be captured. |

## surfaces/

Capsule containers cut out of the live, script-rendered DOM, wrapped in a minimal document with the page's `lang` and `body` class.

| File | Page | Notes |
|---|---|---|
| `search/rows.html` | `/search/?term=roguelike` | First 8 `a.search_result_row` of `#search_resultsRows`; infinite scroll appends more rows to the same container. Row 7 (4461450) is disclosed in `getitems/search-roguelike-50.json`. |
| `home/capsules.html` | `/` | Main carousel `a.store_main_capsule` (image is a CSS background, no `img`), discount `a.sale_capsule`, and a "Specials" tab with `a.tab_row_item`, including a package row whose `data-ds-appid` is a comma list next to `data-ds-packageid`. |
| `tag-hub/capsules.html` | `/tags/en/Roguelike/` | React `sale-display` page (the category hub and `/specials` use the same template). Two grid sections with three `div.Panel` capsules, and one large `LibraryAssetExpandedDisplay` carousel capsule whose image link and title block are siblings, with a second link to the same app (`#app_reviews_hash`). Only `/app/<id>` links, no `data-ds-appid`. The carousel capsule keeps two of its images. |
| `developer/widgets.html` | `/developer/valve` | React creator home: two `StoreSaleWidgetOuterContainer` widgets, each with an image link, a title link and a review link to the same app. Short descriptions replaced by `[trimmed]`. |
| `wishlist/rows.html` | `/wishlist/id/<vanity>/` (logged in) | Two rows of the virtualized React list, each kept with its full ancestor chain up to the scroll container. **Captured specially:** to avoid publishing the account's wishlist, 5072580 and 3664320 were added to it, captured and removed again. The rank inputs were reset to 1 and 2 (they showed the account's list length) and the drag-and-drop context IDs to 0. |
| `search-suggestions/popup.html` | Search box on `/explore/` (logged in), query `roguelike` | The suggestions popup from inside the header's React root: three app results with images and three tag links. The country code in the tag image URLs is redacted to `cc=XX`. |
| `next-fest/feed.html` | `/sale/nextfest` (logged out), captured 2026-10-21 | The first three cards of the random Next Fest feed, each a `LibraryAssetExpandedDisplay` in its own `SaleSectionContainer`. The hero capsule sits in a `HeroCapsuleImageContainer` inside the app link, and a second copy of it sits in the hover panel. Each card also holds a trailer still and three screenshots. Short descriptions read `[trimmed]` and each tag list keeps two tags. 5053640 and 4631870 disclosed AI use on the capture day, 4783070 did not. |
