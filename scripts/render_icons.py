"""Write the mark's color files and the extension icon PNGs in assets/icons/.

mark-<color>.svg is mark.svg with its currentColor replaced. Headless Chromium ($TKS_CHROMIUM_BIN)
paints icon-<size>.png from mark-purple.svg and the dimmed toolbar icon icon-off-<size>.png from
mark-gray.svg, or each from <name>-<size>.svg when that hand-hinted file exists. The 16 and 32 px
renders from the mark are interim; no hand-hinted SVG is ever written.

Usage: render_icons.py
"""

import os
import shutil
import signal
import subprocess
import sys
import tempfile
from pathlib import Path

from repo import ICON_SIZES, ICONS_DIR, OFF_ICON_SIZES, ROOT, fail, png_size
from run_browser import env_path

MASTER = ICONS_DIR / "mark.svg"
# Gray is tks-color-text-subtle, the store's muted text, for the icon outside the store.
COLORS = {"purple": "#8f73f3", "white": "#ffffff", "black": "#000000", "gray": "#8f98a0"}
# Each PNG set: its file name, the mark color it paints and its sizes.
RENDERS = (("icon", "purple", ICON_SIZES), ("icon-off", "gray", OFF_ICON_SIZES))
STORE_SIZE = 128
STORE_PADDING = 16
# The mark spans 4 to 282.2 across and 4 to 306.2 down on the master's 310 unit canvas. The crop
# is that span's height, centered across, so the render touches the top and bottom edges.
FULL_VIEW_BOX = "0 0 310 310"
ART_VIEW_BOX = "-8 4 302.2 302.2"
PAGE = (
    "<!doctype html><meta charset=utf-8>"
    "<style>html,body{{margin:0;background:transparent}}"
    "img{{position:absolute;inset:{padding}px;width:{art}px;height:{art}px}}</style>"
    '<img src="{source}" alt="">'
)
BROWSER_TIMEOUT_SECONDS = 120
STDERR_LINES = 5


def colored(master: str, color: str) -> str:
    return master.replace("currentColor", color)


def cropped(text: str) -> str:
    if text.count(f'viewBox="{FULL_VIEW_BOX}"') != 1:
        fail(f'{MASTER.name}: expected exactly one viewBox="{FULL_VIEW_BOX}"')
    return text.replace(f'viewBox="{FULL_VIEW_BOX}"', f'viewBox="{ART_VIEW_BOX}"')


def kill_tree(process: subprocess.Popen[str]) -> None:
    """Stop the browser and the helper processes it started."""
    if sys.platform == "win32":
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True, check=False
        )
    else:
        os.killpg(os.getpgid(process.pid), signal.SIGKILL)


def run_headless(command: list[str], size: int) -> tuple[int, str]:
    with subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        encoding="utf-8",
        errors="replace",
        start_new_session=True,
    ) as process:
        try:
            _, stderr = process.communicate(timeout=BROWSER_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            kill_tree(process)
            process.communicate()
            fail(f"Chromium took over {BROWSER_TIMEOUT_SECONDS} s to render the {size} px icon")
        return process.returncode, stderr


def source_svg(work: Path, name: str, size: int, painted: str) -> Path:
    """The SVG to paint at this size: the hand-hinted file when it exists, else the cropped mark."""
    hinted = ICONS_DIR / f"{name}-{size}.svg"
    target = work / f"{name}-{size}.svg"
    text = hinted.read_text(encoding="utf-8") if hinted.is_file() else cropped(painted)
    target.write_text(text, encoding="utf-8")
    return target


def render(browser: Path, work: Path, name: str, size: int, painted: str) -> Path:
    padding = STORE_PADDING if size == STORE_SIZE else 0
    svg = source_svg(work, name, size, painted)
    page = work / f"{name}-{size}.html"
    page.write_text(
        PAGE.format(padding=padding, art=size - 2 * padding, source=svg.name), encoding="utf-8"
    )
    shot = work / f"{name}-{size}.png"
    code, stderr = run_headless(
        [
            str(browser),
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
        fail(f"Chromium wrote no {size} px icon (exit {code})\n{tail}")
    if png_size(shot) != (size, size):
        fail(f"{shot.name}: expected {size}x{size}, got {png_size(shot)}")
    return shot


def write_all(browser: Path, work: Path) -> None:
    """Render every size first; touch assets/icons only when all of them rendered."""
    master = MASTER.read_text(encoding="utf-8")
    shots = {
        f"{name}-{size}.png": render(browser, work, name, size, colored(master, COLORS[color]))
        for name, color, sizes in RENDERS
        for size in sizes
    }
    for name, color in COLORS.items():
        target = ICONS_DIR / f"mark-{name}.svg"
        target.write_text(colored(master, color), encoding="utf-8", newline="\n")
        print(f"wrote {target.relative_to(ROOT).as_posix()}")
    for file_name, shot in shots.items():
        target = ICONS_DIR / file_name
        shutil.copyfile(shot, target)
        print(f"wrote {target.relative_to(ROOT).as_posix()}")


def main() -> None:
    browser = env_path("TKS_CHROMIUM_BIN")
    if not browser.is_file():
        fail(f"TKS_CHROMIUM_BIN does not exist: {browser}")
    # The profile is a throwaway folder, so a running Chromium and its profiles stay untouched.
    scratch = tempfile.TemporaryDirectory(prefix="tks-icons-", ignore_cleanup_errors=True)
    try:
        write_all(browser, Path(scratch.name))
    finally:
        scratch.cleanup()
        if Path(scratch.name).exists():
            print(f"warning: could not remove {scratch.name}", file=sys.stderr)


if __name__ == "__main__":
    main()
