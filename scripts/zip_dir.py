"""Zip a folder reproducibly: sorted entries, fixed timestamps and modes, files at the zip root.

Usage: zip_dir.py <folder> <output.zip>
"""

import sys
import zipfile
from pathlib import Path

from repo import fail

FIXED_TIME = (1980, 1, 1, 0, 0, 0)
FILE_MODE = 0o644 << 16


def zip_dir(folder: Path, output: Path) -> None:
    files = sorted(path for path in folder.rglob("*") if path.is_file())
    if not files:
        fail(f"{folder}: no files to zip")
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            entry = zipfile.ZipInfo(path.relative_to(folder).as_posix(), FIXED_TIME)
            entry.external_attr = FILE_MODE
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, path.read_bytes())


def main() -> None:
    if len(sys.argv) != 3:
        fail("usage: zip_dir.py <folder> <output.zip>")
    zip_dir(Path(sys.argv[1]), Path(sys.argv[2]))


if __name__ == "__main__":
    main()
