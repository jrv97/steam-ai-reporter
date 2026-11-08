"""Unit tests for notes.py (run by `mise run release:test`)."""

import unittest

from notes import AMO_LIMIT, fit
from testdata import Notes


class FitTest(unittest.TestCase):
    def test_short_notes_pass_through(self) -> None:
        self.assertEqual(fit(Notes.SHORT, AMO_LIMIT, Notes.FOOTER), Notes.SHORT)

    def test_long_notes_keep_whole_lines_and_the_footer(self) -> None:
        result = fit(Notes.LONG, AMO_LIMIT, Notes.FOOTER)
        self.assertLessEqual(len(result), AMO_LIMIT)
        self.assertTrue(result.endswith(Notes.FOOTER))
        for line in result.splitlines()[:-2]:
            self.assertTrue(line.startswith(("###", Notes.LONG_LINE_PREFIX)))
            self.assertFalse(line.startswith(Notes.LONG_LINE_PREFIX) and not line.endswith("x"))

    def test_a_trailing_heading_is_dropped(self) -> None:
        result = fit(Notes.WITH_TRAILING_HEADING, Notes.TRAILING_HEADING_LIMIT, Notes.FOOTER)
        self.assertNotIn(Notes.TRAILING_HEADING, result)
        self.assertLessEqual(len(result), Notes.TRAILING_HEADING_LIMIT)

    def test_one_long_line_is_cut_with_an_ellipsis(self) -> None:
        result = fit(Notes.ONE_LONG_LINE, Notes.ONE_LONG_LINE_LIMIT, Notes.FOOTER)
        self.assertIn(Notes.CUT_LINE_END, result)
        self.assertLessEqual(len(result), Notes.ONE_LONG_LINE_LIMIT)


if __name__ == "__main__":
    unittest.main()
