# Privacy

Tag Kit for Steam collects nothing. It has no analytics, no telemetry, no account, no server of its own and no third-party hosts. It sends no reports anywhere, and nothing is sent to the developer.

## What is stored on your device

- Results per app ID: which tags the store data gives the item, the time it was checked, the developer's AI report text and its language, the name of a named AI service if there is one, the developer's Early Access note and the release date for a game in Early Access, and the game's name.
- Your settings: whether badges and the banner are on, the list filter mode (off, dim or hide), the language, and a debug flag.
- Your lists of games, developers and publishers you chose to ignore (app ID or Steam's name and group ID, name and date).
- A small internal record used to back off if Steam is limiting requests.
- The ID of the browser tab where you opened All Settings from the toolbar button: a number, never the page's address. Go back uses it to return to that tab.

If you use Download backup, your settings and those lists are also saved to a JSON file through your browser's own download, and Restore reads a file you pick. Neither sends the file anywhere, and the lookup results are not in it.

This lives in the extension's local storage (`storage.local`) or, in the userscript, in your userscript manager's storage. The tab ID is the exception: it sits in the extension's session storage (`storage.session`), which is kept in memory and cleared when the browser closes, and the settings page deletes it once it reads it. None of it leaves your browser. In the General tab of the settings, Lookup results clears the stored results, and Reset puts the settings back to their defaults or empties the ignore lists. Removing the extension or the userscript clears all of it. The extension requests only the `storage` permission and runs only on `https://store.steampowered.com/*`.

## What is sent, and where

To find out which tags an item has, the app IDs of the items on the page you are viewing are sent to Valve, and only to Valve:

- `https://api.steampowered.com/IStoreBrowseService/GetItems/v1`: the app IDs on the page, in batches of up to 50, with the page's Steam language to get the developer's text translated.
- `https://store.steampowered.com/app/<id>/?l=english`: a fallback that fetches an app's store page when the API gives no answer, for a few apps per page view.

Every one of these requests is made without cookies (`credentials: "omit"`), so Steam does not receive your login or session from it. Valve sees your IP address and the app IDs, as it does for any store request. These are the same hosts your browser already talks to while you browse the store.

Cached results are reused: a checked app is not requested again until its entry expires.

## What is never read or sent

The extension does not read your Steam account, wishlist contents, library, cookies or browsing history, and does not send app IDs, settings or any other data to any other host.

## Not affiliated with Valve

This is an independent project, not affiliated with or endorsed by Valve Corporation.

## Changes

If this policy changes, the change is made in this file and in the project's release notes.
