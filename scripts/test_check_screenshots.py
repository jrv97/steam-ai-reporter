"""Unit tests for the store screenshot check (run by `mise run release:test`)."""

import struct
import tempfile
import unittest
from pathlib import Path

from check_screenshots import MAX_BYTES, file_problems, folder_problems
from repo import PNG_SIGNATURE


def png(width: int = 1280, height: int = 800, depth: int = 8, color: int = 2) -> bytes:
    """The first bytes of a PNG: the signature and an IHDR chunk, which is all the check reads."""
    return (
        PNG_SIGNATURE
        + struct.pack(">I", 13)
        + b"IHDR"
        + struct.pack(">IIBBBBB", width, height, depth, color, 0, 0, 0)
    )


# (case, file bytes, held to the store size, problem count)
FILES = (
    ("a store image", png(), True, 0),
    ("a README extra at its own size", png(800, 1200), False, 0),
    ("a store image at another size", png(1440, 900), True, 1),
    ("an image with alpha", png(color=6), True, 1),
    ("16 bits per channel", png(depth=16), True, 1),
    ("a JPEG under a PNG name", b"\xff\xd8\xff\xe0" + bytes(40), True, 1),
    ("an image over the byte limit", png() + bytes(MAX_BYTES), True, 1),
)


class ScreenshotCheckTest(unittest.TestCase):
    def setUp(self) -> None:
        self.folder = Path(self.enterContext(tempfile.TemporaryDirectory()))

    def write(self, name: str, data: bytes) -> Path:
        path = self.folder / name
        path.write_bytes(data)
        return path

    def test_each_file_against_both_stores(self) -> None:
        for case, data, store, count in FILES:
            with self.subTest(case=case):
                self.assertEqual(len(file_problems(self.write("01-shot.png", data), store)), count)

    def test_a_folder_needs_five_or_more_numbered_shots_and_only_png_files(self) -> None:
        for index in range(1, 8):
            self.write(f"{index:02d}-shot.png", png())
        self.write("extra.png", png(1280, 1600))
        self.assertEqual(folder_problems(self.folder), [])
        (self.folder / "05-shot.png").unlink()
        self.write("old.jpg", b"")
        self.assertEqual(len(folder_problems(self.folder)), 2)


if __name__ == "__main__":
    unittest.main()
