"""Render the extension icons (assets/icons/icon-<size>.png) from assets/icons/mark-purple.svg.

Headless Chrome ($SAR_CHROME_BIN) paints the mark into a page of exactly the icon's size on a
transparent ground. The 128 px icon keeps 16 px of transparent padding; the others are full bleed.
The 16 and 32 px renders are interim: hand-hinted versions replace them later.

Usage: render_icons.py
"""

import shutil
import struct
import subprocess
import tempfile
from pathlib import Path

from repo import ROOT, fail
from run_browser import env_path

ICONS_DIR = ROOT / "assets" / "icons"
SOURCE = ICONS_DIR / "mark-purple.svg"
SIZES = (16, 32, 48, 128)
STORE_SIZE = 128
STORE_PADDING = 16
# The mark spans 4 to 285 on the master's 300 unit canvas. Cropping the view box to that span
# makes the render touch every edge, as design section 14 asks of the full bleed sizes.
FULL_VIEW_BOX = "0 0 300 300"
ART_VIEW_BOX = "4 4 281 281"
PAGE = (
    "<!doctype html><meta charset=utf-8>"
    "<style>html,body{{margin:0;background:transparent}}"
    "img{{position:absolute;inset:{padding}px;width:{art}px;height:{art}px}}</style>"
    '<img src="mark.svg" alt="">'
)
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
CHROME_TIMEOUT_SECONDS = 120


def cropped_mark() -> str:
    text = SOURCE.read_text(encoding="utf-8")
    if text.count(f'viewBox="{FULL_VIEW_BOX}"') != 1:
        fail(f'{SOURCE.name}: expected exactly one viewBox="{FULL_VIEW_BOX}"')
    return text.replace(f'viewBox="{FULL_VIEW_BOX}"', f'viewBox="{ART_VIEW_BOX}"')


def png_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()[:24]
    if not data.startswith(PNG_SIGNATURE):
        fail(f"{path.name}: Chrome did not write a PNG")
    width, height = struct.unpack(">II", data[16:24])
    return width, height


def render(chrome: Path, work: Path, size: int) -> Path:
    padding = STORE_PADDING if size == STORE_SIZE else 0
    page = work / f"icon-{size}.html"
    page.write_text(PAGE.format(padding=padding, art=size - 2 * padding), encoding="utf-8")
    shot = work / f"icon-{size}.png"
    result = subprocess.run(
        [
            str(chrome),
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--no-first-run",
            "--force-device-scale-factor=1",
            "--default-background-color=00000000",
            f"--user-data-dir={work / 'profile'}",
            f"--window-size={size},{size}",
            f"--screenshot={shot}",
            page.as_uri(),
        ],
        capture_output=True,
        text=True,
        timeout=CHROME_TIMEOUT_SECONDS,
        check=False,
    )
    if not shot.is_file():
        fail(f"Chrome wrote no screenshot for {size} px (exit {result.returncode})")
    if png_size(shot) != (size, size):
        fail(f"{shot.name}: expected {size}x{size}, got {png_size(shot)}")
    return shot


def main() -> None:
    chrome = env_path("SAR_CHROME_BIN")
    if not chrome.is_file():
        fail(f"SAR_CHROME_BIN does not exist: {chrome}")
    # The profile is a throwaway folder, so a running Chrome and its profiles stay untouched.
    with tempfile.TemporaryDirectory(prefix="sar-icons-", ignore_cleanup_errors=True) as name:
        work = Path(name)
        (work / "mark.svg").write_text(cropped_mark(), encoding="utf-8")
        for size in SIZES:
            target = ICONS_DIR / f"icon-{size}.png"
            shutil.copyfile(render(chrome, work, size), target)
            print(f"wrote {target.relative_to(ROOT).as_posix()}")


if __name__ == "__main__":
    main()
