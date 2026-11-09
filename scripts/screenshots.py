"""Capture the store screenshots headless in Chromium (ADR 0022), then check them.

The capture runs on a copy of the dedicated Chromium profile in SAR_CHROMIUM_PROFILE, so Steam
shows the pages signed in. The copy lives in a temporary folder and is deleted afterwards; the
profile itself is only read, and Chromium must be closed while it is copied.
SAR_SCREENSHOT_FRESH=1 runs on a new, signed-out profile instead, and skips the wishlist.
SAR_SCREENSHOT_LOCALE=es captures in Spanish into docs/store/screenshots/es/.

The runbook is docs/store/screenshots.mdx.

Usage: screenshots.py [vitest arguments, such as -t 01-search to retake one shot]
"""

import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from check_screenshots import main as check
from repo import ROOT, fail

CONFIG = "vitest.screenshots.config.ts"
REMOVE_TRIES = 10
# Caches and crash data that the copy can leave behind: Chromium rebuilds them.
SKIPPED = shutil.ignore_patterns(
    "Cache",
    "Code Cache",
    "GPUCache",
    "GrShaderCache",
    "GraphiteDawnCache",
    "ShaderCache",
    "DawnGraphiteCache",
    "DawnWebGPUCache",
    "CacheStorage",
    "Crashpad",
    "BrowserMetrics*",
    "component_crx_cache",
    "lockfile",
    "Singleton*",
)


def profile_dir() -> Path:
    value = os.environ.get("SAR_CHROMIUM_PROFILE", "").strip()
    if not value:
        fail("SAR_CHROMIUM_PROFILE is not set; add it to mise.local.toml")
    path = Path(value)
    if not path.is_dir():
        fail(f"SAR_CHROMIUM_PROFILE is not a folder: {path}")
    return path


def in_use(profile: Path) -> bool:
    """Whether a running Chromium holds the profile: its lock file on Windows, else its symlink."""
    if (profile / "SingletonLock").is_symlink():
        return True
    lock = profile / "lockfile"
    if not lock.exists():
        return False
    try:
        with lock.open("rb"):
            return False
    except PermissionError:
        return True


def capture(env: dict[str, str], args: list[str]) -> None:
    vitest = shutil.which("vitest")
    if vitest is None:
        fail("vitest is not on PATH; run `mise run setup`")
    result = subprocess.run(
        [vitest, "run", "--config", CONFIG, *args], cwd=ROOT, env=env, check=False
    )
    if result.returncode != 0:
        fail("the capture failed; no screenshot was checked")


def main() -> None:
    env = dict(os.environ)
    args = sys.argv[1:]
    if env.get("SAR_SCREENSHOT_FRESH") == "1":
        env.pop("SAR_SCREENSHOT_PROFILE", None)
        capture(env, args)
    else:
        profile = profile_dir()
        if in_use(profile):
            fail(f"Chromium is running on {profile}; close it and run again")
        temp = Path(tempfile.mkdtemp(prefix="sar-screenshots-"))
        try:
            copy = temp / "profile"
            shutil.copytree(profile, copy, ignore=SKIPPED)
            env["SAR_SCREENSHOT_PROFILE"] = str(copy)
            capture(env, args)
        finally:
            remove(temp)
    check()


def remove(folder: Path) -> None:
    """Deletes the copy, which holds a live Steam session. Windows can hold its files a moment."""
    for _ in range(REMOVE_TRIES):
        shutil.rmtree(folder, ignore_errors=True)
        if not folder.exists():
            return
        time.sleep(1)
    fail(f"could not delete the profile copy at {folder}; delete it by hand")


if __name__ == "__main__":
    main()
