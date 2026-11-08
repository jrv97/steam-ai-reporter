"""Unit tests for ts_literals.py (run by `mise run release:test`)."""

import unittest

from testdata import TsLiterals
from ts_literals import string_literals


def values(text: str) -> list[str]:
    """The parts of every literal, flat."""
    return [part for literal in string_literals(text) for part in literal.parts]


class QuotedTest(unittest.TestCase):
    def test_reads_both_quotes_keeps_the_other_inside_and_decodes_escapes(self) -> None:
        for text, parts in TsLiterals.QUOTED:
            with self.subTest(text=text):
                self.assertEqual(values(text), parts)


class SkippedTest(unittest.TestCase):
    def test_skips_comments_regex_literals_division_and_names(self) -> None:
        for text, parts in TsLiterals.SKIPPED:
            with self.subTest(text=text):
                self.assertEqual(values(text), parts)


class TemplateTest(unittest.TestCase):
    def test_is_one_literal_with_a_part_per_static_chunk(self) -> None:
        for text, literals in TsLiterals.TEMPLATES:
            with self.subTest(text=text):
                self.assertEqual(string_literals(text), literals)


class LineTest(unittest.TestCase):
    def test_reports_the_line_where_a_literal_starts(self) -> None:
        self.assertEqual(string_literals(TsLiterals.LINES), TsLiterals.LINE_LITERALS)


if __name__ == "__main__":
    unittest.main()
