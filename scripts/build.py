"""Build every target into dist/ with one esbuild call each.

Targets: the Chromium and Gecko extensions (dist/chromium, dist/gecko: the manifest, the content
script and its stylesheet, the store-tab announcement, the background script, the options page,
the catalogs, the icons and the third-party notices), the userscript (dist/userscript) and the
dev-only injection bundle (dist/dev, never packaged). The userscript header goes in through
`--banner:js` on the userscript call only. Bundles are never minified.

Usage: build.py [--watch]
"""

import argparse
import json
import shutil
import sys
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

from gen_styles import stylesheet
from repo import (
    DIST,
    EXTENSION_TARGETS,
    ICON_SIZES,
    ICONS_DIR,
    ISSUES_URL,
    OFF_ICON_SIZES,
    REPO_URL,
    ROOT,
    SLUG,
    USERSCRIPT_ICON,
    fail,
    json_object,
    json_string,
    package_version,
    png_data_uri,
    read_json,
    run_status,
    valibot_notice,
)

ESBUILD = ROOT / "node_modules" / "esbuild" / "bin" / "esbuild"
EXTENSION_DIR = ROOT / "src" / "platform" / "extension"
LOCALES_DIR = ROOT / "src" / "locales"
NOTICES = ROOT / "THIRD_PARTY_NOTICES.md"
DEFAULT_LOCALE = "en"
# The store page stylesheet, loaded by the manifest so the content script need not adopt it.
CONTENT_CSS = ("TOKENS_CSS", "PAGE_CSS")

USERSCRIPT_MATCH = "https://store.steampowered.com/*"
USERSCRIPT_NAMESPACE = REPO_URL
USERSCRIPT_UPDATE_BASE = f"{REPO_URL}/releases/latest/download"
USERSCRIPT_GRANTS = (
    "GM.getValue",
    "GM.setValue",
    "GM.deleteValue",
    "GM.listValues",
    "GM_addStyle",
    "GM.registerMenuCommand",
    "GM_addValueChangeListener",
)


@dataclass(frozen=True)
class Bundle:
    entry: str
    outfile: Path
    banner: str | None = None


def esbuild_command(bundle: Bundle, watch: bool) -> list[str]:
    command = [
        "node",
        str(ESBUILD),
        bundle.entry,
        "--bundle",
        "--format=iife",
        "--platform=browser",
        "--target=es2022",
        "--charset=utf8",
        "--log-level=warning",
        f"--outfile={bundle.outfile}",
    ]
    if bundle.banner is not None:
        command.append(f"--banner:js={bundle.banner}")
    if watch:
        command.append("--watch=forever")
    return command


def load_catalogs(filename: str = "messages.json") -> dict[str, dict[str, object]]:
    catalogs: dict[str, dict[str, object]] = {}
    for path in sorted(LOCALES_DIR.glob(f"*/{filename}")):
        catalogs[path.parent.name] = json_object(read_json(path), str(path))
    if DEFAULT_LOCALE not in catalogs:
        fail(f"missing the {DEFAULT_LOCALE} catalog in {LOCALES_DIR}")
    return catalogs


def message(catalog: dict[str, object], key: str, where: str) -> str:
    entry = json_object(catalog.get(key), f"{where} {key}")
    return json_string(entry.get("message"), f"{where} {key}.message")


def manifest_catalog(catalog: dict[str, object], locale: str) -> dict[str, object]:
    """The catalog as `_locales` needs it: each message and its placeholders, no descriptions."""
    result: dict[str, object] = {}
    for key, value in catalog.items():
        entry = json_object(value, f"{locale} {key}")
        result[key] = {name: entry[name] for name in ("message", "placeholders") if name in entry}
    return result


