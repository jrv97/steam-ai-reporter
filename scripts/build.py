"""Build every target into dist/ with one esbuild call each.

Targets: the Chrome and Firefox extensions (dist/chrome, dist/firefox: the manifest, the content
script and its stylesheet, the options page, the catalogs, the icons and the third-party notices),
the userscript (dist/userscript) and the dev-only injection bundle (dist/dev, never packaged). The
userscript header goes in through `--banner:js` on the userscript call only. Bundles are never
minified.

Usage: build.py [--watch]
"""

import argparse
import json
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from gen_styles import stylesheet
from repo import DIST, ROOT, SLUG, fail, json_object, json_string, package_version, read_json

ESBUILD = ROOT / "node_modules" / "esbuild" / "bin" / "esbuild"
EXTENSION_DIR = ROOT / "src" / "platform" / "extension"
LOCALES_DIR = ROOT / "src" / "locales"
ICONS_DIR = ROOT / "assets" / "icons"
NOTICES = ROOT / "THIRD_PARTY_NOTICES.md"
ICON_SIZES = (16, 32, 48, 128)
DEFAULT_LOCALE = "en"
BROWSERS = ("chrome", "firefox")
# The store page stylesheet, loaded by the manifest so the content script need not adopt it.
CONTENT_CSS = ("TOKENS_CSS", "PAGE_CSS")

USERSCRIPT_MATCH = "https://store.steampowered.com/*"
# Script managers may treat a renamed script as a new one, so @name keeps its own key.
# Set this to "ext_name" and delete userscript_name from the catalogs to follow the product name.
USERSCRIPT_NAME_KEY = "userscript_name"
USERSCRIPT_NAMESPACE = "https://github.com/jrv97/steam-ai-reporter"
USERSCRIPT_UPDATE_BASE = f"{USERSCRIPT_NAMESPACE}/releases/latest/download"
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


def load_catalogs() -> dict[str, dict[str, object]]:
    catalogs: dict[str, dict[str, object]] = {}
    for path in sorted(LOCALES_DIR.glob("*/messages.json")):
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


def write_extension(browser: str, version: str) -> None:
    out = DIST / browser
    base = json_object(read_json(EXTENSION_DIR / "manifest.base.json"), "manifest.base.json")
    overlay_path = EXTENSION_DIR / f"manifest.{browser}.json"
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
    for size in ICON_SIZES:
        target = out / "icons" / f"icon-{size}.png"
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ICONS_DIR / f"icon-{size}.png", target)


def userscript_header(version: str, catalogs: dict[str, dict[str, object]]) -> str:
    english = catalogs[DEFAULT_LOCALE]
    fields: list[tuple[str, str]] = [
        ("@name", message(english, USERSCRIPT_NAME_KEY, DEFAULT_LOCALE)),
    ]
    for locale, catalog in catalogs.items():
        if locale != DEFAULT_LOCALE:
            fields.append((f"@name:{locale}", message(catalog, USERSCRIPT_NAME_KEY, locale)))
    fields += [
        ("@namespace", USERSCRIPT_NAMESPACE),
        ("@version", version),
        ("@description", message(english, "ext_description", DEFAULT_LOCALE)),
    ]
    for locale, catalog in catalogs.items():
        if locale != DEFAULT_LOCALE:
            fields.append((f"@description:{locale}", message(catalog, "ext_description", locale)))
    fields += [
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
        Bundle(f"src/platform/extension/{entry}.ts", DIST / browser / f"{entry}.js")
        for browser in BROWSERS
        for entry in ("content", "options")
    ]
    result.append(
        Bundle(
            "src/platform/userscript/main.ts",
            DIST / "userscript" / f"{SLUG}.user.js",
            banner=header,
        )
    )
    result.append(Bundle("src/platform/dev/inject.ts", DIST / "dev" / "inject.js"))
    return result


def run_esbuild(all_bundles: list[Bundle], watch: bool) -> None:
    processes = [
        subprocess.Popen(esbuild_command(bundle, watch), cwd=ROOT) for bundle in all_bundles
    ]
    failed = sum(1 for proc in processes if proc.wait() != 0)
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
    for browser in BROWSERS:
        write_extension(browser, version)
    write_text(DIST / "userscript" / f"{SLUG}.meta.js", header + "\n")
    run_esbuild(bundles(header), watch=False)
    if args.watch:
        print("watching src/ (manifests and catalogs are copied on the next full build)")
        try:
            run_esbuild(bundles(header), watch=True)
        except KeyboardInterrupt:
            sys.exit(0)


if __name__ == "__main__":
    main()
