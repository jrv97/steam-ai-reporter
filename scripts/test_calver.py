"""Unit tests for calver.py (run by `mise run release:test`)."""

import unittest

from calver import next_version, parse
from testdata import Calver


class ParseTest(unittest.TestCase):
    def test_accepts_unpadded_versions(self) -> None:
        for text, version in Calver.PARSED:
            with self.subTest(text=text):
                self.assertEqual(parse(text), version)

    def test_rejects_padding_and_bad_shapes(self) -> None:
        for text in Calver.UNPARSABLE:
            with self.subTest(text=text):
                self.assertIsNone(parse(text))


class NextVersionTest(unittest.TestCase):
    def test_is_today_unpadded_then_its_next_recut_up_to_four_segments(self) -> None:
        for today, tags, version in Calver.NEXT:
            with self.subTest(today=today, tags=tags):
                self.assertEqual(next_version(today, tags), version)

    def test_fails_past_the_chrome_segment_limit_or_on_a_tag_newer_than_today(self) -> None:
        for today, tags in Calver.NO_NEXT:
            with self.subTest(tags=tags), self.assertRaises(ValueError):
                next_version(today, tags)


if __name__ == "__main__":
    unittest.main()
