"""Check that Steam still answers in the shape the detectors rely on (live, keyless).

One GetItems call for a sample of apps and one DLC, then three `?l=english` app pages, one for
each structural hook: the anti-cheat name line, the DRM notice with a line break and the
non-kernel notice. Four requests in total, all without cookies, to the two Valve hosts the
extension itself uses. Each field has the type the schemas expect when it is present, and across
the sample some app shows each kind of declaration and names a developer or publisher (clan IDs
are not required, as Steam omits them for some creators). The DLC must still name its base game in
related_items.parent_appid. A page comes from an app the sample shows that declaration for, and
is checked against what GetItems says about its own app. Exits non-zero, listing what changed,
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
# Apps that between them declare every kind. A page hook takes the first app that shows its
# declaration, so only the order matters.
SAMPLE = (1808500, 5072580, 413150, 3751950, 2807960, 730, 105600, 1245620)
# Steam's category IDs for PvP, Online PvP, LAN PvP and Shared/Split Screen PvP.
# A DLC and its base game: the DLC must keep answering related_items.parent_appid with the base
# game's ID, which the ignore list follows (decision 51). ARC Raiders - Frozen Trail Collector Set.
DLC_APP = 5201760
DLC_PARENT = 1808500
PVP_CATEGORY_IDS = frozenset({49, 36, 47, 37})
EULA_URL = re.compile(r"^https://store\.steampowered\.com/+eula/")
APP_PATH = re.compile(r"^/app/(\d+)(?:/|$)")

STRING_FIELDS = (
    "content_survey_ai_notes",
    "drm_third_party_type",
    "drm_activation_limit",
    "user_account_third_party",
)
ANTICHEAT_BOOLS = ("kernel_mode", "uninstall_completely", "boot_protection")
ANTICHEAT_STRINGS = ("name", "name_loc", "boot_protection_name")
# What some app in the sample must show. A declaration that nobody makes any more is a change.
REQUIRED_FACTS = {
    "ai": "content_survey_ai_notes with text",
    "kernel": "anticheat.kernel_mode true",
    "nonkernel": "an anticheat object without kernel_mode",
    "drm": "drm_third_party_type with text",
    "account": "user_account_third_party with text",
    "eula": "a non-empty eula list",
    "pvp": "categories.supported_player_categoryids with a PvP category",
    "creator": "basic_info.developers or publishers with a named entry",
}
CREATOR_ROLES = ("developers", "publishers")


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
        "data_request": {"include_extra_details": True, "include_basic_info": True},
    }
    return f"{GETITEMS_URL}?input_json={urllib.parse.quote(json.dumps(request), safe='')}"


def as_object(value: object) -> dict[str, object] | None:
    if not isinstance(value, dict):
        return None
    return {str(key): item for key, item in value.items()}


def has_text(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def type_problems(
    where: str, object_: dict[str, object], names: tuple[str, ...], kind: type
) -> list[str]:
    """Each of `names` that is present must have the type `kind`."""
    return [
        f"{where}: {name} is not a {kind.__name__}"
        for name in names
        if name in object_ and not isinstance(object_[name], kind)
    ]


def eula_problems(where: str, eula: object) -> list[str]:
    if not isinstance(eula, list):
        return [f"{where}: eula is not a list"]
    problems: list[str] = []
    for entry in eula:
        link = as_object(entry)
        name = link.get("name") if link else None
        url = link.get("url") if link else None
        if not (isinstance(name, str) and isinstance(url, str)):
            problems.append(f"{where}: an eula entry is not name and url strings")
        elif not EULA_URL.match(url):
            problems.append(f"{where}: an eula url is not an https store /eula/ link")
    return problems


def anticheat_problems(where: str, anticheat: object) -> list[str]:
    fields = as_object(anticheat)
    if fields is None:
        return [f"{where}: anticheat is not an object"]
    return [
        *type_problems(f"{where} anticheat", fields, ANTICHEAT_BOOLS, bool),
        *type_problems(f"{where} anticheat", fields, ANTICHEAT_STRINGS, str),
    ]


def service_problems(where: str, service: object) -> list[str]:
    fields = as_object(service)
    if fields is None or not isinstance(fields.get("name", ""), str):
        return [f"{where}: ai_generation_service is not an object with a name string"]
    return []


def details_problems(where: str, details: dict[str, object]) -> list[str]:
    problems = type_problems(where, details, STRING_FIELDS, str)
    problems += type_problems(where, details, ("user_account_third_party_link_to_steam",), bool)
    if "anticheat" in details:
        problems += anticheat_problems(where, details["anticheat"])
    if "eula" in details:
        problems += eula_problems(where, details["eula"])
    if "ai_generation_service" in details:
        problems += service_problems(where, details["ai_generation_service"])
    return problems


def creator_entries(item: dict[str, object]) -> list[object]:
    """The entries of basic_info.developers and basic_info.publishers that are lists."""
    basic_info = as_object(item.get("basic_info")) or {}
    entries: list[object] = []
    for role in CREATOR_ROLES:
        listed = basic_info.get(role)
        if isinstance(listed, list):
            entries += listed
    return entries


def creator_problems(where: str, basic_info: object) -> list[str]:
    """A creator is an object with a name string; its clan ID, when sent, is an integer."""
    fields = as_object(basic_info)
    if fields is None:
        return [f"{where}: basic_info is not an object"]
    problems: list[str] = []
    for role in CREATOR_ROLES:
        if role in fields and not isinstance(fields[role], list):
            problems.append(f"{where}: basic_info.{role} is not a list")
    for entry in creator_entries({"basic_info": fields}):
        creator = as_object(entry)
        clan = creator.get("creator_clan_account_id") if creator else None
        if creator is None or not isinstance(creator.get("name"), str):
            problems.append(f"{where}: a basic_info creator is not an object with a name string")
        elif clan is not None and (isinstance(clan, bool) or not isinstance(clan, int)):
            problems.append(f"{where}: a basic_info creator_clan_account_id is not an integer")
    return problems


def category_ids(item: dict[str, object]) -> list[int] | None:
    categories = as_object(item.get("categories"))
    ids = categories.get("supported_player_categoryids") if categories else None
    if not isinstance(ids, list):
        return None
    return [entry for entry in ids if isinstance(entry, int)]


def item_problems(appid: int, item: dict[str, object] | None) -> list[str]:
    where = f"GetItems app {appid}"
    if item is None:
        return [f"{where}: no item with this id in the answer"]
    if item.get("success") != 1:
        return [f"{where}: success is {item.get('success')!r}, expected 1"]
    details = as_object(item.get("extra_details"))
    if details is None:
        return [f"{where}: extra_details is missing"]
    problems = details_problems(where, details)
    if "basic_info" in item:
        problems += creator_problems(where, item["basic_info"])
    if "categories" in item and category_ids(item) is None:
        problems.append(f"{where}: categories.supported_player_categoryids is not a list")
    return problems


def facts_of(item: dict[str, object]) -> set[str]:
    """Which declarations an item shows, by the keys of `REQUIRED_FACTS`."""
    details = as_object(item.get("extra_details")) or {}
    anticheat = as_object(details.get("anticheat"))
    eula = details.get("eula")
    return {
        fact
        for fact, shown in (
            ("ai", has_text(details.get("content_survey_ai_notes"))),
            ("kernel", anticheat is not None and anticheat.get("kernel_mode") is True),
            ("nonkernel", anticheat is not None and anticheat.get("kernel_mode") is not True),
            ("drm", has_text(details.get("drm_third_party_type"))),
            ("account", has_text(details.get("user_account_third_party"))),
            ("eula", isinstance(eula, list) and bool(eula)),
            ("pvp", bool(PVP_CATEGORY_IDS.intersection(category_ids(item) or []))),
            (
                "creator",
                any(has_text((as_object(c) or {}).get("name")) for c in creator_entries(item)),
            ),
        )
        if shown
    }


def dlc_problems(item: dict[str, object] | None) -> list[str]:
    where = f"GetItems DLC {DLC_APP}"
    if item is None:
        return [f"{where}: no item with this id in the answer"]
    related = as_object(item.get("related_items"))
    if related is None:
        return [f"{where}: related_items is missing or not an object"]
    parent = related.get("parent_appid")
    if parent != DLC_PARENT or isinstance(parent, bool):
        return [f"{where}: related_items.parent_appid is {parent!r}, expected {DLC_PARENT}"]
    return []


def parse_items(response: Response) -> tuple[list[str], dict[int, dict[str, object]]]:
    where = "GetItems"
    if response.status != 200:
        return [f"{where}: HTTP {response.status}, expected 200"], {}
    problems: list[str] = []
    if response.headers.get("x-eresult", "").strip() != "1":
        problems.append(f"{where}: x-eresult is {response.headers.get('x-eresult')!r}, expected 1")
    try:
        envelope = as_object(json.loads(response.body))
    except json.JSONDecodeError:
        return [*problems, f"{where}: the body is not JSON"], {}
    inner = as_object(envelope.get("response")) if envelope else None
    items = inner.get("store_items") if inner else None
    if not isinstance(items, list):
        return [*problems, f"{where}: response.store_items is missing or not a list"], {}
    by_id: dict[int, dict[str, object]] = {}
    for entry in items:
        item = as_object(entry)
        item_id = item.get("id") if item else None
        if item is not None and isinstance(item_id, int):
            by_id[item_id] = item
    return problems, by_id


def getitems_problems(by_id: dict[int, dict[str, object]]) -> list[str]:
    problems: list[str] = []
    seen: set[str] = set()
    for appid in SAMPLE:
        item = by_id.get(appid)
        problems += item_problems(appid, item)
        seen |= facts_of(item) if item is not None else set()
    problems += [
        f"GetItems: no app in the sample shows {shown}"
        for fact, shown in REQUIRED_FACTS.items()
        if fact not in seen
    ]
    return problems


# The structural hooks, each with the declarations of the app whose page shows it, best first.
# The name line page also carries the AI heading when the sample has an app with both.
PAGE_HOOKS = (
    ("name line", ({"kernel", "ai"}, {"kernel"})),
    ("line break", ({"drm"},)),
    ("non-kernel notice", ({"nonkernel"},)),
)


def pick_page_app(by_id: dict[int, dict[str, object]], options: tuple[set[str], ...]) -> int | None:
    """The first app of the sample whose declarations include the best option that has one."""
    for wanted in options:
        for appid in SAMPLE:
            item = by_id.get(appid)
            if item is not None and wanted <= facts_of(item):
                return appid
    return None


class PageScan(HTMLParser):
    """Collects `#appHubAppName`, the `h2` texts of every disclosure block and the notice hooks."""

    def __init__(self) -> None:
        super().__init__()
        self.has_app_name = False
        self.headings: list[str] = []
        self.kernel_sections = 0
        self.nonkernel_notices = 0
        self.name_lines: list[str] = []
        self.eula_links = 0
        self.plain_notices = 0
        self.break_notices = 0
        self.break_notices_with_markup = 0
        self._block_depth = 0
        self._in_h2 = False
        self._text = ""
        self._notice_depth = 0
        self._notice_tags: list[str] = []
        self._in_name_line = False
        self._in_removal_note = False
        self._line = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        ids = {value for key, value in attrs if key == "id"}
        classes = {name for key, value in attrs if key == "class" for name in (value or "").split()}
        roles = {value for key, value in attrs if key == "role"}
        self.has_app_name = self.has_app_name or "appHubAppName" in ids
        self.kernel_sections += {"anticheat_section", "DRM_notice"} <= classes
        self.nonkernel_notices += "anticheat_nonkernel_notice" in classes
        self._scan_name_line(classes)
        self.eula_links += tag == "a" and any(
            key == "href" and "/eula/" in (value or "") for key, value in attrs
        )
        self._scan_notice(tag, classes, bool(roles))
        self._scan_block(tag, ids)

    def _scan_name_line(self, classes: set[str]) -> None:
        if "anticheat_name" in classes:
            self._in_name_line, self._line = True, ""
        elif self._in_name_line and "anticheat_uninstalls" in classes:
            self._in_removal_note = True

    def _scan_notice(self, tag: str, classes: set[str], has_role: bool) -> None:
        if self._notice_depth:
            self._notice_depth += tag == "div"
            self._notice_tags.append(tag)
        elif tag == "div" and "DRM_notice" in classes and not has_role:
            if "anticheat_section" not in classes:
                self.plain_notices += 1
                self._notice_depth = 1
                self._notice_tags = []

    def _scan_block(self, tag: str, ids: set[str | None]) -> None:
        if self._block_depth:
            if tag == "div":
                self._block_depth += 1
            elif tag == "h2":
                self._in_h2, self._text = True, ""
        elif tag == "div" and "game_area_content_descriptors" in ids:
            self._block_depth = 1

    def handle_endtag(self, tag: str) -> None:
        if self._notice_depth and tag == "div":
            self._notice_depth -= 1
            if not self._notice_depth and "br" in self._notice_tags:
                if self._notice_tags == ["br"]:
                    self.break_notices += 1
                else:
                    self.break_notices_with_markup += 1
        if tag == "span" and self._in_removal_note:
            self._in_removal_note = False
        elif tag == "div" and self._in_name_line:
            self._in_name_line = False
            self.name_lines.append(self._line.strip())
        if self._in_h2 and tag == "h2":
            self._in_h2 = False
            self.headings.append(self._text.strip())
        elif self._block_depth and tag == "div":
            self._block_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._in_h2:
            self._text += data
        if self._in_name_line and not self._in_removal_note:
            self._line += data


def hook_problems(where: str, scan: PageScan, hook: str, item: dict[str, object]) -> list[str]:
    """What the page must show for the hook it was picked for, given the item of the same app."""
    details = as_object(item.get("extra_details")) or {}
    anticheat = as_object(details.get("anticheat")) or {}
    if hook == "name line":
        name = anticheat.get("name")
        lines = [line for line in scan.name_lines if line]
        if scan.kernel_sections == 0 or not lines:
            return [f"{where}: no .anticheat_section.DRM_notice with a named .anticheat_name"]
        if isinstance(name, str) and name.strip() and lines[0] != name.strip():
            return [f"{where}: the first .anticheat_name differs from anticheat.name"]
    elif hook == "line break" and scan.break_notices == 0:
        return [f"{where}: no .DRM_notice made of a text, a <br> and a text"]
    elif hook == "non-kernel notice" and (scan.nonkernel_notices == 0 or not scan.name_lines):
        return [f"{where}: no .anticheat_nonkernel_notice with an .anticheat_name"]
    return []


def page_problems(where: str, scan: PageScan, hook: str, item: dict[str, object]) -> list[str]:
    """What the page must show for the declarations GetItems gave for the same app."""
    facts = facts_of(item)
    problems = hook_problems(where, scan, hook, item)
    if not scan.has_app_name:
        problems.append(f"{where}: #appHubAppName is missing")
    if "ai" in facts and HEADING not in scan.headings:
        problems.append(
            f"{where}: no #game_area_content_descriptors block with the h2 {HEADING!r}"
            f" (found {scan.headings!r})"
        )
    if "eula" in facts and scan.eula_links == 0:
        problems.append(f"{where}: no link to /eula/")
    if "drm" in facts and scan.plain_notices == 0:
        problems.append(f"{where}: no plain .DRM_notice")
    if scan.break_notices_with_markup:
        problems.append(
            f"{where}: a .DRM_notice with a <br> holds more than a text, a <br>, a text"
        )
    return problems


def app_page_problems(
    response: Response, appid: int, hook: str, item: dict[str, object]
) -> list[str]:
    where = f"app page {appid} ({hook})"
    if response.status != 200:
        return [f"{where}: HTTP {response.status}, expected 200"]
    match = APP_PATH.match(urllib.parse.urlparse(response.url).path)
    if match is None or int(match.group(1)) != appid:
        return [f"{where}: redirected to {response.url}, expected the app page"]
    scan = PageScan()
    scan.feed(response.body)
    return page_problems(where, scan, hook, item)


def main() -> None:
    problems, by_id = parse_items(get(getitems_url((*SAMPLE, DLC_APP))))
    problems += getitems_problems(by_id)
    problems += dlc_problems(by_id.get(DLC_APP))
    for hook, options in PAGE_HOOKS:
        appid = pick_page_app(by_id, options)
        item = by_id.get(appid) if appid is not None else None
        if appid is None or item is None:
            problems.append(f"app page ({hook}): no app in the sample shows its declaration")
            continue
        problems += app_page_problems(get(APP_PAGE_URL.format(appid=appid)), appid, hook, item)
    if problems:
        print("\n".join(problems))
        fail(f"{len(problems)} canary problem(s): Steam's shape may have changed")
    print("canary: GetItems and the app pages still have the expected shape")


if __name__ == "__main__":
    main()
