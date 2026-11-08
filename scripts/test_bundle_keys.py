"""Unit tests for bundle_keys.py, which gen_catalogs.py and check_bundle.py share."""

import unittest

from bundle_keys import carried_keys, computed_keys, message_names, name_of, read_names
from testdata import BundleKeys

NAMES = message_names(BundleKeys.ENGLISH)


class NamesTest(unittest.TestCase):
    def test_plural_forms_go_by_their_base(self) -> None:
        self.assertEqual(NAMES, BundleKeys.NAMES)
        for key, name in BundleKeys.NAMED:
            with self.subTest(key=key):
                self.assertEqual(name_of(key, BundleKeys.PLURAL_BASES), name)


class ReadTest(unittest.TestCase):
    def test_reads_key_and_plural_base_literals_and_ignores_entries_and_comments(self) -> None:
        for script, names in BundleKeys.read():
            with self.subTest(script=script):
                self.assertEqual(read_names(script, NAMES), names)

    def test_carries_the_keys_of_inlined_catalog_entries(self) -> None:
        script, keys = BundleKeys.carried()
        self.assertEqual(carried_keys(script), keys)


class ComputedTest(unittest.TestCase):
    def test_flags_a_template_that_starts_a_key(self) -> None:
        script, shapes = BundleKeys.computed()
        self.assertEqual(computed_keys(script, NAMES), shapes)

    def test_leaves_templates_that_start_no_key_alone(self) -> None:
        for code in BundleKeys.UNKEYED_TEMPLATES:
            with self.subTest(code=code):
                self.assertEqual(computed_keys(BundleKeys.bundle(code), NAMES), [])


if __name__ == "__main__":
    unittest.main()
