"""Check that Steam still answers in the shape the detectors rely on (live, keyless).

One GetItems call for 5072580 and 1808500 (disclosed) and 413150 (not disclosed), then one
`?l=english` app page for the disclosure heading. Two requests in total, both without cookies,
to the two Valve hosts the extension itself uses. Exits non-zero, listing what changed, when an
answer no longer has the expected shape. Not part of `ci`: it needs the network and Steam's
mood. Run it before a release.
"""

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser

from repo import fail

GETITEMS_URL = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1"
APP_PAGE_URL = "https://store.steampowered.com/app/{appid}/?l=english"
USER_AGENT = "steam-ai-reporter-canary (+https://github.com/jrv97/steam-ai-reporter)"
TIMEOUT_SECONDS = 30
HEADING = "AI Generated Content Disclosure"
DISCLOSED = (5072580, 1808500)
NOT_DISCLOSED = (413150,)
AI_SERVICE_APPID = 5072580
PAGE_APPID = 1808500
APP_PATH = re.compile(r"^/app/(\d+)(?:/|$)")


class Response:
    def __init__(self, status: int, url: str, headers: dict[str, str], body: str) -> None:
        self.status = status
        self.url = url
        self.headers = headers
        self.body = body


def get(url: str) -> Response:
    """A GET with no cookies and no credentials (the default opener has no cookie jar)."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})  # noqa: S310
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
            body = response.read().decode("utf-8", errors="replace")
            headers = {key.lower(): value for key, value in response.headers.items()}
            return Response(response.status, response.url, headers, body)
    except urllib.error.HTTPError as error:
        return Response(error.code, url, {}, "")
    except (urllib.error.URLError, TimeoutError) as error:
        fail(f"{url}: request failed: {error}")


def getitems_url(ids: tuple[int, ...]) -> str:
    request = {
        "ids": [{"appid": appid} for appid in ids],
        "context": {"language": "english", "country_code": "US"},
        "data_request": {"include_extra_details": True},
    }
    return f"{GETITEMS_URL}?input_json={urllib.parse.quote(json.dumps(request), safe='')}"


def as_object(value: object) -> dict[str, object] | None:
    if not isinstance(value, dict):
        return None
    return {str(key): item for key, item in value.items()}


def getitems_problems(response: Response) -> list[str]:
    where = "GetItems"
    if response.status != 200:
        return [f"{where}: HTTP {response.status}, expected 200"]
    problems: list[str] = []
    if response.headers.get("x-eresult", "").strip() != "1":
        problems.append(f"{where}: x-eresult is {response.headers.get('x-eresult')!r}, expected 1")
    try:
        envelope = as_object(json.loads(response.body))
    except json.JSONDecodeError:
        return [*problems, f"{where}: the body is not JSON"]
    inner = as_object(envelope.get("response")) if envelope else None
    items = inner.get("store_items") if inner else None
    if not isinstance(items, list):
        return [*problems, f"{where}: response.store_items is missing or not a list"]
    by_id: dict[int, dict[str, object]] = {}
    for entry in items:
        item = as_object(entry)
        item_id = item.get("id") if item else None
        if item is not None and isinstance(item_id, int):
            by_id[item_id] = item
    for appid in (*DISCLOSED, *NOT_DISCLOSED):
        problems += item_problems(appid, by_id.get(appid))
    return problems


def item_problems(appid: int, item: dict[str, object] | None) -> list[str]:
    where = f"GetItems app {appid}"
    if item is None:
        return [f"{where}: no item with this id in the answer"]
    if item.get("success") != 1:
        return [f"{where}: success is {item.get('success')!r}, expected 1"]
    details = as_object(item.get("extra_details"))
    if details is None:
        return [f"{where}: extra_details is missing"]
    notes = details.get("content_survey_ai_notes")
    problems: list[str] = []
    if appid in DISCLOSED:
        if not (isinstance(notes, str) and notes.strip()):
            problems.append(f"{where}: expected a disclosure in content_survey_ai_notes")
    elif isinstance(notes, str) and notes.strip():
        problems.append(f"{where}: expected no disclosure, content_survey_ai_notes is set")
    if appid == AI_SERVICE_APPID:
        service = as_object(details.get("ai_generation_service"))
        name = service.get("name") if service else None
        if not (isinstance(name, str) and name.strip()):
            problems.append(f"{where}: expected ai_generation_service.name")
    return problems


class PageScan(HTMLParser):
    """Collects whether `#appHubAppName` exists and the `h2` texts of every disclosure block."""

    def __init__(self) -> None:
        super().__init__()
        self.has_app_name = False
        self.headings: list[str] = []
        self._block_depth = 0
        self._in_h2 = False
        self._text = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        ids = {value for key, value in attrs if key == "id"}
        if "appHubAppName" in ids:
            self.has_app_name = True
        if self._block_depth:
            if tag == "div":
                self._block_depth += 1
            elif tag == "h2":
                self._in_h2, self._text = True, ""
        elif tag == "div" and "game_area_content_descriptors" in ids:
            self._block_depth = 1

    def handle_endtag(self, tag: str) -> None:
        if self._in_h2 and tag == "h2":
            self._in_h2 = False
            self.headings.append(self._text.strip())
        elif self._block_depth and tag == "div":
            self._block_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._in_h2:
            self._text += data


def app_page_problems(response: Response) -> list[str]:
    where = f"app page {PAGE_APPID}"
    if response.status != 200:
        return [f"{where}: HTTP {response.status}, expected 200"]
    path = urllib.parse.urlparse(response.url).path
    match = APP_PATH.match(path)
    if match is None or int(match.group(1)) != PAGE_APPID:
        return [f"{where}: redirected to {response.url}, expected the app page"]
    scan = PageScan()
    scan.feed(response.body)
    problems: list[str] = []
    if not scan.has_app_name:
        problems.append(f"{where}: #appHubAppName is missing")
    if HEADING not in scan.headings:
        problems.append(
            f"{where}: no #game_area_content_descriptors block with the h2 {HEADING!r}"
            f" (found {scan.headings!r})"
        )
    return problems


def main() -> None:
    problems = getitems_problems(get(getitems_url((*DISCLOSED, *NOT_DISCLOSED))))
    problems += app_page_problems(get(APP_PAGE_URL.format(appid=PAGE_APPID)))
    if problems:
        print("\n".join(problems))
        fail(f"{len(problems)} canary problem(s): Steam's shape may have changed")
    print("canary: GetItems and the app page still have the expected shape")


if __name__ == "__main__":
    main()
