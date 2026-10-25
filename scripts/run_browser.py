"""Run a build in a development browser through `web-ext run`, reloading on every rebuild.

gecko: the Gecko build in Firefox Nightly only, from SAR_GECKO_BIN, with the dedicated profile
directory in SAR_GECKO_PROFILE. There is no fallback to a Firefox on PATH: a personal Firefox and
its profiles are never launched or touched. The binary must be a Nightly build (its
channel-prefs.js says "nightly"), and a profile last used by another Firefox install is refused.

chromium: the Chromium build in the browser at SAR_CHROMIUM_BIN, with the dedicated profile
directory in SAR_CHROMIUM_PROFILE.

The variables live in mise.local.toml (see mise.local.toml.example).

Usage: run_browser.py {chromium,gecko} [--check]
"""

import argparse
import configparser
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from repo import DIST, EXTENSION_TARGETS, ROOT, fail

START_URL = "https://store.steampowered.com/"
CHANNEL = re.compile(r'pref\(\s*"app\.update\.channel"\s*,\s*"([^"]+)"\s*\)')
EXAMPLE = "see mise.local.toml.example"


def env_path(name: str) -> Path:
    value = os.environ.get(name, "").strip()
    if not value:
        fail(f"{name} is not set; add it to mise.local.toml ({EXAMPLE})")
    path = Path(value)
    if not path.is_absolute():
        fail(f"{name} must be an absolute path, got {value!r}")
    return path


def firefox_channel(binary: Path) -> str | None:
    """Read the update channel next to the binary (Windows and Linux layout, then macOS)."""
    candidates = [
        binary.parent / "defaults" / "pref" / "channel-prefs.js",
        binary.parent.parent / "Resources" / "defaults" / "pref" / "channel-prefs.js",
    ]
    for candidate in candidates:
        if candidate.is_file():
            match = CHANNEL.search(candidate.read_text(encoding="utf-8", errors="replace"))
            return match.group(1) if match else None
    return None


def same_dir(left: str, right: Path) -> bool:
    return os.path.normcase(os.path.normpath(left)) == os.path.normcase(os.path.normpath(right))


def check_profile(name: str, profile: Path, binary: Path | None) -> None:
    if profile.exists() and not profile.is_dir():
        fail(f"{name} must be a profile directory, got a file: {profile}")
    compatibility = profile / "compatibility.ini"
    if binary is None or not compatibility.is_file():
        return
    parser = configparser.ConfigParser(interpolation=None)
    parser.read(compatibility, encoding="utf-8")
    last = parser.get("Compatibility", "LastPlatformDir", fallback="")
    if last and not same_dir(last, binary.parent):
        fail(
            f"{name} was last used by the Firefox in {last}, not by {binary.parent}; "
            "use a profile dedicated to Firefox Nightly"
        )


def gecko_args(check_only: bool) -> list[str]:
    binary = env_path("SAR_GECKO_BIN")
    if not binary.is_file():
        fail(f"SAR_GECKO_BIN does not exist: {binary}")
    channel = firefox_channel(binary)
    if channel != "nightly":
        found = f'channel "{channel}"' if channel else "no update channel"
        fail(f"SAR_GECKO_BIN must be Firefox Nightly; {binary} has {found}")
    profile = env_path("SAR_GECKO_PROFILE")
    check_profile("SAR_GECKO_PROFILE", profile, binary)
    if check_only:
        return []
    return [
        "--target=firefox-desktop",
        f"--source-dir={DIST / 'gecko'}",
        f"--firefox={binary}",
        f"--firefox-profile={profile}",
        "--profile-create-if-missing",
        "--keep-profile-changes",
    ]


def chromium_args(check_only: bool) -> list[str]:
    binary = env_path("SAR_CHROMIUM_BIN")
    if not binary.is_file():
        fail(f"SAR_CHROMIUM_BIN does not exist: {binary}")
    profile = env_path("SAR_CHROMIUM_PROFILE")
    check_profile("SAR_CHROMIUM_PROFILE", profile, None)
    if check_only:
        return []
    return [
        "--target=chromium",
        f"--source-dir={DIST / 'chromium'}",
        f"--chromium-binary={binary}",
        f"--chromium-profile={profile}",
        "--profile-create-if-missing",
        "--keep-profile-changes",
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", choices=EXTENSION_TARGETS)
    parser.add_argument("--check", action="store_true", help="only validate the settings")
    args = parser.parse_args()

    browser_args = gecko_args(args.check) if args.target == "gecko" else chromium_args(args.check)
    if args.check:
        print(f"{args.target}: development browser settings look right")
        return
    # web-ext creates a missing profile directory, but not its missing parents.
    profile_var = "SAR_GECKO_PROFILE" if args.target == "gecko" else "SAR_CHROMIUM_PROFILE"
    env_path(profile_var).parent.mkdir(parents=True, exist_ok=True)
    web_ext = shutil.which("web-ext")
    if web_ext is None:
        fail("web-ext is not on PATH; run this through `mise run run-gecko` or `run-chromium`")
    command = [web_ext, "run", *browser_args, f"--start-url={START_URL}"]
    sys.exit(subprocess.run(command, cwd=ROOT, check=False).returncode)


if __name__ == "__main__":
    main()
