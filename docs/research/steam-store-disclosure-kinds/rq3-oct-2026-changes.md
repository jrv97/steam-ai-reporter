# RQ3: What changed around 2026-10-22?

Researched 2026-10-24. Every web fetch went through a small summarising model, so "verified from source" means "fetched and read through the summariser", not a byte-level check. Tags used below: `verified from source`, `search-summary` (seen only in a search result summary, or a page that failed to fetch), `unverified`. Live API calls were made on 2026-10-24 from the research tooling (location unknown, probably the US), not from the project's European capture setup.

## Answer in short

- The belief is confirmed, with one correction. Valve announced on 2026-10-02 (21:19 UTC) that it would disable the store-domain reviews endpoint `store.steampowered.com/appreviews/<appid>?json=1` on October 22, and it did: on 2026-10-24 that URL returns the store home page, and the replacement `api.steampowered.com/IUserReviewsService/GetAppReviews/v1/` answers keyless. It is a removal and move of one endpoint, announced 20 days ahead, and not a push of changes to the store APIs.
- Nothing was found that changes GetItems, appdetails or the app page for the four disclosure kinds (anticheat, eula, drm_third_party_type, user_account_third_party) around 2026-10-22. No Steamworks announcement in the window mentions them, and in `webui/common.proto` their field numbers, names and scalar types are identical at every October checkpoint read.
- One real drift: live GetItems now adds `extra_details.has_community_hub` (bool), absent from every fixture captured on 2026-10-20. The protobuf tracker first shows it (field 33 of `StoreItem_ExtraDetails`) in a commit dated 2026-10-21 00:15 UTC.
- Two quieter protobuf edits landed earlier in October and are not wire changes: the types of fields 9, 10 and 11 were renamed from `StoreItem_*` to `StoreItem_ExtraDetails_*` (between 2026-10-02 and 2026-10-05), and fields 28 to 32 were added (between 2026-10-08 and 2026-10-14).
- Fixture values for anticheat and user-account fields on 1808500 and 1938090 match live responses; the app-page notice wording for 1808500 matches its fixture. Markup (class names) of live pages could not be compared with the tooling used.

## Findings

### 1. What Valve announced and shipped for the reviews API (2026-10-02 to 2026-10-24)