def merge(base: dict[str, object], overlay: dict[str, object]) -> dict[str, object]:
    """Deep-merge two manifest objects; overlay values win, nested objects merge."""
    result = dict(base)
    for key, value in overlay.items():
        current = result.get(key)
        if isinstance(current, dict) and isinstance(value, dict):
            result[key] = merge(json_object(current, key), json_object(value, key))
        else:
            result[key] = value
    return result


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def write_extension(target: str, version: str) -> None:
    out = DIST / target
    base = json_object(read_json(EXTENSION_DIR / "manifest.base.json"), "manifest.base.json")
    overlay_path = EXTENSION_DIR / f"manifest.{target}.json"
    overlay = json_object(read_json(overlay_path), overlay_path.name)
    manifest = merge(base, overlay) | {"version": version}
    write_text(out / "manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    write_text(out / "content.css", "".join(stylesheet(name) for name in CONTENT_CSS))
    shutil.copyfile(EXTENSION_DIR / "options.html", out / "options.html")
    shutil.copyfile(NOTICES, out / NOTICES.name)
    for locale, catalog in load_catalogs().items():
        write_text(
            out / "_locales" / locale / "messages.json",
            json.dumps(manifest_catalog(catalog, locale), indent=2, ensure_ascii=False) + "\n",
        )
    names = [f"icon-{size}.png" for size in ICON_SIZES]
    names += [f"icon-off-{size}.png" for size in OFF_ICON_SIZES]
    (out / "icons").mkdir(parents=True, exist_ok=True)
    for name in names:
        shutil.copyfile(ICONS_DIR / name, out / "icons" / name)


def userscript_header(version: str, catalogs: dict[str, dict[str, object]]) -> str:
    """The metadata block of the userscript and its .meta.js, one aligned field per line."""
    english = catalogs[DEFAULT_LOCALE]
    fields: list[tuple[str, str]] = [
        ("@name", message(english, "ext_name", DEFAULT_LOCALE)),
    ]
    for locale, catalog in catalogs.items():
        if locale != DEFAULT_LOCALE:
            fields.append((f"@name:{locale}", message(catalog, "ext_name", locale)))
    fields += [
        ("@namespace", USERSCRIPT_NAMESPACE),
        ("@version", version),
        ("@description", message(english, "ext_description", DEFAULT_LOCALE)),
    ]
    for locale, catalog in catalogs.items():
        if locale != DEFAULT_LOCALE:
            fields.append((f"@description:{locale}", message(catalog, "ext_description", locale)))
    fields += [
        ("@homepageURL", REPO_URL),
        ("@supportURL", ISSUES_URL),
        ("@icon", png_data_uri(USERSCRIPT_ICON)),
        ("@license", "MIT"),
        ("@match", USERSCRIPT_MATCH),
        ("@noframes", ""),
        ("@run-at", "document-idle"),
        ("@updateURL", f"{USERSCRIPT_UPDATE_BASE}/{SLUG}.meta.js"),
        ("@downloadURL", f"{USERSCRIPT_UPDATE_BASE}/{SLUG}.user.js"),
    ]
    fields += [("@grant", grant) for grant in USERSCRIPT_GRANTS]
    width = max(len(key) for key, _ in fields) + 1
    lines = ["// ==UserScript=="]
    lines += [f"// {key.ljust(width)}{value}".rstrip() for key, value in fields]
    lines.append("// ==/UserScript==")
    return "\n".join(lines)


def bundles(header: str) -> list[Bundle]:
    result = [
        Bundle(f"src/platform/extension/{entry}.ts", DIST / target / f"{entry}.js")
        for target in EXTENSION_TARGETS
        for entry in ("announce", "content", "options", "background")
    ]
    result.append(
        Bundle(
            "src/platform/userscript/main.ts",
            DIST / "userscript" / f"{SLUG}.user.js",
            banner=f"{header}\n{valibot_notice()}",
        )
    )
    result.append(Bundle("src/platform/dev/inject.ts", DIST / "dev" / "inject.js"))
    return result


def run_esbuild(all_bundles: list[Bundle], watch: bool) -> None:
    # One thread per bundle: esbuild runs in parallel, and in watch mode until it is stopped.
    with ThreadPoolExecutor(max_workers=len(all_bundles)) as pool:
        codes = list(
            pool.map(lambda bundle: run_status(*esbuild_command(bundle, watch)), all_bundles)
        )
    failed = sum(1 for code in codes if code != 0)
    if failed:
        fail(f"esbuild failed for {failed} target(s)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--watch", action="store_true", help="rebuild the bundles on change")
    args = parser.parse_args()

    version = package_version()
    catalogs = load_catalogs()
    header = userscript_header(version, catalogs)

    shutil.rmtree(DIST, ignore_errors=True)
    for target in EXTENSION_TARGETS:
        write_extension(target, version)
    write_text(DIST / "userscript" / f"{SLUG}.meta.js", header + "\n")
    run_esbuild(bundles(header), watch=False)
    if args.watch:
        print("watching src/ (manifests and catalogs follow on the next `mise run build`)")
        try:
            run_esbuild(bundles(header), watch=True)
        except KeyboardInterrupt:
            sys.exit(0)


if __name__ == "__main__":
    main()
