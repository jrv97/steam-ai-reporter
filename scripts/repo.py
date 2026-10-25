"""Shared helpers for the scripts in this folder: repository paths, Git file lists, failures."""

import json
import struct
import subprocess
import sys
from pathlib import Path
from typing import NoReturn

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
ARTIFACTS = ROOT / "artifacts"
SLUG = "steam-ai-reporter"
# The extension builds, named after their browser engines: dist/<target>, manifest.<target>.json.
EXTENSION_TARGETS = ("chromium", "gecko")
ICONS_DIR = ROOT / "assets" / "icons"
ICON_SIZES = (16, 32, 48, 128)
VALIBOT_LICENSE = ROOT / "node_modules" / "valibot" / "LICENSE.md"
PNG_SIGNATURE = bytes([137, 80, 78, 71, 13, 10, 26, 10])
PNG_HEADER_SIZE = 24


def valibot_notice() -> str:
    """valibot's license as a `/*!` comment: the userscript is one file, so it carries the text."""
    text = VALIBOT_LICENSE.read_text(encoding="utf-8").strip()
    return f"/*! valibot\n{text}\n*/"


def png_size(path: Path) -> tuple[int, int] | None:
    """The width and height from a PNG's header bytes, or None when the file is no PNG."""
    with path.open("rb") as file:
        header = file.read(PNG_HEADER_SIZE)
    if len(header) < PNG_HEADER_SIZE or not header.startswith(PNG_SIGNATURE):
        return None
    if header[12:16] != b"IHDR":
        return None
    width, height = struct.unpack(">II", header[16:PNG_HEADER_SIZE])
    return width, height


def fail(message: str) -> NoReturn:
    print(f"error: {message}", file=sys.stderr)
    sys.exit(1)


def git(*args: str) -> str:
    result = subprocess.run(
        ["git", *args], cwd=ROOT, check=True, capture_output=True, text=True, encoding="utf-8"
    )
    return result.stdout


def git_paths(*args: str) -> list[str]:
    """Run a Git command that prints NUL-separated paths (`-z`) and return them."""
    return [path for path in git(*args).split("\0") if path]


def repo_files() -> list[str]:
    """Tracked files plus untracked files that are not ignored."""
    return git_paths("ls-files", "-z", "--cached", "--others", "--exclude-standard")


def staged_files() -> list[str]:
    return git_paths("diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR")


def read_json(path: Path) -> object:
    with path.open(encoding="utf-8") as file:
        result: object = json.load(file)
    return result


def json_object(value: object, where: str) -> dict[str, object]:
    if not isinstance(value, dict):
        fail(f"{where}: expected a JSON object")
    return {str(key): item for key, item in value.items()}


def json_string(value: object, where: str) -> str:
    if not isinstance(value, str):
        fail(f"{where}: expected a string")
    return value


def package_version() -> str:
    package = json_object(read_json(ROOT / "package.json"), "package.json")
    return json_string(package.get("version"), "package.json version")
