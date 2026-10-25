"""Unit tests for notes.py (run by `mise run release:test`)."""

import unittest

from notes import AMO_LIMIT, fit

FOOTER = "Full notes: https://example.test/releases/tag/1"


class FitTest(unittest.TestCase):
    def test_short_notes_pass_through(self) -> None:
        notes = "### Added\n- One."
        self.assertEqual(fit(notes, AMO_LIMIT, FOOTER), notes)

    def test_long_notes_keep_whole_lines_and_the_footer(self) -> None:
        notes = "### Added\n" + "\n".join(f"- Item {n} " + "x" * 200 for n in range(40))
        result = fit(notes, AMO_LIMIT, FOOTER)
        self.assertLessEqual(len(result), AMO_LIMIT)
        self.assertTrue(result.endswith(FOOTER))
        for line in result.splitlines()[:-2]:
            self.assertTrue(line.startswith(("###", "- Item ")))
            self.assertFalse(line.startswith("- Item") and not line.endswith("x"))

    def test_a_trailing_heading_is_dropped(self) -> None:
        notes = "### Added\n- " + "a" * 40 + "\n### Changed\n- " + "b" * 3000
        result = fit(notes, 120, FOOTER)
        self.assertNotIn("### Changed", result)
        self.assertLessEqual(len(result), 120)

    def test_one_long_line_is_cut_with_an_ellipsis(self) -> None:
        result = fit("### Added\n- " + "c" * 500, 200, FOOTER)
        self.assertIn("c...\n", result)
        self.assertLessEqual(len(result), 200)


if __name__ == "__main__":
    unittest.main()
