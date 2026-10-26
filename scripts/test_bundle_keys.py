"""Unit tests for bundle_keys.py, which gen_catalogs.py and check_bundle.py share."""

import unittest

from bundle_keys import carried_keys, computed_keys, message_names, name_of, read_names
from catalogs import Catalog, Entry, used_placeholders


def catalog(*keys: str) -> Catalog:
    return {key: Entry(key, key, "A description.", used_placeholders(key)) for key in keys}


ENGLISH = catalog("banner_undo", "options_title", "notice_hidden_one", "notice_hidden_other")
NAMES = message_names(ENGLISH)


def bundle(*code: str, entries: tuple[str, ...] = ()) -> str:
    """Bundle text as esbuild prints it: code lines, then an inlined catalog with `entries`."""
    lines = [*code, "  var CATALOGS = {", '    "en": {']
    lines += [f'      "{key}": {{ message: "Text for {key}" }},' for key in entries]
    lines += ["    }", "  };"]
    return "\n".join(lines)


class NamesTest(unittest.TestCase):
    def test_plural_forms_go_by_their_base(self) -> None:
        self.assertEqual(NAMES, {"banner_undo", "options_title", "notice_hidden"})
        bases = {"notice_hidden"}
        self.assertEqual(name_of("notice_hidden_few", bases), "notice_hidden")
        self.assertEqual(name_of("banner_undo", bases), "banner_undo")


class ReadTest(unittest.TestCase):
    def test_reads_key_and_plural_base_literals_of_the_code(self) -> None:
        script = bundle('i18n.t("banner_undo");', "i18n.plural('notice_hidden', n);")
        self.assertEqual(read_names(script, NAMES), {"banner_undo", "notice_hidden"})

    def test_ignores_catalog_entries_comments_and_other_literals(self) -> None:
        script = bundle(
            '// i18n.t("options_title")',
            'el.className = "options_title_row";',
            entries=("banner_undo", "options_title"),
        )
        self.assertEqual(read_names(script, NAMES), set())

    def test_carries_the_keys_of_inlined_catalog_entries(self) -> None:
        script = bundle('i18n.t("banner_undo");', entries=("banner_undo", "notice_hidden_one"))
        self.assertEqual(carried_keys(script), {"banner_undo", "notice_hidden_one"})


class ComputedTest(unittest.TestCase):
    def test_flags_a_template_that_starts_a_key(self) -> None:
        script = bundle("i18n.t(`options_${part}`);", "i18n.t(`banner_${a}_${b}`);")
        self.assertEqual(computed_keys(script, NAMES), ["options_${}", "banner_${}_${}"])

    def test_leaves_templates_that_start_no_key_alone(self) -> None:
        for code in ("`${base}_other`", "`sar-${name}`", "`options`", "`kind_${id}`"):
            with self.subTest(code=code):
                self.assertEqual(computed_keys(bundle(code), NAMES), [])


if __name__ == "__main__":
    unittest.main()
