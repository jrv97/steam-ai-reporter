"""Chrome Web Store API v2: upload a package to an existing item and submit it for review.

The access token comes from Workload Identity Federation (ADR 0007), so no key is stored.
"""

import json
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from pathlib import Path

from repo import fail, json_object

API = "https://chromewebstore.googleapis.com"
POLL_SECONDS = 5.0
POLL_ATTEMPTS = 60
TIMEOUT_SECONDS = 120

type Call = Callable[[str, str, bytes], dict[str, object]]


def http_call(token: str) -> Call:
    """A Call that sends authorized requests to the store API and returns the JSON body."""

    def call(method: str, path: str, body: bytes) -> dict[str, object]:
        request = urllib.request.Request(  # noqa: S310
            f"{API}{path}",
            data=body,
            method=method,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/zip"},
        )
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
                return json_object(json.loads(response.read() or b"{}"), path)
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            fail(f"{method} {path}: HTTP {error.code}\n{detail}")

    return call


def wait_for_upload(
    call: Call, item: str, state: object, sleep: Callable[[float], None] = time.sleep
) -> None:
    """Return once the last upload has succeeded; fail on FAILED or after the poll budget."""
    for _ in range(POLL_ATTEMPTS):
        if state == "SUCCEEDED":
            return
        if state != "IN_PROGRESS":
            fail(f"Chrome Web Store upload ended in state {state}")
        sleep(POLL_SECONDS)
        state = call("GET", f"/v2/{item}:fetchStatus", b"").get("lastAsyncUploadState")
    fail(f"Chrome Web Store upload still in progress after {POLL_ATTEMPTS} checks")


def publish(
    call: Call,
    publisher: str,
    extension: str,
    archive: Path,
    sleep: Callable[[float], None] = time.sleep,
) -> str:
    """Upload `archive`, wait for processing, submit it for review and return the item state."""
    item = f"publishers/{publisher}/items/{extension}"
    upload = call("POST", f"/upload/v2/{item}:upload", archive.read_bytes())
    wait_for_upload(call, item, upload.get("uploadState"), sleep)
    submitted = call("POST", f"/v2/{item}:publish", b"")
    warnings = json_object(submitted.get("warningInfo") or {}, "warningInfo").get("warnings")
    for warning in warnings if isinstance(warnings, list) else []:
        print(f"warning: {warning}")
    return str(submitted.get("state", "unknown"))
