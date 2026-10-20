# AI Reporter for Steam

A browser extension (Chrome and Firefox) and a userscript (Tampermonkey and Violentmonkey) that mark items on the Steam store whose developers disclosed generative AI use in Steam's own AI content disclosure.

> Status: in development. Nothing is released yet, and the install links below are placeholders.

The extension only reads Steam's own disclosures and sends no reports anywhere.

## What it does

- Adds a badge to capsules and rows (search, wishlist, home, tag and category hubs, sale pages, search suggestions) for items where the developer filled in the AI disclosure.
- Shows a non-blocking banner on the app page that quotes the developer's disclosure text verbatim.
- Optionally dims or hides disclosing items in lists. This is off by default.
- Lets you ignore a game you consider a false flag, with a per-game allow-list.

The badge says "Discloses AI use". It does not say a game uses AI, and the absence of a badge does not mean a game is AI-free: the disclosure is self-reported by the developer, so it marks what developers chose to disclose and nothing more.

## Install

- Chrome Web Store: link to follow.
- Firefox Add-ons (AMO): link to follow.
- Userscript: link to follow (Tampermonkey or Violentmonkey).

## Privacy

Nothing is collected. App IDs of the items on the page go, without cookies, only to Valve's own hosts you are already using. See [PRIVACY.md](PRIVACY.md).

## Development

Placeholder. The toolchain section (requirements, `mise run` tasks, running in Firefox Nightly and Chrome, tests and checks) is written together with the toolchain.

## Build from source

Placeholder. The reproducible build steps for reviewers (operating system, installing mise, `mise install`, `mise run build`) are written together with the toolchain.

## Prior art and thanks

No code is copied from any of these projects. Their ideas shaped this one, and the work is credited here.

- [AI warning for Steam](https://github.com/seeeeew/aiwarningforsteam) by seeeeew: the low-permission manifest, separate cache lifetimes for positive and negative results, and the idea of an automated check for heading changes.
- [Steam AI Games Indicator](https://github.com/Pierre-Demessence/SteamAIGamesIndicator) by Pierre-Demessence: badging every surface, including wishlist and home capsules, guarding against age gates before trusting a negative, and serial requests with a delay.
- [AI Generated Content Filter for Steam](https://github.com/SoBloxsy/AI-Content-Hider-for-Steam) by SoBloxsy: falling back from hiding to highlighting where hiding breaks a list.
- [Augmented Steam](https://github.com/IsThereAnyDeal/AugmentedSteam): ideas only (handling both classic and React store pages, one module per feature, and the request for a dismissible banner). It is GPL-3.0 licensed, and nothing from it is used in any form.

## Not affiliated with Valve

AI Reporter for Steam is an independent project. It is not affiliated with, endorsed by or sponsored by Valve Corporation. Steam and the Steam logo are trademarks of Valve Corporation.

## License

MIT. See [LICENSE](LICENSE).
