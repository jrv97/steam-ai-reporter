"""Unit tests for calver.py (run by `mise run release:test`)."""

import unittest
from datetime import date

from calver import MAX_SEGMENT, next_version, parse

DAY = date(2026, 10, 5)


class ParseTest(unittest.TestCase):
    def test_accepts_unpadded_versions(self) -> None:
        self.assertEqual(parse("2026.10.5"), (2026, 10, 5, 0))
        self.assertEqual(parse("2026.1.31.2"), (2026, 1, 31, 2))
        self.assertEqual(parse(f"2026.12.31.{MAX_SEGMENT}"), (2026, 12, 31, MAX_SEGMENT))

    def test_rejects_padding_and_bad_shapes(self) -> None:
        for text in (
            "2026.10.05",
            "2026.01.5",
            "2026.10.5.01",
            "2026.10.5.0",
            "v2026.10.5",
            "2026.10",
            "2026.10.5.1.1",
            "2026.13.1",
            "2026.2.30",
            f"2026.10.5.{MAX_SEGMENT + 1}",
            "0.0.0",
            "2026.10.5-1",
        ):
            with self.subTest(text=text):
                self.assertIsNone(parse(text))


class NextVersionTest(unittest.TestCase):
    def test_first_release_of_the_day_is_never_padded(self) -> None:
        self.assertEqual(next_version(DAY, []), "2026.10.5")
        self.assertEqual(next_version(date(2027, 1, 9), ["2026.10.5"]), "2027.1.9")

    def test_recut_increments_from_one(self) -> None:
        self.assertEqual(next_version(DAY, ["2026.10.5"]), "2026.10.5.1")
        self.assertEqual(next_version(DAY, ["2026.10.5", "2026.10.5.1"]), "2026.10.5.2")
        self.assertEqual(next_version(DAY, ["2026.10.5.2", "2026.10.5"]), "2026.10.5.3")

    def test_earlier_days_and_other_tags_are_ignored(self) -> None:
        tags = ["2026.10.4", "2026.10.4.7", "nightly", "v1.0.0", "2026.10.05"]
        self.assertEqual(next_version(DAY, tags), "2026.10.5")

    def test_at_most_four_segments(self) -> None:
        version = next_version(DAY, ["2026.10.5", "2026.10.5.9"])
        self.assertEqual(len(version.split(".")), 4)

    def test_segments_stay_within_the_chrome_limit(self) -> None:
        with self.assertRaises(ValueError):
            next_version(DAY, ["2026.10.5", f"2026.10.5.{MAX_SEGMENT}"])

    def test_a_tag_newer_than_today_fails(self) -> None:
        with self.assertRaises(ValueError):
            next_version(DAY, ["2026.10.6"])


if __name__ == "__main__":
    unittest.main()
