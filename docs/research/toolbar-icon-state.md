# Toolbar icon state per tab

## Executive summary

The toolbar icon can look dimmed on every tab outside the Steam store and normal on store tabs with no new permission and no install warning. A content script cannot call the `action` API, so a background context has to: a Chromium service worker or a Firefox event page. The manifest's `default_icon` becomes a dimmed set, the store content script sends one message per page, and the background calls `action.setIcon` with the sender's tab ID and the normal set. Chrome and Firefox both wipe tab-scoped action values on each committed cross-document navigation, so a tab that leaves the store falls back to the dimmed default with no code. Disabling the action would block the toolbar popup, which holds the extension's settings, and `declarativeContent` has no Firefox counterpart.

## Research questions

### RQ1: How does tab-scoped action state behave?

Note: [rq1-per-tab-action-state.md](toolbar-icon-state/rq1-per-tab-action-state.md).

- `action.setIcon`, `action.enable` and `action.disable` need no permission in either browser.
- Chrome clears tab-scoped values in `ExtensionActionRunner::DidFinishNavigation` for committed, cross-document, primary main frame navigations; Firefox clears them in `PanelActionBase.handleLocationChange` when the change is not same-document. Both keep them across pushState and hash changes. A bfcache restore and a Chrome prerender activation count as navigations by inference.
- A disabled action opens no popup in either browser. Chrome grays it only where the extension has no site access and shows the context menu on click; Firefox dims it with opacity.
- Values set at run time without a tab ID live in memory. Only the manifest is a baseline that survives a restart.
- Firefox for Android 142 supports `action.setIcon` and `default_icon`; the action is a row in the add-ons menu.
- In a Chrome service worker `setIcon` accepts `path` (PNG only) and draws it on an `OffscreenCanvas`.

### RQ2: What does a background context cost, and what else could work?

Note: [rq2-background-and-alternatives.md](toolbar-icon-state/rq2-background-and-alternatives.md).

- Neither `background` key adds an install warning in Chrome, and neither store's review text names one. Firefox MV3 still has no `background.service_worker`; it runs `background.scripts` as an event page.
- `sender.tab.id` reaches the background without the `tabs` permission in both browsers. Only `url`, `pendingUrl`, `title` and `favIconUrl` are gated.
- `declarativeContent` (Chrome only) adds no warning, but `ShowAction` needs a disabled default, and `SetIcon` takes image data only. Firefox's `page_action` with `show_matches` draws in the address bar, not the toolbar.
- An extension iframe injected by the content script gets no `tabs` API in Firefox, and in Chrome it needs a web-accessible resource that pages can fingerprint.
- uBlock Origin keeps an "off" PNG set and calls `setIcon` per tab from its background page. Only the idea is taken; uBlock Origin is GPL.
- One event per store page load wakes the worker or event page for a moment. Both idle out after 30 seconds.
