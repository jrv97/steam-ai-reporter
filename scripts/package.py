"""Write the release artifacts to artifacts/ from the current dist/ (run `mise run build` first).

  tag-kit-for-steam-chromium-<version>.zip   dist/chromium
  tag-kit-for-steam-gecko-<version>.zip      dist/gecko
  tag-kit-for-steam.user.js / .meta.js       dist/userscript (fixed names, stable URLs)
  tag-kit-for-steam-source-<version>.zip     git archive of HEAD (AMO): lockfile in, docs/ out
                                             except the design tokens the build reads
dist/dev (the dev injection bundle) is never packaged.
"""

import shutil
import sys
import zipfile
from pathlib import Path

from repo import ARTIFACTS, DIST, EXTENSION_TARGETS, ROOT, SLUG, fail, git, package_version

FIXED_TIME = (1980, 1, 1, 0, 0, 0)
FILE_MODE = 0o644 << 16
USERSCRIPT = DIST / "userscript"
# The source archive leaves docs/ out but keeps the tokens that the build reads.
SOURCE_EXCLUDED = "docs"
SOURCE_KEPT = "docs/design/tokens.css"


def zip_dir(folder: Path, output: Path) -> None:
    """Zip a folder reproducibly: sorted entries, fixed timestamps and modes, files at the root."""
    files = sorted(path for path in folder.rglob("*") if path.is_file())
    if not files:
        fail(f"{folder}: no files to zip")
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            entry = zipfile.ZipInfo(path.relative_to(folder).as_posix(), FIXED_TIME)
            entry.external_attr = FILE_MODE
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, path.read_bytes())


def source_archive(version: str) -> None:
    # A pathspec exclude of docs would drop the tokens too, so list every other top-level entry.
    entries = git("ls-tree", "--name-only", "-z", "HEAD").split("\0")
    paths = [entry for entry in entries if entry and entry != SOURCE_EXCLUDED]
    name = f"{SLUG}-source-{version}"
    output = str(ARTIFACTS / f"{name}.zip")
    git(
        "archive",
        "--format=zip",
        f"--prefix={name}/",
        "-o",
        output,
        "HEAD",
        "--",
        *paths,
        SOURCE_KEPT,
    )


def main() -> None:
    sources = [DIST / target for target in EXTENSION_TARGETS] + [USERSCRIPT]
    for folder in sources:
        if not folder.is_dir():
            fail(f"{folder.relative_to(ROOT).as_posix()} is missing; run `mise run build` first")
    if git("status", "--porcelain", "--untracked-files=no"):
        print(
            "warning: tracked files have uncommitted changes; the source archive holds HEAD only",
            file=sys.stderr,
        )

    version = package_version()
    shutil.rmtree(ARTIFACTS, ignore_errors=True)
    ARTIFACTS.mkdir()
    for target in EXTENSION_TARGETS:
        zip_dir(DIST / target, ARTIFACTS / f"{SLUG}-{target}-{version}.zip")
    for suffix in ("user.js", "meta.js"):
        shutil.copyfile(USERSCRIPT / f"{SLUG}.{suffix}", ARTIFACTS / f"{SLUG}.{suffix}")
    source_archive(version)

    for path in sorted(ARTIFACTS.iterdir()):
        print(f"{path.stat().st_size:>9}  {path.name}")


if __name__ == "__main__":
    main()
