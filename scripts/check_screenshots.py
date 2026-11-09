"""Check the store screenshots in docs/store/screenshots/ against what both stores take.

The Chrome Web Store takes up to five screenshots of exactly 1280x800, and AMO takes more PNG or
JPEG files up to 4 MiB each. The set is numbered PNG files from `01-*.png` up, with no gaps and at
least five, at 1280x800, 24-bit RGB with no alpha. The first five go to the Chrome Web Store. Any
other PNG in the folder is a README extra, held to the same format and byte limit at any size. A
locale folder such as `es/` follows the same rules. The runbook is docs/store/screenshots.mdx.

Usage: check_screenshots.py
"""

import re
from pathlib import Path

from repo import PNG_RGB, ROOT, fail, png_header

SCREENSHOTS = ROOT / "docs" / "store" / "screenshots"
STORE_SIZE = (1280, 800)
STORE_COUNT = 5
MAX_BYTES = 4 * 1024 * 1024
BIT_DEPTH = 8
NUMBERED = re.compile(r"^\d{2}-[a-z0-9-]+\.png$")


def file_problems(path: Path, store: bool) -> list[str]:
    """What keeps one image from either store; `store` holds it to the listing size too."""
    found: list[str] = []
    if path.stat().st_size > MAX_BYTES:
        found.append(f"{path.name}: over {MAX_BYTES} bytes")
    header = png_header(path)
    if header is None:
        return [*found, f"{path.name}: not a PNG"]
    if (header.bit_depth, header.color_type) != (BIT_DEPTH, PNG_RGB):
        found.append(f"{path.name}: not 24-bit RGB without alpha")
    if store and (header.width, header.height) != STORE_SIZE:
        found.append(f"{path.name}: {header.width}x{header.height}, not 1280x800")
    return found


def folder_problems(folder: Path) -> list[str]:
    """What keeps a folder of screenshots from being one numbered set plus README extras."""
    found: list[str] = []
    files = sorted(path for path in folder.iterdir() if path.is_file())
    numbered = [path for path in files if NUMBERED.match(path.name)]
    expected = [f"{index:02d}-" for index in range(1, max(len(numbered), STORE_COUNT) + 1)]
    if [path.name[:3] for path in numbered] != expected:
        found.append(f"{folder.name}: the set is not 01- up to at least 05- without gaps")
    for path in files:
        if path.suffix != ".png":
            found.append(f"{path.name}: only PNG files belong here")
        else:
            found.extend(file_problems(path, path in numbered))
    return found


def main() -> None:
    folders = [SCREENSHOTS, *(path for path in SCREENSHOTS.iterdir() if path.is_dir())]
    found = [problem for folder in folders for problem in folder_problems(folder)]
    if found:
        fail("; ".join(found))
    print(f"store screenshots fit both stores ({len(folders)} set(s))")


if __name__ == "__main__":
    main()
