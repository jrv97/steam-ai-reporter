"""Write the mark's color files and the extension icon PNGs in assets/icons/.

mark-<color>.svg is mark.svg with its currentColor replaced. Headless Chrome ($SAR_CHROME_BIN)
paints icon-<size>.png from mark-purple.svg, or from icon-<size>.svg when that hand-hinted file
exists. The 16 and 32 px renders from the mark are interim; no icon-<size>.svg is ever written.

Usage: render_icons.py
"""

import os
import shutil
import signal
import subprocess
import sys
import tempfile
from pathlib import Path

from repo import ICON_SIZES, ICONS_DIR, ROOT, fail, png_size
from run_browser import env_path

MASTER = ICONS_DIR / "mark.svg"
COLORS = {"purple": "#8f73f3", "white": "#ffffff", "black": "#000000"}
PAINT_COLOR = "purple"
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
    '<img src="{source}" alt="">'
)
CHROME_TIMEOUT_SECONDS = 120
STDERR_LINES = 5


def colored(master: str, color: str) -> str:
    return master.replace("currentColor", color)


def cropped(text: str) -> str:
    if text.count(f'viewBox="{FULL_VIEW_BOX}"') != 1:
        fail(f'{MASTER.name}: expected exactly one viewBox="{FULL_VIEW_BOX}"')
    return text.replace(f'viewBox="{FULL_VIEW_BOX}"', f'viewBox="{ART_VIEW_BOX}"')


def kill_tree(process: subprocess.Popen[str]) -> None:
    """Stop Chrome and the helper processes it started."""
    if sys.platform == "win32":
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True, check=False
        )
    else:
        os.killpg(os.getpgid(process.pid), signal.SIGKILL)


def run_chrome(command: list[str], size: int) -> tuple[int, str]:
    with subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        encoding="utf-8",
        errors="replace",
        start_new_session=True,
    ) as process:
        try:
            _, stderr = process.communicate(timeout=CHROME_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            kill_tree(process)
            process.communicate()
            fail(f"Chrome took over {CHROME_TIMEOUT_SECONDS} s to render the {size} px icon")
        return process.returncode, stderr


def source_svg(work: Path, size: int, painted: str) -> Path:
    """The SVG to paint at this size: the hand-hinted file when it exists, else the cropped mark."""
    hinted = ICONS_DIR / f"icon-{size}.svg"
    target = work / f"icon-{size}.svg"
    text = hinted.read_text(encoding="utf-8") if hinted.is_file() else cropped(painted)
    target.write_text(text, encoding="utf-8")
    return target


def render(chrome: Path, work: Path, size: int, painted: str) -> Path:
    padding = STORE_PADDING if size == STORE_SIZE else 0
    svg = source_svg(work, size, painted)
    page = work / f"icon-{size}.html"
    page.write_text(
        PAGE.format(padding=padding, art=size - 2 * padding, source=svg.name), encoding="utf-8"
    )
    shot = work / f"icon-{size}.png"
    code, stderr = run_chrome(
        [
            str(chrome),
            "--headless=new",
            "--disable-gpu",
            "--disable-background-networking",
            "--force-color-profile=srgb",
            "--hide-scrollbars",
            "--no-first-run",
            "--force-device-scale-factor=1",
            "--default-background-color=00000000",
            f"--user-data-dir={work / 'profile'}",
            f"--window-size={size},{size}",
            f"--screenshot={shot}",
            page.as_uri(),
        ],
        size,
    )
    if not shot.is_file():
        tail = "\n".join(stderr.strip().splitlines()[-STDERR_LINES:])
        fail(f"Chrome wrote no {size} px icon (exit {code})\n{tail}")
    if png_size(shot) != (size, size):
        fail(f"{shot.name}: expected {size}x{size}, got {png_size(shot)}")
    return shot


def write_all(chrome: Path, work: Path) -> None:
    """Render every size first; touch assets/icons only when all of them rendered."""
    master = MASTER.read_text(encoding="utf-8")
    painted = colored(master, COLORS[PAINT_COLOR])
    shots = {size: render(chrome, work, size, painted) for size in ICON_SIZES}
    for name, color in COLORS.items():
        target = ICONS_DIR / f"mark-{name}.svg"
        target.write_text(colored(master, color), encoding="utf-8", newline="\n")
        print(f"wrote {target.relative_to(ROOT).as_posix()}")
    for size, shot in shots.items():
        target = ICONS_DIR / f"icon-{size}.png"
        shutil.copyfile(shot, target)
        print(f"wrote {target.relative_to(ROOT).as_posix()}")


def main() -> None:
    chrome = env_path("SAR_CHROME_BIN")
    if not chrome.is_file():
        fail(f"SAR_CHROME_BIN does not exist: {chrome}")
    # The profile is a throwaway folder, so a running Chrome and its profiles stay untouched.
    scratch = tempfile.TemporaryDirectory(prefix="sar-icons-", ignore_cleanup_errors=True)
    try:
        write_all(chrome, Path(scratch.name))
    finally:
        scratch.cleanup()
        if Path(scratch.name).exists():
            print(f"warning: could not remove {scratch.name}", file=sys.stderr)


if __name__ == "__main__":
    main()
