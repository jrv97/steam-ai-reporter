"""Unit tests for the literal-copy check of check_i18n.py (run by `mise run release:test`)."""

import tempfile
import unittest
from pathlib import Path

from catalogs import Catalog, Entry, load, static_parts, used_placeholders
from check_i18n import SHIPPED, CopyIndex, copy_index, copy_problems, scanned_sources


def catalog(**messages: str) -> Catalog:
    return {
        key: Entry(key, message, "A description.", used_placeholders(message))
        for key, message in messages.items()
    }


ENGLISH = catalog(
    banner_undo="Undo",
    notice_settings_saved="Saved.",
    userscript_menu_settings="Settings",
    options_version="Version $version$",
    options_allow_restore_label="Stop ignoring $name$",
    banner_source="In the developer's own words:",
    options_privacy_lookup="To check a game, it asks Valve's own store servers.",
    only_placeholder="$count$",
    short_with_placeholder="$n$ ok",
)
SPANISH = catalog(banner_undo="Deshacer", banner_source="En palabras del desarrollador:")
CATALOGS = {"en": ENGLISH, "es": SPANISH}
HIT = "catalog text in a string literal"


def keys(index: CopyIndex, *parts: str) -> list[str]:
    return [ref.label() for ref in index.matches(parts)]


class MatchTest(unittest.TestCase):
    def setUp(self) -> None:
        self.index = copy_index(CATALOGS)

    def test_a_literal_equal_to_a_short_message_matches(self) -> None:
        self.assertEqual(keys(self.index, "Undo"), ["banner_undo"])
        self.assertEqual(keys(self.index, "Saved."), ["notice_settings_saved"])
        self.assertEqual(keys(self.index, " Undo "), ["banner_undo"])
        self.assertEqual(keys(self.index, "Deshacer"), ["banner_undo (es)"])

    def test_a_short_word_inside_a_longer_literal_does_not_match(self) -> None:
        for literal in ("Undo the change", "parseSettings", "Accept-Settings", "undo", "Sav"):
            with self.subTest(literal=literal):
                self.assertEqual(keys(self.index, literal), [])

    def test_a_placeholder_message_matches_when_the_whole_literal_fits(self) -> None:
        self.assertEqual(keys(self.index, "Version 2026.10.20"), ["options_version"])
        self.assertEqual(
            keys(self.index, "Stop ignoring Some Game"), ["options_allow_restore_label"]
        )
        self.assertEqual(keys(self.index, "Version"), [])
        self.assertEqual(keys(self.index, "Versions of 3"), [])

    def test_a_template_expression_stands_for_a_placeholder(self) -> None:
        self.assertEqual(keys(self.index, "Version ", ""), ["options_version"])
        self.assertEqual(keys(self.index, "Stop ignoring ", ""), ["options_allow_restore_label"])
        self.assertEqual(keys(self.index, "", "Undo", " now"), ["banner_undo"])
        self.assertEqual(keys(self.index, "", " is ", ""), [])
        self.assertEqual(keys(self.index, "Versions ", ""), [])

    def test_placeholder_messages_with_little_static_text_never_match_everything(self) -> None:
        self.assertEqual(keys(self.index, "anything at all"), [])
        self.assertEqual(keys(self.index, "3 ok"), [])

    def test_long_catalog_text_matches_inside_a_longer_literal(self) -> None:
        self.assertEqual(
            keys(self.index, "<p>In the developer's own words: <b>x</b></p>"), ["banner_source"]
        )
        self.assertEqual(
            keys(self.index, "En palabras del desarrollador: x"), ["banner_source (es)"]
        )

    def test_a_long_piece_of_a_message_matches(self) -> None:
        self.assertEqual(keys(self.index, "asks Valve's own store"), ["options_privacy_lookup"])
        self.assertEqual(keys(self.index, "own words"), [])

    def test_matching_is_case_sensitive(self) -> None:
        self.assertEqual(keys(self.index, "in the developer's own words:"), [])
        self.assertEqual(keys(self.index, "Banner_Undo"), [])

    def test_an_empty_literal_never_matches(self) -> None:
        self.assertEqual(keys(self.index, ""), [])
        self.assertEqual(keys(self.index, "   "), [])


class ShippedCatalogsTest(unittest.TestCase):
    def test_every_shipped_message_is_caught_as_a_string_and_as_a_template(self) -> None:
        shipped = {path.parent.name: load(path) for path in SHIPPED.glob("*/messages.json")}
        index = copy_index(shipped)
        for locale, messages in shipped.items():
            for key, entry in messages.items():
                parts = tuple(static_parts(entry.message))
                with self.subTest(locale=locale, key=key):
                    self.assertTrue(index.matches(("x".join(parts),)), entry.message)
                    self.assertTrue(index.matches(parts), entry.message)


class ScanTest(unittest.TestCase):
    def test_flags_a_seeded_literal_in_a_test_file(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            write(root, "src/core/ui/banner.test.ts", 'expect(button.textContent).toBe("Undo");\n')
            self.assertEqual(
                copy_problems(root, CATALOGS),
                [f"src/core/ui/banner.test.ts:1: banner_undo: {HIT}"],
            )

    def test_reports_each_literal_with_its_line_and_keys(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            write(
                root,
                "tests/helpers/a.ts",
                'const a = 1;\nconst b = `Saved.${x}`;\nf("Deshacer");\n',
            )
            self.assertEqual(
                copy_problems(root, CATALOGS),
                [
                    f"tests/helpers/a.ts:2: notice_settings_saved: {HIT}",
                    f"tests/helpers/a.ts:3: banner_undo (es): {HIT}",
                ],
            )

    def test_ignores_comments_identifiers_and_type_names(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            write(
                root,
                "src/core/settings.ts",
                '// Undo the change. Saved.\ntype Settings = { parseSettings: () => "kept" };\n',
            )
            self.assertEqual(copy_problems(root, CATALOGS), [])

    def test_skips_generated_files_and_the_test_catalog_and_fixture_folders(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            seeded = 'export const text = "Undo";\n'
            write(root, "src/core/i18n/keys.gen.ts", seeded)
            write(root, "tests/locales/keys.gen.ts", seeded)
            write(root, "tests/locales/messages.ts", seeded)
            write(root, "tests/fixtures/page.ts", seeded)
            write(root, "docs/design/previews/a.ts", seeded)
            write(root, "src/locales/en/messages.json", '{"banner_undo": {"message": "Undo"}}')
            self.assertEqual(copy_problems(root, CATALOGS), [])
            self.assertEqual(scanned_sources(root), [])

    def test_scans_every_source_suffix_under_src_and_tests(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in ("src/a.ts", "src/deep/b.mts", "tests/c.test.ts", "tests/helpers/d.d.ts"):
                write(root, name, "export {};\n")
            write(root, "src/notes.md", "Undo\n")
            self.assertEqual(
                [path.relative_to(root).as_posix() for path in scanned_sources(root)],
                ["src/a.ts", "src/deep/b.mts", "tests/c.test.ts", "tests/helpers/d.d.ts"],
            )


def write(root: Path, relative: str, text: str) -> None:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
