"""Unit tests for the literal-copy check of check_i18n.py (run by `mise run release:test`)."""

import tempfile
import unittest
from pathlib import Path

from catalogs import load, static_parts
from check_i18n import (
    MIN_WILDCARD_TEXT,
    SHIPPED,
    CopyIndex,
    copy_index,
    copy_problems,
    scanned_sources,
)
from testdata import CheckI18n, catalog


def keys(index: CopyIndex, *parts: str) -> list[str]:
    return [ref.label() for ref in index.matches(parts)]


class MatchTest(unittest.TestCase):
    def test_matches_a_literal_to_the_catalog_keys_whose_text_it_repeats(self) -> None:
        index = copy_index(CheckI18n.CATALOGS)
        for parts, expected in CheckI18n.MATCHES:
            with self.subTest(parts=parts):
                self.assertEqual(keys(index, *parts), expected)

    def test_a_detection_constant_still_matches_a_message_that_equals_it(self) -> None:
        index = copy_index(CheckI18n.HEADING_CATALOGS)
        self.assertEqual(keys(index, CheckI18n.HEADING), ["banner_heading"])


class ShippedCatalogsTest(unittest.TestCase):
    def test_every_shipped_message_is_caught_as_a_string_and_as_a_template(self) -> None:
        shipped = {path.parent.name: load(path) for path in SHIPPED.glob("*/messages.json")}
        index = copy_index(shipped)
        for locale, messages in shipped.items():
            for key, entry in messages.items():
                parts = tuple(static_parts(entry.message))
                if len(parts) > 1 and len("".join(parts).strip()) < MIN_WILDCARD_TEXT:
                    # Only placeholders and punctuation: no literal can be told from it.
                    continue
                with self.subTest(locale=locale, key=key):
                    self.assertTrue(index.matches(("x".join(parts),)), entry.message)
                    self.assertTrue(index.matches(parts), entry.message)


class ScanTest(unittest.TestCase):
    def setUp(self) -> None:
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)

    def write(self, relative: str, text: str) -> None:
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def test_reports_each_literal_with_its_line_and_keys(self) -> None:
        self.write(CheckI18n.REPORTED_FILE, CheckI18n.REPORTED_SOURCE)
        self.assertEqual(copy_problems(self.root, CheckI18n.CATALOGS), list(CheckI18n.REPORTED))

    def test_a_detection_constant_may_repeat_a_message(self) -> None:
        catalogs = {"en": catalog(kind_ai_heading=CheckI18n.HEADING)}
        self.write(CheckI18n.HEADING_FILE, CheckI18n.HEADING_SOURCE)
        self.assertEqual(copy_problems(self.root, catalogs), [])
        self.write(CheckI18n.HEADING_COPY_FILE, CheckI18n.HEADING_COPY_SOURCE)
        self.assertEqual(
            copy_problems(self.root, catalogs),
            [f"{CheckI18n.HEADING_COPY_FILE}:1: kind_ai_heading: {CheckI18n.HIT}"],
        )

    def test_ignores_comments_identifiers_and_type_names(self) -> None:
        self.write(CheckI18n.COMMENTED_FILE, CheckI18n.COMMENTED_SOURCE)
        self.assertEqual(copy_problems(self.root, CheckI18n.CATALOGS), [])

    def test_skips_generated_files_and_the_test_catalog_and_fixture_folders(self) -> None:
        for name in CheckI18n.SKIPPED_FILES:
            self.write(name, CheckI18n.SEEDED_SOURCE)
        self.write(CheckI18n.SOURCE_CATALOG_FILE, CheckI18n.SOURCE_CATALOG)
        self.assertEqual(copy_problems(self.root, CheckI18n.CATALOGS), [])
        self.assertEqual(scanned_sources(self.root), [])

    def test_scans_every_source_suffix_under_src_and_tests(self) -> None:
        for name in CheckI18n.SCANNED_FILES:
            self.write(name, CheckI18n.EMPTY_MODULE)
        self.write(CheckI18n.UNSCANNED_FILE, CheckI18n.SEEDED_SOURCE)
        self.assertEqual(
            [path.relative_to(self.root).as_posix() for path in scanned_sources(self.root)],
            list(CheckI18n.SCANNED_FILES),
        )


if __name__ == "__main__":
    unittest.main()
