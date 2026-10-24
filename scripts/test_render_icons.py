"""Unit tests for the mark's color files (run by `mise run release:test`)."""

import unittest

from render_icons import COLORS, ICONS_DIR, MASTER, colored


class ColorFilesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.master = MASTER.read_text(encoding="utf-8")

    def test_the_master_paints_in_current_color(self) -> None:
        self.assertIn("currentColor", self.master)

    def test_each_color_file_equals_the_master_in_that_color(self) -> None:
        for name, color in COLORS.items():
            with self.subTest(name=name):
                committed = (ICONS_DIR / f"mark-{name}.svg").read_text(encoding="utf-8")
                self.assertEqual(committed, colored(self.master, color))
                self.assertNotIn("currentColor", committed)

    def test_the_svg_files_leave_the_role_to_the_page(self) -> None:
        for path in ICONS_DIR.glob("mark*.svg"):
            with self.subTest(file=path.name):
                self.assertNotIn("role=", path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
