"""Posting on_response hook: print the response headers and save them for the spike notes.

Each response is written as JSON to <system temp>/steam-ai-reporter-posting/, one file per
request origin and path. Cookie values are never written; only the cookie names are kept.
"""

import json
import re
import tempfile
from pathlib import Path
from typing import Protocol


class _Headers(Protocol):
    def multi_items(self) -> list[tuple[str, str]]: ...

    def get(self, key: str, default: str) -> str: ...


class _Url(Protocol):
    @property
    def path(self) -> str: ...


class _Request(Protocol):
    @property
    def method(self) -> str: ...

    @property
    def url(self) -> _Url: ...

    @property
    def headers(self) -> _Headers: ...


class _Response(Protocol):
    @property
    def status_code(self) -> int: ...

    @property
    def headers(self) -> _Headers: ...

    @property
    def request(self) -> _Request: ...


OUT_DIR = Path(tempfile.gettempdir()) / "steam-ai-reporter-posting"


def on_response(response: _Response) -> None:
    request = response.request
    origin = request.headers.get("origin", "no-origin")
    headers: list[tuple[str, str]] = []
    for name, value in response.headers.multi_items():
        shown = value.split("=", 1)[0] + "=<redacted>" if name.lower() == "set-cookie" else value
        headers.append((name.lower(), shown))
    record = {
        "method": request.method,
        "path": request.url.path,
        "origin": origin,
        "status": response.status_code,
        "headers": headers,
    }
    slug = re.sub(r"[^a-z0-9]+", "-", f"{request.url.path} {origin}".lower()).strip("-")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / f"{slug}.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    for name, value in headers:
        if name.startswith("access-control-") or name in ("vary", "location", "retry-after"):
            print(f"{name}: {value}")
    print(f"saved {OUT_DIR / (slug + '.json')}")
