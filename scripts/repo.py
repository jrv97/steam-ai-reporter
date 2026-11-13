"""Shared helpers for the scripts in this folder: repository paths, tool runs, Git, failures."""

import base64
import json
import struct
import subprocess
import sys
from collections.abc import Mapping
from pathlib import Path
from typing import NamedTuple, NoReturn

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
ARTIFACTS = ROOT / "artifacts"
REPO_URL = "https://github.com/jrv97/tag-kit-for-steam"
ISSUES_URL = f"{REPO_URL}/issues"
SLUG = "tag-kit-for-steam"
# The extension builds, named after their browser engines: dist/<target>, manifest.<target>.json.
EXTENSION_TARGETS = ("chromium", "gecko")
ICONS_DIR = ROOT / "assets" / "icons"
ICON_SIZES = (16, 32, 48, 128)
# The dimmed toolbar icon outside the store (ADR 0027): the action's default_icon sizes.
OFF_ICON_SIZES = (16, 32)
# The userscript icon goes into the header as a data URI, so no manager fetches it from a host.
USERSCRIPT_ICON = ICONS_DIR / "icon-48.png"
VALIBOT_LICENSE = ROOT / "node_modules" / "valibot" / "LICENSE.md"
PNG_SIGNATURE = bytes([137, 80, 78, 71, 13, 10, 26, 10])
PNG_HEADER_SIZE = 24


def valibot_notice() -> str:
    """valibot's license as a `/*!` comment: the userscript is one file, so it carries the text."""
    text = VALIBOT_LICENSE.read_text(encoding="utf-8").strip()
    return f"/*! valibot\n{text}\n*/"


PNG_IHDR_SIZE = PNG_HEADER_SIZE + 2
PNG_RGB = 2


class PngHeader(NamedTuple):
    """The fields of a PNG's IHDR chunk that the checks read."""

    width: int
    height: int
    bit_depth: int
    color_type: int


def png_header(path: Path) -> PngHeader | None:
    """The size, bit depth and color type from a PNG's header bytes, or None for no PNG."""
    with path.open("rb") as file:
        header = file.read(PNG_IHDR_SIZE)
    if len(header) < PNG_IHDR_SIZE or not header.startswith(PNG_SIGNATURE):
        return None
    if header[12:16] != b"IHDR":
        return None
    width, height, bit_depth, color_type = struct.unpack(">IIBB", header[16:PNG_IHDR_SIZE])
    return PngHeader(width, height, bit_depth, color_type)


def png_data_uri(path: Path) -> str:
    """A PNG file as a base64 `data:` URI."""
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def png_size(path: Path) -> tuple[int, int] | None:
    """The width and height from a PNG's header bytes, or None when the file is no PNG."""
    header = png_header(path)
    return None if header is None else (header.width, header.height)


def fail(message: str) -> NoReturn:
    print(f"error: {message}", file=sys.stderr)
    sys.exit(1)


def run(*args: str, env: Mapping[str, str] | None = None) -> str:
    """Run a tool from the repository root and return its stdout; a failure exits with stderr."""
    result = subprocess.run(
        list(args), cwd=ROOT, env=env, check=False, capture_output=True, text=True, encoding="utf-8"
    )
    if result.returncode != 0:
        fail(f"{' '.join(args[:2])} failed:\n{result.stderr.strip()}")
    return result.stdout


def run_status(*args: str, env: Mapping[str, str] | None = None) -> int:
    """Run a tool from the repository root on the terminal and return its exit code."""
    return subprocess.run(list(args), cwd=ROOT, env=env, check=False).returncode


def git(*args: str) -> str:
    return run("git", *args)


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


def package_version(revision: str | None = None) -> str:
    """The package.json version in the working tree, or at a Git revision."""
    if revision is None:
        text = (ROOT / "package.json").read_text(encoding="utf-8")
    else:
        text = git("show", f"{revision}:package.json")
    package = json_object(json.loads(text), "package.json")
    return json_string(package.get("version"), "package.json version")