The announcement. The Steamworks Development group feed lists "Changes to Steam User Reviews API", published Fri 2026-10-02 21:19:11 +0000 (verified from source: https://steamcommunity.com/groups/steamworks/rss/). Per the feed body, the bulk user reviews endpoint moves off the store domain for reliability and a higher call-frequency limit; developers must update their bookmarks and tools by October 22 to avoid disruption; on that day `store.steampowered.com/appreviews/<appid>?json=1` is disabled; the replacement is the WebAPI `IUserReviewsService` method `GetAppReviews`; and the post says requests must include the WebAPI key associated with the game (verified from source: https://steamcommunity.com/groups/steamworks/rss/). The announcement's own detail page returned only the title and site navigation to the summariser, so the body text above comes from the feed, not the detail page (verified from source: https://steamcommunity.com/groups/steamworks/announcements/detail/676258795703241581). A news article dated 2026-10-05 gives the same announcement date and the October 22 shutdown (verified from source: https://mixed-news.com/en/steam-user-reviews-api-october-22-replacement-no-key/). A gamedev.net repost of the notice exists but returned HTTP 403 on fetch (search-summary: https://gamedev.net/news/6178/).

The docs. The Steamworks page for the old method now carries the notice that the endpoint is deprecated and to use `IUserReviewsService#GetAppReviews`; it gives no removal date (verified from source: https://partner.steamgames.com/doc/store/getreviews). The new service page documents `GET https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/` with parameters in `input_json`, the key as optional ("does not require a key"), anonymous responses cacheable for up to 10 minutes, and HTTP 429 on rate limiting (verified from source: https://partner.steamgames.com/doc/webapi/IUserReviewsService). The docs list these differences from `/appreviews`: string filter values become enums, `language` becomes `languages` (list), the response has no `success` field, `author.num_games_owned` is gone, `weighted_vote_score` is a number instead of a string, each review gains `refunded`, hardware strings are no longer profanity-filtered, and `total_matching` and `day_range_used` are new (verified from source: https://partner.steamgames.com/doc/webapi/IUserReviewsService).

The key conflict. The announcement says the key must be passed; the docs say it is optional (verified from source: https://steamcommunity.com/groups/steamworks/rss/ versus https://partner.steamgames.com/doc/webapi/IUserReviewsService). A keyless call to the new endpoint for app 413150 on 2026-10-24 returned JSON, so the docs match behaviour at least for anonymous reads (verified from source: https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/?input_json=%7B%22appid%22%3A413150%2C%22num_per_page%22%3A1%7D). One search summary says a PR needed its own key sent as an `x-webapi-key` header; this is unattributed and conflicts with the keyless result: unverified.

Live behaviour on and after the cutoff.

- A GET to `https://store.steampowered.com/appreviews/413150?json=1&num_per_page=1` on 2026-10-24 returned an HTML page opening with "Welcome to Steam", not JSON (verified from source: https://store.steampowered.com/appreviews/413150?json=1&num_per_page=1).
- A downstream repository reports the same: from 22 October 2026 the old URL answered HTTP 200 with the store home page, and its first scan on 23 October (UTC) failed with a JSON parse error on a `<!DOCTYPE` body (verified from source: https://github.com/Statusnone420/Crimson-Desert-Report-Hub/pull/50). The Content-Type of that response was not stated.
- The new endpoint on 2026-10-24 returned `response` keys `query_summary`, `reviews`, `cursor`, `day_range_used`, `total_matching`; `query_summary` keys `num_reviews`, `review_score`, `review_score_desc`, `total_positive`, `total_negative`, `total_reviews`; and review keys `recommendationid`, `author`, `language`, `review`, `timestamp_created`, `timestamp_updated`, `voted_up`, `votes_up`, `votes_funny`, `weighted_vote_score`, `comment_count`, `steam_purchase`, `received_for_free`, `written_during_early_access`, `primarily_steam_deck`, `refunded` (verified from source: https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/?input_json=%7B%22appid%22%3A413150%2C%22num_per_page%22%3A1%7D).
- A search summary of a third-party migration PR says some test apps returned HTTP 200 with empty bodies and `x-eresult=42` after the cutoff (search-summary: https://github.com/draknorr/piq/pull/135, seen only as a search result).
- An open-source tool opened a migration issue on 2026-10-12 citing the October 22 date; it does not mention appdetails or any other store endpoint changing (verified from source: https://github.com/TMHSDigital/steam-mcp/issues/23).

### 2. Other Valve announcements and news in the window

The Steamworks Development feed lists these items for 2026-07-24 to 2026-10-23, newest first (verified from source: https://steamcommunity.com/groups/steamworks/rss/):

- 2026-10-23, "Steam's Personal Calendar Full Release": the Personal Calendar leaves Steam Labs and becomes a store feature with the Steam update of 23 October.
- 2026-10-15, "Updated Achievement System": a rebuilt achievement editor in Steamworks.
- 2026-10-08, "Pricing Conversion Updates": refreshed data behind the regional pricing tools.
- 2026-10-02, "Changes to Steam User Reviews API": section 1.
- 2026-10-01, "Steam Deck Framerate data": a partner dashboard chart, expanded on 2026-10-21.
- 2026-09-29, "Upcoming Changes to the Discounts & Events Section on Steam": curated placements replaced by dynamic recommendations, curated calendar to stop in early 2027.
- 2026-09-02, "Improvements to the Financial Reporting Site", and 2026-07-24, "Steamworks SDK 1.65 has been released".

None of these concerns GetItems, appdetails, app-page markup or the anti-cheat, EULA, DRM or third-party account fields (verified from source: https://steamcommunity.com/groups/steamworks/rss/). The summariser read the item bodies from the feed; the feed returned ten items, so older items are not shown.

Other places searched, with outcomes:

- Hacker News: one Algolia story query ("steam reviews api") returned nine unrelated or old stories and nothing about the endpoint change (verified from source: https://hn.algolia.com/api/v1/search_by_date?query=steam%20reviews%20api&tags=story). A single query is weak evidence.
- SteamDB blog: the page returned HTTP 403 (https://steamdb.info/blog/). A web search for "SteamDB blog October 2026" surfaced no post about store APIs; it returned news about a concurrent-user record and the Nexus Mods acquisition of SteamDB (search-summary: https://tech-insider.org/steam-43-million-concurrent-users-record-2026/).
- Not checked: Valve developer forums (partner forums sit behind sign-in), the Steam news hub, SteamDB changelist pages, and any Steamworks API changelog page (none was located). The dated Steamworks documentation notices that exist are the two in section 1.

### 3. Protobuf history: StoreItem_ExtraDetails before and after 2026-10-22

Where the message lives. `StoreItem_ExtraDetails` is defined in `webui/common.proto`, not in `webui/service_storebrowse.proto` (verified from source: https://raw.githubusercontent.com/SteamDatabase/Protobufs/master/webui/common.proto, characters 200000 onward; the other file holds only `CStoreBrowse_*` request and response messages: https://raw.githubusercontent.com/SteamDatabase/Protobufs/master/webui/service_storebrowse.proto). The GitHub API reports commit URLs under `SteamTracking/Protobufs` while the raw URLs under `SteamDatabase/Protobufs` still resolve; why is not established (verified from source: https://api.github.com/repos/SteamDatabase/Protobufs/commits?path=webui/common.proto&since=2026-09-01T00:00:00Z&per_page=100).

The four kinds, current definition (master, after the last commit of 2026-10-23 05:30 UTC):

- `drm_third_party_type`: field 5, string. `drm_activation_limit`: field 6, string.
- `user_account_third_party`: field 7, string. `user_account_third_party_link_to_steam`: field 8, bool.
- `anticheat`: field 9, message `StoreItem_ExtraDetails_Anticheat` with `kernel_mode` (1, bool), `uninstall_completely` (2, bool), `boot_protection` (3, bool), `boot_protection_name` (4, string), `name` (5, string), `name_loc` (6, string).
- `eula`: field 10, repeated message `StoreItem_ExtraDetails_Eula` with `name` (1, string) and `url` (2, string).

All of this is from https://raw.githubusercontent.com/SteamDatabase/Protobufs/master/webui/common.proto (verified from source). Related fields from the same file: `content_survey_notes` 16, `content_survey_ai_notes` 17, `ai_generation_service` 11. No message named for DRM or user accounts exists; those are plain fields of `StoreItem_ExtraDetails` (same source).

Checkpoints. I read the `StoreItem_ExtraDetails` field table at these commits of `webui/common.proto`; fields 1 to 27 (including 5 to 10) have the same numbers and names, and the same scalar types, at all of them:

- bb294c34, committed 2026-10-02 02:39 UTC (verified from source: https://raw.githubusercontent.com/SteamDatabase/Protobufs/bb294c34f5f4704b10da5a8ed51e898a8cbbf31c/webui/common.proto).
- 78c82519, 2026-10-05 22:17 UTC (verified from source: https://raw.githubusercontent.com/SteamDatabase/Protobufs/78c82519b58d748a4f99dac78cf624fc5cea6282/webui/common.proto).
- 5805db06, 2026-10-08 01:31 UTC (verified from source: https://raw.githubusercontent.com/SteamDatabase/Protobufs/5805db068b7d348eda0ffd322c598fe69957c206/webui/common.proto).
- 184badc2, 2026-10-14 00:46 UTC (verified from source: https://raw.githubusercontent.com/SteamDatabase/Protobufs/184badc242dae6153ce875eeb8217c14b1ce3f3c/webui/common.proto).
- 89b77382, 2026-10-17 03:29 UTC (verified from source: https://raw.githubusercontent.com/SteamDatabase/Protobufs/89b77382edac5f747bfc196c2edf8996a7fe92bc/webui/common.proto).
- 94546e80, 2026-10-21 00:15 UTC (verified from source: https://raw.githubusercontent.com/SteamDatabase/Protobufs/94546e8057dc80a155d4c52f05f6b230a97919e4/webui/common.proto).
- master as read on 2026-10-24 (source in the previous paragraph). The tables are summariser output, not diffs.

What did change, in order:

1. Between bb294c34 (2026-10-02) and 78c82519 (2026-10-05): the types of fields 9, 10 and 11 changed from `StoreItem_Anticheat`, `StoreItem_Eula` and `StoreItem_AIGeneratedContentService` to `StoreItem_ExtraDetails_Anticheat`, `StoreItem_ExtraDetails_Eula` and `StoreItem_ExtraDetails_AIGeneratedContentService`; the member fields of each type are the same (verified from source: the bb294c34 and 78c82519 raw files above). The common.proto commits in that window are bd8f82df (2026-10-04, a descriptor.proto reorganisation) and 78c82519; I did not read which one made the edit (verified from source for the commit list: https://api.github.com/repos/SteamDatabase/Protobufs/commits?path=webui/common.proto&since=2026-09-01T00:00:00Z&per_page=100). Message type names are not part of the JSON response (unverified general protobuf-JSON knowledge).
2. Between 5805db06 (2026-10-08) and 184badc2 (2026-10-14): fields 28 `system_requirements`, 29 `running_time_minutes`, 30 `episode`, 31 `seasons` and 32 `video_extras_note` appear (verified from source: the 5805db06 and 184badc2 raw files above). The commits in that window are 42cc5a96, 2d1c5e5f and 184badc2; not narrowed further.
3. In 94546e80, dated 2026-10-21 00:15:53 UTC: `optional bool has_community_hub = 33;` is added to `StoreItem_ExtraDetails`; the same commit adds `CMsgKeyValuePair` and `CMsgKeyValueSet` to common.proto, `is_public` to a cloud upload request, and `include_all_free_games` to `CPlayer_GetOwnedGames_Request`, and no line touches anticheat, eula, drm, user account or content survey fields (verified from source: https://github.com/SteamDatabase/Protobufs/commit/94546e8057dc80a155d4c52f05f6b230a97919e4.patch). The 89b77382 table lacks field 33 and the 94546e80 table has it, and 94546e80 is the only common.proto commit between them (verified from source: the two raw files and the commit list above).
4. The commit of 2026-10-22 00:23:01 UTC (5c2b73b2) changes only remote play and streaming messages in webui/common.proto (adds `CSetSupportedColorspacesMsg` and a few streaming fields, removes `CInputLatencyTestMsg`) (verified from source: https://github.com/SteamDatabase/Protobufs/commit/5c2b73b2.patch). The next commit, 6c35e1ad of 2026-10-23 05:30 UTC, lists only audio protos (verified from source for the file list: https://api.github.com/repos/SteamDatabase/Protobufs/commits?since=2026-10-01T00:00:00Z&per_page=100).

Request side. `StoreBrowseItemDataRequest` has `include_extra_details` as field 18 on master, next to `include_best_purchase_option` (19) and `include_optin_registration_tags` (20) (verified from source: https://raw.githubusercontent.com/SteamDatabase/Protobufs/master/webui/common.proto, characters 150000 onward). I did not diff that message across October. `webui/service_storebrowse.proto` has one commit since 2026-08-01, dated 2026-09-08 (f740c7db), and none in October (verified from source: https://api.github.com/repos/SteamDatabase/Protobufs/commits?path=webui/service_storebrowse.proto&since=2026-08-01T00:00:00Z).

Related store protos. `webui/service_storequery.proto` changed on 2026-10-08 (e621d3f0: new `compatibility_filter` field 18 on `CStoreQueryFilters` and a nested `CStoreQueryFilters_CompatibilityFilter` with `device` and `categories`) and on 2026-10-16 (6a6f9a36: `use_name_match_scoring` field 11 on `CStoreQuery_SearchSuggestions_Request`); neither touches the four kinds (verified from source: https://github.com/SteamDatabase/Protobufs/commit/e621d3f0946c0033dea4a357b53af95724cb74b3.patch and https://github.com/SteamDatabase/Protobufs/commit/6a6f9a368079d9069a656e4f3786e8c6e9b14ded.patch). The same path also appears in the larger commits 78c82519, 184badc2 and 89b77382, whose diffs I did not read (verified from source for the listing: https://api.github.com/repos/SteamDatabase/Protobufs/commits?path=webui/service_storequery.proto&since=2026-09-01T00:00:00Z). A guessed path `webui/service_userreviews.proto` has no commits since 2026-08-01 and may not exist under that name, so the reviews service was not traced in the protobufs (verified from source: https://api.github.com/repos/SteamDatabase/Protobufs/commits?path=webui/service_userreviews.proto&since=2026-08-01T00:00:00Z).

Timing caveat. A protobuf commit date is when the tracker saw a new Steam web build, not when the server began to emit a field. The commit of 2026-10-21 and the fixture capture of 2026-10-20 bracket the first sighting of `has_community_hub`, but the server could have started earlier or later (unverified inference).

### 4. Live GetItems against the captured fixtures

Fixtures. `tests/fixtures/getitems/*.json` were captured on 2026-10-20 from a European location with `include_extra_details: true`, keyless, cookie-less; `scripts/capture_fixtures.py` strips `related_items` and `best_purchase_option` from each item and `system_requirements`, `early_access`, `partner_awards_bbcode`, `links_and_info`, `press_review`, `legal_notice_bbcode`, `eula` and `section` from `extra_details` (read from the repo: `tests/fixtures/README.md` and `scripts/capture_fixtures.py`). Because `eula` is stripped, the fixtures hold no EULA baseline. They also hold no `drm_third_party_type` or `drm_activation_limit` value.

Method. I re-issued the capture request for the seven `mixed-states.json` IDs (5072580, 1808500, 1938090, 413150, 339800, 99999999, 50300; `english`, `US`) on 2026-10-24 and compared key lists and values (verified from source: https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=%7B%22ids%22%3A%5B%7B%22appid%22%3A5072580%7D%2C%7B%22appid%22%3A1808500%7D%2C%7B%22appid%22%3A1938090%7D%2C%7B%22appid%22%3A413150%7D%2C%7B%22appid%22%3A339800%7D%2C%7B%22appid%22%3A99999999%7D%2C%7B%22appid%22%3A50300%7D%5D%2C%22context%22%3A%7B%22language%22%3A%22english%22%2C%22country_code%22%3A%22US%22%7D%2C%22data_request%22%3A%7B%22include_extra_details%22%3Atrue%7D%7D). The summariser returned key lists, not byte-identical bodies, so the comparison is on keys and the values listed below.

Result, net of the keys the capture script strips:

- Top-level item keys are unchanged for all seven IDs. 99999999 still returns `success: 15`, `visible: false`, an empty name and `store_url_path: "app/0/"` with no `extra_details`; 50300 still returns `unlisted: true`.
- Added: `extra_details.has_community_hub` appears on every item that has `extra_details`. Raw dumps show `"has_community_hub":true` for 413150 and 339800 (verified from source: https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=%7B%22ids%22%3A%5B%7B%22appid%22%3A413150%7D%2C%7B%22appid%22%3A339800%7D%5D%2C%22context%22%3A%7B%22language%22%3A%22english%22%2C%22country_code%22%3A%22US%22%7D%2C%22data_request%22%3A%7B%22include_extra_details%22%3Atrue%7D%7D) and for 3159330 (verified from source: https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=%7B%22ids%22%3A%5B%7B%22appid%22%3A3159330%7D%5D%2C%22context%22%3A%7B%22language%22%3A%22english%22%2C%22country_code%22%3A%22US%22%7D%2C%22data_request%22%3A%7B%22include_extra_details%22%3Atrue%7D%7D). Before this note was written, no fixture and no other file in the repo contained the string `has_community_hub` (read from the repo with a grep). The field is not in the capture script's removal list, so it was not in the 2026-10-20 responses unless it is region or request dependent (unverified; the live calls came from a different location).
- Removed or renamed: no field was removed or renamed in any of the seven items.
- Values that match the fixtures: `anticheat` for 1808500 is `{"kernel_mode":true,"name":"Denuvo","name_loc":"#Store_AntiCheat_Type_denuvo"}`; `anticheat` for 1938090 is `{"kernel_mode":true,"uninstall_completely":true,"boot_protection":true,"boot_protection_name":"secureboot_tpm2"}`; 1938090 `user_account_third_party` is "Activision Account" with `user_account_third_party_link_to_steam: true`; 5072580 `ai_generation_service` is `{"name":"OpenAI API","url":"https://openai.com/api/"}`; the first 80 characters of `content_survey_ai_notes` match for 1808500, 1938090 and 5072580 (verified from source: the first URL above, compared with `tests/fixtures/getitems/mixed-states.json`).
- Not re-fetched: `german-context.json`, `search-roguelike-50.json` and `empty-response.json`; no drift claim is made for them.

Baseline for the four kinds on 2026-10-24 (no fixture exists for these apps, so this is a starting point and not drift). All six come from one request (verified from source: https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=%7B%22ids%22%3A%5B%7B%22appid%22%3A3159330%7D%2C%7B%22appid%22%3A2807960%7D%2C%7B%22appid%22%3A2358720%7D%2C%7B%22appid%22%3A1172470%7D%2C%7B%22appid%22%3A271590%7D%2C%7B%22appid%22%3A1245620%7D%5D%2C%22context%22%3A%7B%22language%22%3A%22english%22%2C%22country_code%22%3A%22US%22%7D%2C%22data_request%22%3A%7B%22include_extra_details%22%3Atrue%7D%7D):

- 3159330 Assassin's Creed Shadows: `drm_third_party_type` "Denuvo Anti-tamper"; `user_account_third_party` "Ubisoft Account" with link true; one `eula` entry; no `anticheat`.
- 2807960 Battlefield 6: `anticheat` `{"kernel_mode":true,"uninstall_completely":true,"boot_protection":true,"boot_protection_name":"secureboot_tpm2"}`; `user_account_third_party` "EA Account linking required" with link true; one `eula`.
- 2358720 Black Myth: Wukong: `drm_third_party_type` "Denuvo"; one `eula`; no account or anticheat.
- 1172470 Apex Legends: `anticheat` `{"kernel_mode":true,"name":"Easy Anti-Cheat","name_loc":"#Store_AntiCheat_Type_easyac"}`; `user_account_third_party` "EA Account" with link true; one `eula` whose URL ends `_eula_1`.
- 271590 Grand Theft Auto V Legacy: `anticheat` `{"kernel_mode":true,"name":"BattlEye","name_loc":"#Store_AntiCheat_Type_battleye"}`; `user_account_third_party` "Rockstar Games" with link true; one `eula`; `unlisted: true`.
- 1245620 ELDEN RING: two `eula` entries ("ELDEN RING EULA" and "ELDEN RING EULA (JP)"); no `anticheat`, DRM or account field.

`drm_activation_limit` is absent from all twelve valid items checked across both requests, including 3159330, even though that app's page and appdetails show an activation-limit line (section 5). The `eula` URL form is `https://store.steampowered.com//eula/<appid>_eula_<n>` (with a double slash) in the live responses, and the same form appears in the 1808500 app-page fixture (verified from source: the request above and `tests/fixtures/app-page/1808500-ai-only.html`).

### 5. appdetails and app-page markup

appdetails. On 2026-10-24, appdetails for 3159330 returns the keys `drm_notice` ("Denuvo Anti-tamper<br>5 a day machine activation limit") and `ext_user_account_notice` ("Ubisoft Account (Supports Linking to Steam Account)") and has no key for EULA or anti-cheat (verified from source: https://store.steampowered.com/api/appdetails?appids=3159330&cc=us&l=english). For 1938090 it returns `ext_user_account_notice` ("Activision Account (Supports Linking to Steam Account)") and no `drm_notice` (verified from source: https://store.steampowered.com/api/appdetails?appids=1938090&cc=us&l=english). For 1808500 it returns neither notice key and no EULA or anti-cheat key (verified from source: https://store.steampowered.com/api/appdetails?appids=1808500&cc=us&l=english). A request for two app IDs at once returned HTTP 400; the cause was not investigated (https://store.steampowered.com/api/appdetails?appids=1938090,1808500&cc=us&l=english). The repo holds no appdetails baseline from before 2026-10-22, so no appdetails drift can be asserted; only the present shape is recorded.

App-page text. The live 1808500 page text matches the fixture `1808500-ai-only.html` for the anti-cheat notice ("Uses Kernel Level Anti-Cheat", then "Denuvo - Requires manual removal after game uninstall"), the EULA notice ("Requires agreement to a 3rd-party EULA" with link text "ARC Raiders EULA" and the `//eula/1808500_eula_0` URL), and the AI block (heading "AI Generated Content Disclosure", opening line "The developers describe how their game uses AI Generated Content like this:") (verified from source: https://store.steampowered.com/app/1808500/?l=english, compared with the fixture file). The live 3159330 page shows, after the Features list and before Languages: "Incorporates 3rd-party DRM: Denuvo Anti-tamper" with "5 a day machine activation limit", "Requires 3rd-Party Account: Ubisoft Account (Supports Linking to Steam Account)" and "Requires agreement to a 3rd-party EULA" with "Assassin's Creed Shadows EULA" (verified from source: https://store.steampowered.com/app/3159330/?l=english). No fixture covers the DRM or third-party account notices, so these wordings are a baseline.

App-page markup. The fetch tool returned plain text, so class names, element nesting and roles of the live pages were not compared. The fixture records `div.anticheat_section.DRM_notice` holding a `div` with the notice and `div.anticheat_name` with a `span.anticheat_uninstalls`, and `div.DRM_notice[role=button]` for the EULA notice (read from the repo: `tests/fixtures/app-page/1808500-ai-only.html`, lines 70 to 77). Whether that markup is unchanged since 2026-10-20 is unverified.

One cross-source fact for the uninstall wording: the live 1808500 GetItems `anticheat` object has no `uninstall_completely` key while the page says removal is manual after uninstall, and the 1938090 object has `uninstall_completely: true`. This suggests an absent key renders the manual-removal text; that is an inference from two data points and is unverified (sources: the first GetItems request above and https://store.steampowered.com/app/1808500/?l=english).

## Caveats and version notes

- Scope of the "reviews API" change: it covers the bulk review list only. The old URL is gone; the review summary values that appdetails carries (the `reviews` key for 1808500) were not examined for change.
- The announcement and the docs disagree on whether a key is required; on 2026-10-24 a keyless call worked. A future enforcement change would not show up in this note.
- All "same at every checkpoint" claims for the protobuf rest on summariser tables of seven file versions, not diffs. A subtle change (for example a default value or an option) could be missed. The four patches I read (5c2b73b2, 94546e80 and the two storequery commits) are the only diffs.
- The repo-wide commit list was truncated by the fetch (25 commits read, back to 2026-10-04); the path-filtered list for webui/common.proto (23 commits since 2026-09-01) came back whole.
- Not examined: the large October commits 78c82519 (32 files), 184badc2 and 89b77382 (58 files) beyond the `StoreItem_ExtraDetails` table, and any change to `StoreBrowseItemDataRequest` before the checkpoints.
- Live calls came from the research tooling, not from the capture location; region-dependent fields would show as false drift. The `has_community_hub` observation was repeated across three separate requests that all agree.
- The fixture README states captures from 2026-10-20 for GetItems and app pages; the next-fest surface capture is dated 2026-10-21 and is not a GetItems capture (read from the repo: `tests/fixtures/README.md`).
- No claim here covers the Steam client, the Steam Deck UI or other Valve products.

## Sources

- https://steamcommunity.com/groups/steamworks/rss/: Steamworks Development group feed; used for the announcement date, body and the list of announcements from July to October 2026.
- https://steamcommunity.com/groups/steamworks/announcements/detail/676258795703241581: the announcement's detail page; returned only the title and navigation.
- https://mixed-news.com/en/steam-user-reviews-api-october-22-replacement-no-key/: news article dated 2026-10-05; used to corroborate the announcement date and the October 22 shutdown.
- https://gamedev.net/news/6178/: repost of the announcement; HTTP 403 on fetch, seen in search results only.
- https://partner.steamgames.com/doc/store/getreviews: Steamworks page for the old method; used for the deprecation notice.
- https://partner.steamgames.com/doc/webapi/IUserReviewsService: Steamworks page for the replacement; used for the endpoint, key and migration notes.
- https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/?input_json=%7B%22appid%22%3A413150%2C%22num_per_page%22%3A1%7D: live keyless call on 2026-10-24; used for the response shape.
- https://store.steampowered.com/appreviews/413150?json=1&num_per_page=1: live call to the old endpoint on 2026-10-24; returned the store home page.
- https://github.com/Statusnone420/Crimson-Desert-Report-Hub/pull/50: downstream PR that reports the old endpoint returning HTTP 200 with HTML from 22 October.
- https://github.com/TMHSDigital/steam-mcp/issues/23: migration issue opened 2026-10-12; no mention of other endpoints.
- https://github.com/draknorr/piq/pull/135: migration PR seen in search results only; source of the unverified empty-response report.
- https://hn.algolia.com/api/v1/search_by_date?query=steam%20reviews%20api&tags=story: Hacker News query; no relevant story.
- https://steamdb.info/blog/: SteamDB blog; HTTP 403.
- https://tech-insider.org/steam-43-million-concurrent-users-record-2026/: search result for the SteamDB blog query; not about APIs.
- https://raw.githubusercontent.com/SteamDatabase/Protobufs/master/webui/common.proto: current `StoreItem_ExtraDetails`, `StoreBrowseItemDataRequest` and anticheat/eula messages.
- https://raw.githubusercontent.com/SteamDatabase/Protobufs/master/webui/service_storebrowse.proto: confirmed it does not hold `StoreItem_ExtraDetails`.
- https://raw.githubusercontent.com/SteamDatabase/Protobufs/bb294c34f5f4704b10da5a8ed51e898a8cbbf31c/webui/common.proto: common.proto at 2026-10-02 (checkpoint).
- https://raw.githubusercontent.com/SteamDatabase/Protobufs/78c82519b58d748a4f99dac78cf624fc5cea6282/webui/common.proto: common.proto at 2026-10-05 (checkpoint).
- https://raw.githubusercontent.com/SteamDatabase/Protobufs/5805db068b7d348eda0ffd322c598fe69957c206/webui/common.proto: common.proto at 2026-10-08 (checkpoint).
- https://raw.githubusercontent.com/SteamDatabase/Protobufs/184badc242dae6153ce875eeb8217c14b1ce3f3c/webui/common.proto: common.proto at 2026-10-14 (checkpoint).
- https://raw.githubusercontent.com/SteamDatabase/Protobufs/89b77382edac5f747bfc196c2edf8996a7fe92bc/webui/common.proto: common.proto at 2026-10-17 (checkpoint).
- https://raw.githubusercontent.com/SteamDatabase/Protobufs/94546e8057dc80a155d4c52f05f6b230a97919e4/webui/common.proto: common.proto at 2026-10-21 (checkpoint).
- https://github.com/SteamDatabase/Protobufs/commit/94546e8057dc80a155d4c52f05f6b230a97919e4.patch: patch that adds `has_community_hub`.
- https://github.com/SteamDatabase/Protobufs/commit/5c2b73b2.patch: patch of 2026-10-22; remote play and streaming only.
- https://github.com/SteamDatabase/Protobufs/commit/e621d3f0946c0033dea4a357b53af95724cb74b3.patch: store query patch of 2026-10-08.
- https://github.com/SteamDatabase/Protobufs/commit/6a6f9a368079d9069a656e4f3786e8c6e9b14ded.patch: store query patch of 2026-10-16.
- https://api.github.com/repos/SteamDatabase/Protobufs/commits?path=webui/common.proto&since=2026-09-01T00:00:00Z&per_page=100: commit list for common.proto since September.
- https://api.github.com/repos/SteamDatabase/Protobufs/commits?since=2026-10-01T00:00:00Z&per_page=100: repo-wide commit list for October (truncated).
- https://api.github.com/repos/SteamDatabase/Protobufs/commits?path=webui/service_storequery.proto&since=2026-09-01T00:00:00Z: commit list for the store query service file.
- https://api.github.com/repos/SteamDatabase/Protobufs/commits?path=webui/service_storebrowse.proto&since=2026-08-01T00:00:00Z: commit list for the store browse service file.
- https://api.github.com/repos/SteamDatabase/Protobufs/commits?path=webui/service_userreviews.proto&since=2026-08-01T00:00:00Z: empty list for a guessed reviews service path.
- https://api.steampowered.com/IStoreBrowseService/GetItems/v1: live GetItems on 2026-10-24 for the seven fixture IDs, for 413150 and 339800 (raw extra_details), for 3159330 (raw extra_details) and for six further test apps (full URLs in section 4).
- https://store.steampowered.com/api/appdetails?appids=3159330&cc=us&l=english: live appdetails for the Denuvo and Ubisoft account app (the 1938090 and 1808500 calls use the same URL form).
- https://store.steampowered.com/app/1808500/?l=english and https://store.steampowered.com/app/3159330/?l=english: live app pages, text only.
- tests/fixtures/README.md, tests/fixtures/getitems/mixed-states.json, tests/fixtures/app-page/1808500-ai-only.html, tests/fixtures/app-page/5072580-ai-first.html and scripts/capture_fixtures.py (this repo): fixture capture dates, stripped keys and baseline values.
