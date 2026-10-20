"""Check repo text hygiene (AGENTS.md rules 8 and 15).

- Every text file is ASCII, except non-English message catalogs.
- No "--" used as a dash in Markdown or MDX prose (code spans and fences are skipped).
- Lines are at most 100 columns in files whose formatter cannot wrap them all (shell has no
  width option; long strings and comments survive the others). Markdown, MDX, message catalogs
  and generated files are exempt.

Usage: check_text.py [--staged] [paths...]
"""

import argparse
import re
from pathlib import Path, PurePosixPath

from repo import ROOT, fail, repo_files, staged_files

MAX_WIDTH = 100
SKIPPED = ("tests/fixtures/", "node_modules/", "dist/", "artifacts/", ".mise/")
SKIPPED_FILES = {"pnpm-lock.yaml", "mise.lock", "LICENSE", "CHANGELOG.md"}
BINARY_SUFFIXES = {".png", ".ico", ".jpg", ".jpeg", ".gif", ".webp", ".zip", ".woff", ".woff2"}
PROSE_SUFFIXES = {".md", ".mdx"}
WIDTH_SUFFIXES = {
    ".ts",
    ".mjs",
    ".js",
    ".py",
    ".sh",
    ".toml",
    ".yaml",
    ".yml",
    ".css",
    ".html",
    ".json",
}
CATALOG = re.compile(r"(^|/)locales/(?P<lang>[^/]+)/messages\.json$")
DASH = re.compile(r"(?:^|\s)--(?:\s|$)")
INLINE_CODE = re.compile(r"`[^`]*`")


def skipped(path: str) -> bool:
    return (
        path.startswith(SKIPPED)
        or path in SKIPPED_FILES
        or path.startswith(".changes/")
        or PurePosixPath(path).suffix.lower() in BINARY_SUFFIXES
    )


def non_english_catalog(path: str) -> bool:
    match = CATALOG.search(path)
    return match is not None and match.group("lang") != "en"


def prose_dashes(lines: list[str]) -> list[int]:
    found: list[int] = []
    fenced = False
    for number, line in enumerate(lines, start=1):
        if line.lstrip().startswith(("```", "~~~")):
            fenced = not fenced
            continue
        if not fenced and DASH.search(INLINE_CODE.sub("", line)):
            found.append(number)
    return found


def check(path: str) -> list[str]:
    file = ROOT / path
    raw = file.read_bytes()
    if b"\0" in raw:
        return []
    problems: list[str] = []
    suffix = PurePosixPath(path).suffix.lower()
    if not non_english_catalog(path):
        for number, raw_line in enumerate(raw.split(b"\n"), start=1):
            column = next((i for i, byte in enumerate(raw_line) if byte > 0x7F), None)
            if column is not None:
                problems.append(f"{path}:{number}:{column + 1}: non-ASCII byte")
    lines = raw.decode("utf-8", errors="replace").split("\n")
    if suffix in PROSE_SUFFIXES:
        problems += [f"{path}:{n}: '--' used as a dash" for n in prose_dashes(lines)]
    if suffix in WIDTH_SUFFIXES and CATALOG.search(path) is None:
        for number, line in enumerate(lines, start=1):
            if len(line) > MAX_WIDTH:
                problems.append(f"{path}:{number}: {len(line)} columns (limit {MAX_WIDTH})")
    return problems


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--staged", action="store_true", help="check the staged files only")
    parser.add_argument("paths", nargs="*", help="files to check (default: the whole repo)")
    args = parser.parse_args()

    paths: list[str]
    if args.paths:
        paths = [Path(p).resolve().relative_to(ROOT).as_posix() for p in args.paths]
    elif args.staged:
        paths = staged_files()
    else:
        paths = repo_files()
    problems = [
        problem
        for path in sorted(paths)
        if not skipped(path) and (ROOT / path).is_file()
        for problem in check(path)
    ]
    if problems:
        print("\n".join(problems))
        fail(f"{len(problems)} text problem(s)")


if __name__ == "__main__":
    main()
