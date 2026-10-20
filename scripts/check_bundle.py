"""Check the built bundles in dist/ (and artifacts/ when present) against the project rules.

- Manifests: permissions exactly ["storage"], no host permissions and no background (rule 3);
  content scripts match the store only; Gecko settings only in Firefox; every __MSG_*__ resolves.
- Userscript: header present, no @connect; no userscript header in any other bundle.
- No eval( or new Function in any bundle (rule 2); no URL outside the two Valve hosts.
- Size budgets: content.js at most 60 KB, the userscript at most 80 KB, unminified (rule 13).
- The STEAM_API_KEY value, when set, appears nowhere in dist/ or artifacts/ (rule 16).
- The dev injection bundle is never packaged into artifacts/, and when artifacts/ exists it holds
  exactly the five release artifacts, with a manifest at the root of each extension zip.
"""

import os
import re
import zipfile
from pathlib import Path

from repo import ARTIFACTS, DIST, SLUG, fail, json_object, json_string, package_version, read_json

KIB = 1024
BUDGETS = {
    DIST / "chrome" / "content.js": 60 * KIB,
    DIST / "firefox" / "content.js": 60 * KIB,
    DIST / "userscript" / f"{SLUG}.user.js": 80 * KIB,
}
STORE_MATCH = ["https://store.steampowered.com/*"]
ALLOWED_HOSTS = {"api.steampowered.com", "store.steampowered.com"}
HEADER_START = "// ==UserScript=="
HEADER_END = "// ==/UserScript=="
REMOTE_CODE = re.compile(r"\beval\s*\(|\bnew\s+Function\b")
URL = re.compile(r"https?://([A-Za-z0-9.-]+)")
MSG = re.compile(r"__MSG_([A-Za-z0-9_@]+)__")


def manifest_problems(browser: str) -> list[str]:
    root = DIST / browser
    where = f"dist/{browser}/manifest.json"
    manifest = json_object(read_json(root / "manifest.json"), where)
    problems: list[str] = []
    if manifest.get("permissions") != ["storage"]:
        problems.append(f'{where}: permissions must be exactly ["storage"]')
    for key in ("host_permissions", "optional_host_permissions", "optional_permissions"):
        if key in manifest:
            problems.append(f"{where}: {key} is not allowed")
    if "background" in manifest:
        problems.append(f"{where}: background is not allowed")
    scripts = manifest.get("content_scripts")
    if not isinstance(scripts, list) or not scripts:
        problems.append(f"{where}: content_scripts is missing")
    else:
        for script in scripts:
            if json_object(script, where).get("matches") != STORE_MATCH:
                problems.append(f"{where}: content script matches must be {STORE_MATCH}")
    has_gecko = "browser_specific_settings" in manifest
    if has_gecko != (browser == "firefox"):
        problems.append(f"{where}: browser_specific_settings belongs in the Firefox build only")
    locale = json_string(manifest.get("default_locale"), f"{where} default_locale")
    catalog = json_object(read_json(root / "_locales" / locale / "messages.json"), locale)
    for key in MSG.findall((root / "manifest.json").read_text(encoding="utf-8")):
        if key not in catalog:
            problems.append(f"{where}: __MSG_{key}__ has no message in _locales/{locale}")
    return problems


def split_header(text: str) -> tuple[str, str]:
    if not text.startswith(HEADER_START) or HEADER_END not in text:
        return "", text
    end = text.index(HEADER_END) + len(HEADER_END)
    return text[:end], text[end:]


def script_problems(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    where = path.relative_to(DIST.parent).as_posix()
    problems: list[str] = []
    header, body = split_header(text)
    if path.name.endswith((".user.js", ".meta.js")):
        if not header:
            problems.append(f"{where}: the userscript header is missing")
        if "@connect" in header:
            problems.append(f"{where}: @connect is not allowed")
    elif HEADER_START in text:
        problems.append(f"{where}: a userscript header belongs in the userscript only")
    if path.name.endswith(".meta.js"):
        return problems
    if REMOTE_CODE.search(body):
        problems.append(f"{where}: eval( or new Function found")
    for host in sorted(set(URL.findall(body)) - ALLOWED_HOSTS):
        problems.append(f"{where}: URL to a host outside the allowlist: {host}")
    return problems


def secret_problems(roots: list[Path]) -> list[str]:
    secret = os.environ.get("STEAM_API_KEY", "")
    if len(secret) < 8:
        return []
    needle = secret.encode()
    return [
        f"{path}: contains the STEAM_API_KEY value"
        for root in roots
        for path in sorted(root.rglob("*"))
        if path.is_file() and needle in path.read_bytes()
    ]


def zip_names(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as archive:
        return archive.namelist()


def artifact_problems() -> list[str]:
    """The artifacts/ folder holds exactly the five release files, and no dev bundle."""
    version = package_version()
    extensions = [f"{SLUG}-{browser}-{version}.zip" for browser in ("chrome", "firefox")]
    source = f"{SLUG}-source-{version}.zip"
    expected = {*extensions, source, f"{SLUG}.user.js", f"{SLUG}.meta.js"}
    present = {path.name for path in ARTIFACTS.iterdir()}
    problems = [f"artifacts/{name}: missing" for name in sorted(expected - present)]
    problems += [f"artifacts/{name}: unexpected" for name in sorted(present - expected)]
    for name in extensions:
        if name not in present:
            continue
        names = zip_names(ARTIFACTS / name)
        if "manifest.json" not in names:
            problems.append(f"artifacts/{name}: manifest.json is not at the zip root")
        problems += [
            f"artifacts/{name}: {entry} is a dev bundle file"
            for entry in names
            if entry.startswith("dev/") or entry.endswith("inject.js")
        ]
    if source in present:
        roots = {entry.split("/", 2)[1] for entry in zip_names(ARTIFACTS / source) if "/" in entry}
        problems += [
            f"artifacts/{source}: contains {root}/"
            for root in ("dist", "artifacts", "node_modules")
            if root in roots
        ]
    return problems


def main() -> None:
    if not DIST.is_dir():
        fail("dist/ is missing; run `mise run build` first")
    problems: list[str] = []
    for browser in ("chrome", "firefox"):
        problems += manifest_problems(browser)
    for path in sorted(DIST.rglob("*.js")):
        problems += script_problems(path)
    for path, budget in BUDGETS.items():
        if not path.is_file():
            problems.append(f"{path}: missing")
        elif path.stat().st_size > budget:
            problems.append(f"{path}: {path.stat().st_size} bytes, budget {budget}")
    roots = [DIST] + ([ARTIFACTS] if ARTIFACTS.is_dir() else [])
    problems += secret_problems(roots)
    if ARTIFACTS.is_dir():
        problems += artifact_problems()
    if problems:
        print("\n".join(problems))
        fail(f"{len(problems)} bundle problem(s)")


if __name__ == "__main__":
    main()
