"""Refresh the public fixtures in tests/fixtures/ from the live store (cookie-less, keyless).

Captures the GetItems fixtures (`mixed-states`, `german-context`, `empty-response`, `kinds`)
and the server-rendered app pages, sanitizes them the way tests/fixtures/README.md describes, and
writes them in place. It never signs in and never captures a logged-in page. Fixtures that need a
rendered DOM or an account (`surfaces/`, `app-page/*-live-dom.html`, `search-roguelike-50`,
the `synthetic-*` files) are not touched; refresh those by hand.

Without --out the files in tests/fixtures/ are overwritten and the capture date in
tests/fixtures/README.md is updated; review the diff before committing. Use --out to write to
another folder first, or --only kinds to refresh just the tag-kind fixtures (their capture date
is in the README tables). About twenty requests are made, one second apart.
"""

import argparse
import html
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from html.parser import HTMLParser
from pathlib import Path

from repo import ROOT, fail

FIXTURES = ROOT / "tests" / "fixtures"
GETITEMS_URL = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1"
USER_AGENT = "steam-ai-reporter-fixtures (+https://github.com/jrv97/steam-ai-reporter)"
TIMEOUT_SECONDS = 30
SPACING_SECONDS = 1.0

# `related_items` and `type` stay: the schema reads `related_items.parent_appid` of a DLC or a demo
# (decisions 51 and 59), and `type` 1 marks a demo.
ITEM_REMOVED = ("best_purchase_option",)
# `basic_info` keeps only the creators the ignore lists follow (ADR 0013); its descriptions go.
BASIC_INFO_KEPT = ("developers", "publishers")
KINDS_DETAILS_REMOVED = (
    "system_requirements",
    "early_access",
    "partner_awards_bbcode",
    "links_and_info",
    "press_review",
    "legal_notice_bbcode",
    "section",
)
# The AI fixtures drop the EULA links; the kinds fixture keeps them.
DETAILS_REMOVED = (*KINDS_DETAILS_REMOVED, "eula")

VOID_TAGS = frozenset(
    [
        "area",
        "base",
        "br",
        "col",
        "embed",
        "hr",
        "img",
        "input",
        "link",
        "meta",
        "param",
        "source",
        "track",
        "wbr",
    ]
)
DROPPED_TAGS = frozenset(
    ["script", "style", "link", "noscript", "iframe", "svg", "template", "video", "object", "embed"]
)
# Page chrome and bulky blocks cut from app pages (ids and classes).
DROPPED_IDS = frozenset(
    {
        "global_header",
        "footer",
        "footer_spacer",
        "application_config",
        "game_highlights",
        "Reviews_summary",
        "app_reviews_hash",
        "review_histogram_rollup_section",
        "recommended_block_content",
        "ReportAppBtn",
    }
)
DROPPED_CLASSES = frozenset({"sys_req", "responsive_page_menu_ctn", "home_page_content"})
ALLOWED_DS = frozenset(
    {"data-ds-appid", "data-ds-packageid", "data-ds-bundleid", "data-ds-itemkey"}
)
DROPPED_ATTRS = frozenset({"srcset", "data-props", "data-panel"})
KEEP_WHITESPACE_ID = "game_area_content_descriptors"
# Redirect captures keep only this many levels below <body>.
SHALLOW_DEPTH = 3
TAB = "&#9;"


@dataclass(frozen=True)
class AppPage:
    file: str
    appid: int
    shallow: bool = False
    # Keep only the name and the features list (#category_block) in a minimal document.
    features_only: bool = False


APP_PAGES = (
    AppPage("5072580-ai-first.html", 5072580),
    AppPage("1808500-ai-only.html", 1808500),
    AppPage("413150-no-block.html", 413150),
    AppPage("4618750-ai-line-breaks.html", 4618750),
    AppPage("339800-login-redirect.html", 339800, shallow=True),
    AppPage("99999999-home-redirect.html", 99999999, shallow=True),
)

# The tag kinds: apps that show each declaration, a package and a bundle without `extra_details`,
# and an ID that does not exist. 1091500 and 1174180 carry Steam Deck ratings, and 3489340 is
# unreleased, which Valve has not rated.
KIND_APPS = (
    3751950,
    2807960,
    1808500,
    813230,
    730,
    570,
    105600,
    1245620,
    1172470,
    271590,
    1091500,
    1174180,
    3489340,
)
# Games that declare nothing of any kind, from 2004 to 2024.
KIND_NOTHING = (1145360, 413150, 504230, 367520, 2379780, 620)
KIND_PACKAGE = 320795
KIND_BUNDLE = 1
KIND_MISSING = 99999999
KIND_PAGES = (
    AppPage("3751950-drm-account-eula.html", 3751950, features_only=True),
    AppPage("2807960-kernel-boot-protection.html", 2807960, features_only=True),
    AppPage("730-anticheat-nonkernel.html", 730, features_only=True),
    AppPage("1172470-kernel-easyac.html", 1172470, features_only=True),
)


