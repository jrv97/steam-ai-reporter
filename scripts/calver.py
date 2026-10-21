"""Unpadded CalVer release versions (ADR 0005).

The first release of a UTC day is `YYYY.M.D`, and a same-day recut adds `.N` from 1.
Examples: `2026.10.5`, `2026.10.5.1`. The Git tag, manifest and userscript all use this string.
Chrome and AMO accept one to four integers without leading zeros. Chrome caps each at 65535.

Usage:
  calver.py next              print the next version from today's UTC date and the Git tags
  calver.py check <version>   fail unless <version> is a valid CalVer release version
"""

import argparse
import re
from collections.abc import Iterable
from datetime import UTC, date, datetime

from repo import fail, git

MAX_SEGMENT = 65535
CALVER = re.compile(r"^(?P<y>[1-9]\d{3})\.(?P<m>[1-9]\d?)\.(?P<d>[1-9]\d?)(?:\.(?P<n>[1-9]\d*))?$")

type Version = tuple[int, int, int, int]


def parse(text: str) -> Version | None:
    """Return (year, month, day, recut) for a valid version, with recut 0 for none, else None."""
    match = CALVER.match(text)
    if match is None:
        return None
    year, month, day = int(match["y"]), int(match["m"]), int(match["d"])
    recut = int(match["n"] or 0)
    if recut > MAX_SEGMENT:
        return None
    try:
        date(year, month, day)
    except ValueError:
        return None
    return year, month, day, recut


def render(version: Version) -> str:
    year, month, day, recut = version
    base = f"{year}.{month}.{day}"
    return f"{base}.{recut}" if recut else base


def next_version(today: date, tags: Iterable[str]) -> str:
    """Return the first version for `today`, or the next recut when `today` has releases.

    Raise ValueError when a tag is newer than today or the recut would pass 65535.
    """
    versions = [version for version in map(parse, tags) if version is not None]
    day = (today.year, today.month, today.day)
    if any(version[:3] > day for version in versions):
        newest = render(max(versions))
        raise ValueError(f"tag {newest} is newer than today ({today.isoformat()} UTC)")
    recuts = [version[3] for version in versions if version[:3] == day]
    if not recuts:
        return render((*day, 0))
    recut = max(recuts) + 1
    if recut > MAX_SEGMENT:
        raise ValueError(f"{render((*day, 0))} has used every recut up to {MAX_SEGMENT}")
    return render((*day, recut))


def release_tags() -> list[str]:
    """Every Git tag that is a CalVer release version, oldest first."""
    tags = [tag for tag in git("tag", "--list").split() if parse(tag) is not None]
    return sorted(tags, key=lambda tag: parse(tag) or (0, 0, 0, 0))


def utc_today() -> date:
    return datetime.now(UTC).date()


def main() -> None:
    parser = argparse.ArgumentParser(description="Unpadded CalVer release versions.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("next", help="print the next version")
    check = commands.add_parser("check", help="fail unless the argument is a valid version")
    check.add_argument("version")
    args = parser.parse_args()
    if args.command == "check":
        if parse(args.version) is None:
            fail(f"{args.version!r} is not an unpadded CalVer version (YYYY.M.D or YYYY.M.D.N)")
        return
    try:
        print(next_version(utc_today(), release_tags()))
    except ValueError as error:
        fail(str(error))


if __name__ == "__main__":
    main()
