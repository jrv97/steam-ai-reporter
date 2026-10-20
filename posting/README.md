# posting collection

Saved requests for [posting](https://posting.sh), used by spike S3 (CORS headers) and for manual checks of the endpoints the extension calls. Every request is keyless and cookie-less (`attach_cookies: false`).

- `getitems/`: `IStoreBrowseService/GetItems` for three app IDs, sent with the store origin, a foreign origin, a `moz-extension://` origin, a `chrome-extension://` origin, no origin, and a German context.
- `app-page/`: an English app page fetch and an adult-only app fetch, with redirects not followed.
- `scripts/record_headers.py`: an `on_response` hook that prints the CORS, `vary`, `location` and `retry-after` headers and saves all response headers as JSON under `<system temp>/steam-ai-reporter-posting/`. Cookie values are replaced by `<redacted>`.

## Run

From the repository root:

```bash
posting --collection posting
```

Pick a request in the collection tree on the left and press `Ctrl+J` to send it. The hook output shows in the response area's Scripts tab.

Do not send these requests in a loop. Steam rate limits per IP.
