# Browser extension release pipeline

## Executive summary

Most large open-source extensions stop at a GitHub release and upload to the stores by hand. uBlock Origin, Dark Reader, Augmented Steam, SteamDB and Return YouTube Dislike all do. Refined GitHub is the one project read that publishes from CI. It cuts a daily calver tag, stamps the version into the manifest at build time, then runs per-store jobs in GitHub environments (`chrome-webstore-upload-cli`, `web-ext sign --channel listed`). No project uses changelog fragments, and none runs a two-stage nightly-then-prod promotion.

The planned release train (changie fragments, calver, a bot-made tag, nightly deploy, prod on manual dispatch of the same tag) needs three changes for the store rules:

- The manifest version must be unpadded calver.
- A nightly must not go to a store listing that prod later reuses, because AMO burns every version number across channels.
- Store auth needs long-lived secrets, because no store offers keyless or OIDC publishing.

## Research questions

### RQ1: How do large open-source extensions version, build, publish and host releases?

The note covers uBlock Origin, Dark Reader, Refined GitHub, Bitwarden, Augmented Steam and Return YouTube Dislike, plus the store version rules, store auth in 2026, userscript hosting, and corepack on node 24. It ends with an element-by-element mapping of the release train. Note: [rq1-prior-art.md](extension-release-pipeline/rq1-prior-art.md).

- Chrome and AMO accept 1 to 4 dotted integers with no leading zeros, and Chrome caps each at 65535. `2026.10.20` and `2026.10.20.1` are valid; `2026.10.05` is not. There is no room for a channel segment.
- AMO never reuses a version number, across channels and even after deletion. The Chrome Web Store needs each upload to out-rank the last. UBO keeps dev and stable on distinct version numbers. Bitwarden keeps a separate `chrome-beta` listing. That a nightly signed unlisted on AMO blocks the same version in listed is an inference that no test confirmed.
- Chrome Web Store API v2 (2025-10-15) adds service accounts, `STAGED_PUBLISH` and `deployPercentage`, but partial rollout needs more than 10,000 weekly users. v1.1 support was announced to end on 2026-10-15. AMO uses a JWT key pair, and Edge uses an expiring API key. No keyless auth was found for any of the three.
- `releases/latest/download/<asset>` skips drafts and prereleases; nightly prereleases never move the update pointer. Greasy Fork forbids minified code, rewrites `@updateURL` and `@downloadURL`, and syncs from GitHub by webhook. Return YouTube Dislike ships an extension and a userscript from one repo with separate version lines.
- node 24 still ships corepack (updated to 0.36.0 in node 24.21.0); node 25 removed it. AMO's reviewer environment (Ubuntu 24.04.4, node 24.14.0, npm 11.9.0) can run `corepack enable`. The readme should add `npm install -g corepack` as a fallback.
- Unverified: how the five build-only projects actually upload to the stores. Greasy Fork webhook setup, and whether it accepts a redirecting release URL. Whether `chrome-webstore-upload-cli@3` still works after the v1.1 sunset; v4 targets v2 and needs a `PUBLISHER_ID`.

## Conclusions

Established:

- changie fragments, a batch changelog PR and a bot-made tag have no prior art among extensions, but nothing in the stores contradicts them. The changelog feeds the GitHub release body and AMO's per-version release notes. No Chrome Web Store release-notes field was found.
- Calver works if the manifest spelling is unpadded. The simplest rule is one unpadded string everywhere (tag, manifest, userscript `@version`). A padded tag with an unpadded manifest is possible but adds a mapping step.
- "Same tag, nightly then prod" works only if the nightly never touches the listing that prod publishes to. A nightly can live as a GitHub prerelease only, or on a separate AMO add-on ID and Chrome Web Store listing.
- Promoting one built artifact beats rebuilding at prod time, because AMO checks that the source rebuilds to the same files.
- Expect GitHub environments per store, with required reviewers on prod and a secret rotation calendar.

What stays open:

- Whether testers get a signed, auto-updating beta channel (a second add-on ID and listing) or a GitHub prerelease is enough.
- Whether to use a release GitHub App with a tag ruleset, or a lighter `GITHUB_TOKEN` flow.
- Whether to mirror the userscript on Greasy Fork.

## Recommendations

- Adopt changie fragments with a CI gate on `src/` changes and the `no-changelog-fragment` label escape hatch.
- Version as unpadded calver `YYYY.M.D`, with `.N` for same-day recuts, identical in the tag, the manifest and the userscript `@version`. The batch PR writes `package.json` and the changie version, so the repo always holds the last released version.
- Nightly: the train cuts a GitHub prerelease with every artifact (Chrome zip, Firefox zip, `.user.js`, `.meta.js`, AMO source zip) and uploads to no store. Prod: a manual dispatch of the same tag uploads the same artifacts to the Chrome Web Store (API v2) and AMO listed (`web-ext sign --channel listed --upload-source-code`), then flips the GitHub release out of prerelease, which moves the userscript update pointer.
- Per-store GitHub environments `chrome-web-store` and `amo`, each with required reviewers.
- Out of scope for v1: Edge, partial rollout, Greasy Fork, and a signed beta channel.

Would need another `/wf:research`: how the build-only projects actually upload (only for a second opinion on manual uploads), Greasy Fork sync mechanics (only for a mirror there), and a hands-on test of Chrome Web Store API v2 with a service account from GitHub actions.
