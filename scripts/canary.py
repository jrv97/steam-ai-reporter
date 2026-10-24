"""Check that Steam still answers in the shape the detectors rely on (live, keyless).

One GetItems call for 5072580 and 1808500 (disclosed) and 413150 (not disclosed), plus one app
for each tag kind (3751950 DRM, account and EULA; 2807960 kernel anti-cheat with boot protection;
730 non-kernel anti-cheat; 105600 PvP categories), then one `?l=english` app page for the
disclosure heading and the anti-cheat and EULA notices. Two requests in total, both without
cookies, to the two Valve hosts the extension itself uses. Exits non-zero, listing what changed,
when an answer no longer has the expected shape. Not part of `ci`: it needs the network and
Steam's mood. Run it before a release.
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
DRM_APPID = 3751950
KERNEL_APPID = 2807960
NONKERNEL_APPID = 730
PVP_APPID = 105600
KIND_APPIDS = (DRM_APPID, KERNEL_APPID, NONKERNEL_APPID, PVP_APPID)
# Steam's category IDs for PvP, Online PvP, LAN PvP and Shared/Split Screen PvP.
PVP_CATEGORY_IDS = frozenset({49, 36, 47, 37})
EULA_URL = re.compile(r"^https://store\.steampowered\.com/+eula/")
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
    for appid in KIND_APPIDS:
        problems += kind_problems(appid, by_id.get(appid))
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


def non_empty_string(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def drm_problems(where: str, details: dict[str, object]) -> list[str]:
    problems: list[str] = []
    for key in ("drm_third_party_type", "user_account_third_party"):
        if not non_empty_string(details.get(key)):
            problems.append(f"{where}: expected a non-empty string in {key}")
    if not isinstance(details.get("user_account_third_party_link_to_steam"), bool):
        problems.append(f"{where}: expected a bool in user_account_third_party_link_to_steam")
    eula = details.get("eula")
    entries = eula if isinstance(eula, list) else []
    if not entries:
        return [*problems, f"{where}: expected a list of name and url in eula"]
    for entry in entries:
        link = as_object(entry)
        url = link.get("url") if link else None
        if not (link and non_empty_string(link.get("name")) and isinstance(url, str)):
            problems.append(f"{where}: an eula entry is not name and url strings")
        elif not EULA_URL.match(url):
            problems.append(f"{where}: eula url {url!r} is not an https store /eula/ link")
    return problems


def anticheat_problems(where: str, details: dict[str, object], *, kernel: bool) -> list[str]:
    anticheat = as_object(details.get("anticheat"))
    if anticheat is None:
        return [f"{where}: expected an anticheat object"]
    problems: list[str] = []
    if kernel:
        for key in ("kernel_mode", "boot_protection"):
            if anticheat.get(key) is not True:
                problems.append(f"{where}: expected anticheat.{key} to be true")
        if not non_empty_string(anticheat.get("boot_protection_name")):
            problems.append(f"{where}: expected a string in anticheat.boot_protection_name")
    elif anticheat.get("kernel_mode") is True:
        problems.append(f"{where}: expected an anti-cheat without kernel_mode")
    for key in ("name", "name_loc"):
        if key in anticheat and not isinstance(anticheat[key], str):
            problems.append(f"{where}: anticheat.{key} is not a string")
    return problems


def pvp_problems(where: str, item: dict[str, object]) -> list[str]:
    categories = as_object(item.get("categories"))
    ids = categories.get("supported_player_categoryids") if categories else None
    if not isinstance(ids, list):
        return [f"{where}: expected categories.supported_player_categoryids to be a list"]
    if not PVP_CATEGORY_IDS.intersection(entry for entry in ids if isinstance(entry, int)):
        return [f"{where}: expected a PvP category in supported_player_categoryids"]
    return []


def kind_problems(appid: int, item: dict[str, object] | None) -> list[str]:
    where = f"GetItems app {appid}"
    if item is None:
        return [f"{where}: no item with this id in the answer"]
    if appid == PVP_APPID:
        return pvp_problems(where, item)
    details = as_object(item.get("extra_details"))
    if details is None:
        return [f"{where}: extra_details is missing"]
    if appid == DRM_APPID:
        return drm_problems(where, details)
    return anticheat_problems(where, details, kernel=appid == KERNEL_APPID)


class PageScan(HTMLParser):
    """Collects `#appHubAppName`, the `h2` texts of every disclosure block and the notice hooks."""

    def __init__(self) -> None:
        super().__init__()
        self.has_app_name = False
        self.headings: list[str] = []
        self.kernel_sections = 0
        self.anticheat_names = 0
        self.eula_links = 0
        self._block_depth = 0
        self._in_h2 = False
        self._text = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        ids = {value for key, value in attrs if key == "id"}
        classes = {name for key, value in attrs if key == "class" for name in (value or "").split()}
        if "appHubAppName" in ids:
            self.has_app_name = True
        if {"anticheat_section", "DRM_notice"} <= classes:
            self.kernel_sections += 1
        if "anticheat_name" in classes:
            self.anticheat_names += 1
        if tag == "a" and any(key == "href" and "/eula/" in (value or "") for key, value in attrs):
            self.eula_links += 1
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
    if scan.kernel_sections == 0 or scan.anticheat_names == 0:
        problems.append(f"{where}: no .anticheat_section.DRM_notice with an .anticheat_name")
    if scan.eula_links == 0:
        problems.append(f"{where}: no link to /eula/")
    return problems


def main() -> None:
    problems = getitems_problems(get(getitems_url((*DISCLOSED, *NOT_DISCLOSED, *KIND_APPIDS))))
    problems += app_page_problems(get(APP_PAGE_URL.format(appid=PAGE_APPID)))
    if problems:
        print("\n".join(problems))
        fail(f"{len(problems)} canary problem(s): Steam's shape may have changed")
    print("canary: GetItems and the app page still have the expected shape")


if __name__ == "__main__":
    main()