def fetch(url: str) -> str:
    """GET without cookies (the default opener has no cookie jar); returns the body."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})  # noqa: S310
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
            body: str = response.read().decode("utf-8")
            return body
    except (urllib.error.URLError, TimeoutError) as error:
        fail(f"{url}: {error}")


def ascii_refs(text: str) -> str:
    return "".join(char if ord(char) < 128 else f"&#{ord(char)};" for char in text)


class Sanitizer(HTMLParser):
    """Streams a page back out, dropping what tests/fixtures/README.md lists as removed."""

    def __init__(self, shallow: bool) -> None:
        super().__init__(convert_charrefs=True)
        self.shallow = shallow
        self.out: list[str] = []
        self._stack: list[str] = []
        self._skip_from: int | None = None
        self._keep_ws_from: int | None = None
        self._body_level: int | None = None

    def _drops(self, tag: str, attrs: dict[str, str | None]) -> bool:
        classes = (attrs.get("class") or "").split()
        if tag in DROPPED_TAGS or attrs.get("id") in DROPPED_IDS:
            return True
        if any(name in DROPPED_CLASSES or "avatar" in name for name in classes):
            return True
        if "data-miniprofile" in attrs:
            return True
        if tag == "input" and attrs.get("name") == "sessionid":
            return True
        if self.shallow and self._body_level is not None:
            return len(self._stack) - self._body_level >= SHALLOW_DEPTH
        return False

    def _render(self, tag: str, attrs: dict[str, str | None]) -> str:
        parts = [tag]
        for key, value in attrs.items():
            if key.startswith(("on", "data-miniprofile")) or key in DROPPED_ATTRS:
                continue
            if key.startswith("data-ds-") and key not in ALLOWED_DS:
                continue
            if value is None:
                parts.append(key)
            else:
                escaped = ascii_refs(html.escape(value, quote=True)).replace("\t", TAB)
                parts.append(f'{key}="{escaped}"')
        return "<" + " ".join(parts) + ">"

    def handle_decl(self, decl: str) -> None:
        self.out.append(f"<!{decl}>\n")

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        mapping = dict(attrs)
        if self._skip_from is not None:
            if tag not in VOID_TAGS:
                self._stack.append(tag)
            return
        if tag == "body":
            self._body_level = len(self._stack) + 1
        if self._drops(tag, mapping):
            if tag not in VOID_TAGS:
                self._skip_from = len(self._stack)
                self._stack.append(tag)
            return
        self.out.append(self._render(tag, mapping))
        if tag not in VOID_TAGS:
            if mapping.get("id") == KEEP_WHITESPACE_ID:
                self._keep_ws_from = len(self._stack)
            self._stack.append(tag)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        mapping = dict(attrs)
        if self._skip_from is None and not self._drops(tag, mapping):
            self.out.append(self._render(tag, mapping))

    def handle_endtag(self, tag: str) -> None:
        if tag in VOID_TAGS or tag not in self._stack:
            return
        while self._stack:
            popped = self._stack.pop()
            level = len(self._stack)
            if self._skip_from is None:
                self.out.append(f"</{popped}>")
            elif level <= self._skip_from:
                self._skip_from = None
            if self._keep_ws_from is not None and level <= self._keep_ws_from:
                self._keep_ws_from = None
            if popped == tag:
                break

    def handle_data(self, data: str) -> None:
        if self._skip_from is not None:
            return
        if not data.strip():
            self.out.append("\n")
        elif self._keep_ws_from is not None:
            self.out.append(ascii_refs(html.escape(data, quote=False)).replace("\t", TAB))
        else:
            collapsed = re.sub(r"[ \t]+", " ", data)
            self.out.append(ascii_refs(html.escape(collapsed, quote=False)))

    # Comments and processing instructions are dropped by not overriding their handlers.


def sanitize_page(text: str, shallow: bool) -> str:
    parser = Sanitizer(shallow)
    parser.feed(text)
    parser.close()
    return re.sub(r"\n{2,}", "\n", "".join(parser.out)).strip() + "\n"


def element_html(text: str, element_id: str) -> str:
    """The sanitized div with this id, found by counting the divs inside it."""
    marker = text.find(f'id="{element_id}"')
    start = text.rfind("<div", 0, marker)
    if marker < 0 or start < 0:
        fail(f"no div with the id {element_id} in the page")
    depth = 0
    end = -1
    for tag in re.finditer(r"<(/?)div\b", text[start:]):
        depth += -1 if tag.group(1) else 1
        if depth == 0:
            end = text.index(">", start + tag.end()) + 1
            break
    if end < 0:
        fail(f"the div with the id {element_id} never closes")
    return text[start:end]


def features_page(text: str) -> str:
    """A minimal document with the page title, the app name and the features list."""
    title = re.search(r"<title>(.*?)</title>", text, re.DOTALL)
    if title is None:
        fail("no title in the page")
    return (
        '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        f"<title>{title.group(1)}</title>\n</head>\n<body>\n"
        f"{element_html(text, 'appHubAppName')}\n{element_html(text, 'category_block')}\n"
        "</body>\n</html>\n"
    )


def getitems_url(
    ids: list[dict[str, int]], language: str, country: str, platforms: bool = False
) -> str:
    """The request the extension sends; `platforms` as when a Steam Deck or Machine tag is on."""
    flags = {"include_extra_details": True, "include_basic_info": True}
    if platforms:
        flags["include_platforms"] = True
    request = {
        "ids": ids,
        "context": {"language": language, "country_code": country},
        "data_request": flags,
    }
    return f"{GETITEMS_URL}?input_json={urllib.parse.quote(json.dumps(request), safe='')}"


def trim_item(entry: object, removed: tuple[str, ...]) -> object:
    if not isinstance(entry, dict):
        return entry
    item = {key: value for key, value in entry.items() if key not in ITEM_REMOVED}
    basic_info = item.get("basic_info")
    if isinstance(basic_info, dict):
        item["basic_info"] = {k: v for k, v in basic_info.items() if k in BASIC_INFO_KEPT}
    details = item.get("extra_details")
    if isinstance(details, dict):
        item["extra_details"] = {k: v for k, v in details.items() if k not in removed}
    return item


def app_ids(appids: list[int]) -> list[dict[str, int]]:
    return [{"appid": appid} for appid in appids]


def getitems_fixture(
    ids: list[dict[str, int]],
    language: str,
    country: str,
    removed: tuple[str, ...] = DETAILS_REMOVED,
    platforms: bool = False,
) -> str:
    envelope = json.loads(fetch(getitems_url(ids, language, country, platforms)))
    response = envelope.get("response") if isinstance(envelope, dict) else None
    items = response.get("store_items") if isinstance(response, dict) else None
    if not isinstance(items, list):
        fail(f"GetItems {ids}: no response.store_items in the answer")
    rows = ",\n".join(json.dumps(trim_item(item, removed), separators=(",", ":")) for item in items)
    return '{"response":{"store_items":[\n' + rows + "\n]}}\n"


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")
    print(f"wrote {path}")


def capture_getitems(out: Path) -> None:
    mixed = [5072580, 1808500, 1938090, 413150, 339800, 99999999, 50300]
    write(out / "getitems" / "mixed-states.json", getitems_fixture(app_ids(mixed), "english", "US"))
    time.sleep(SPACING_SECONDS)
    write(
        out / "getitems" / "german-context.json",
        getitems_fixture(app_ids([1938090, 5072580]), "german", "DE"),
    )
    time.sleep(SPACING_SECONDS)
    write(out / "getitems" / "empty-response.json", fetch(getitems_url([], "english", "US")))
    time.sleep(SPACING_SECONDS)


def capture_kinds_getitems(out: Path) -> None:
    ids = [
        *app_ids([*KIND_APPS, *KIND_NOTHING]),
        {"packageid": KIND_PACKAGE},
        {"bundleid": KIND_BUNDLE},
        *app_ids([KIND_MISSING]),
    ]
    write(
        out / "getitems" / "kinds.json",
        getitems_fixture(ids, "english", "US", KINDS_DETAILS_REMOVED, platforms=True),
    )
    time.sleep(SPACING_SECONDS)


def capture_app_pages(out: Path, pages: tuple[AppPage, ...] = APP_PAGES) -> None:
    for page in pages:
        body = fetch(f"https://store.steampowered.com/app/{page.appid}/?l=english")
        clean = sanitize_page(body, page.shallow)
        write(out / "app-page" / page.file, features_page(clean) if page.features_only else clean)
        time.sleep(SPACING_SECONDS)


def update_readme_date() -> None:
    readme = FIXTURES / "README.md"
    today = datetime.now(UTC).date().isoformat()
    text = readme.read_text(encoding="utf-8")
    updated = re.sub(r"(Captured from the live store on )\d{4}-\d{2}-\d{2}", rf"\g<1>{today}", text)
    readme.write_text(updated, encoding="utf-8", newline="\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=FIXTURES, help="output folder")
    parser.add_argument(
        "--only", choices=("getitems", "app-page", "kinds"), help="capture one group"
    )
    args = parser.parse_args()
    if args.only in (None, "getitems"):
        capture_getitems(args.out)
    if args.only in (None, "app-page"):
        capture_app_pages(args.out)
    if args.only in (None, "kinds"):
        capture_kinds_getitems(args.out)
        capture_app_pages(args.out, KIND_PAGES)
    if args.out.resolve() == FIXTURES and args.only != "kinds":
        update_readme_date()


if __name__ == "__main__":
    main()
