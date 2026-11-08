"""Test data for the script tests: the inputs and expected values they would build by hand.

One namespace per script under test. Tables pair inputs with expected results.
"""

from datetime import date
from typing import Final

from calver import MAX_SEGMENT, Version
from catalogs import Catalog, Entry, used_placeholders
from ts_literals import Literal

# A description that every test catalog entry shares; the checks never read it.
DESCRIPTION: Final = "A description."


def catalog(**messages: str) -> Catalog:
    """A catalog of these messages by key."""
    return {
        key: Entry(key, message, DESCRIPTION, used_placeholders(message))
        for key, message in messages.items()
    }


def keyed_catalog(*keys: str) -> Catalog:
    """A catalog whose messages repeat their keys."""
    return catalog(**{key: key for key in keys})


class Calver:
    """Versions and tags for calver.py."""

    DAY: Final = date(2026, 10, 5)

    PARSED: Final[tuple[tuple[str, Version], ...]] = (
        ("2026.10.5", (2026, 10, 5, 0)),
        ("2026.1.31.2", (2026, 1, 31, 2)),
        (f"2026.12.31.{MAX_SEGMENT}", (2026, 12, 31, MAX_SEGMENT)),
    )

    UNPARSABLE: Final = (
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
    )

    # (today, tags, next version): first release unpadded, recuts from one, other days and tags
    # ignored, never more than four segments.
    NEXT: Final[tuple[tuple[date, tuple[str, ...], str], ...]] = (
        (DAY, (), "2026.10.5"),
        (date(2027, 1, 9), ("2026.10.5",), "2027.1.9"),
        (DAY, ("2026.10.5",), "2026.10.5.1"),
        (DAY, ("2026.10.5", "2026.10.5.1"), "2026.10.5.2"),
        (DAY, ("2026.10.5.2", "2026.10.5"), "2026.10.5.3"),
        (DAY, ("2026.10.4", "2026.10.4.7", "nightly", "v1.0.0", "2026.10.05"), "2026.10.5"),
        (DAY, ("2026.10.5", "2026.10.5.9"), "2026.10.5.10"),
    )

    # (today, tags) with no next version: the segment limit, a tag newer than today.
    NO_NEXT: Final[tuple[tuple[date, tuple[str, ...]], ...]] = (
        (DAY, ("2026.10.5", f"2026.10.5.{MAX_SEGMENT}")),
        (DAY, ("2026.10.6",)),
    )


class CheckI18n:
    """Catalogs, literals and source files for the literal-copy check of check_i18n.py."""

    HEADING: Final = "AI Generated Content Disclosure"
    ENGLISH: Final = catalog(
        banner_undo="Undo",
        notice_settings_saved="Saved.",
        userscript_menu_settings="Settings",
        options_version="Version $version$",
        options_allow_restore_label="Stop ignoring $name$",
        banner_source="In the developer's own words:",
        options_privacy_lookup="To check a game, it asks Valve's own store servers.",
        only_placeholder="$count$",
        short_with_placeholder="$n$ ok",
        ext_description=f"Tags: {HEADING}, PvP.",
    )
    SPANISH: Final = catalog(banner_undo="Deshacer", banner_source="En palabras del desarrollador:")
    CATALOGS: Final = {"en": ENGLISH, "es": SPANISH}
    HIT: Final = "catalog text in a string literal"

    # (literal parts, matching keys) over CATALOGS.
    MATCHES: Final[tuple[tuple[tuple[str, ...], list[str]], ...]] = (
        # A literal equal to a short message matches; a short word inside a longer one does not
        (("Undo",), ["banner_undo"]),
        (("Saved.",), ["notice_settings_saved"]),
        ((" Undo ",), ["banner_undo"]),
        (("Deshacer",), ["banner_undo (es)"]),
        (("Undo the change",), []),
        (("parseSettings",), []),
        (("Accept-Settings",), []),
        (("undo",), []),
        (("Sav",), []),
        # A placeholder message matches when the whole literal fits
        (("Version 2026.10.20",), ["options_version"]),
        (("Stop ignoring Some Game",), ["options_allow_restore_label"]),
        (("Version",), []),
        (("Versions of 3",), []),
        # A template expression stands for a placeholder
        (("Version ", ""), ["options_version"]),
        (("Stop ignoring ", ""), ["options_allow_restore_label"]),
        (("", "Undo", " now"), ["banner_undo"]),
        (("", " is ", ""), []),
        (("Versions ", ""), []),
        # Placeholder messages with little static text never match everything
        (("anything at all",), []),
        (("3 ok",), []),
        # Long catalog text matches inside a longer literal, and so does a long piece of it
        (("<p>In the developer's own words: <b>x</b></p>",), ["banner_source"]),
        (("En palabras del desarrollador: x",), ["banner_source (es)"]),
        (("asks Valve's own store",), ["options_privacy_lookup"]),
        (("own words",), []),
        # A detection constant may repeat a message
        ((HEADING,), []),
        ((f"Tags: {HEADING}, PvP.",), ["ext_description"]),
        # Matching is case-sensitive, and an empty literal never matches
        (("in the developer's own words:",), []),
        (("Banner_Undo",), []),
        (("",), []),
        (("   ",), []),
    )

    # A catalog where a message equals the detection constant.
    HEADING_CATALOGS: Final = {
        "en": catalog(ext_description=f"Tags: {HEADING}, PvP.", banner_heading=HEADING)
    }

    REPORTED_FILE: Final = "tests/helpers/a.ts"
    REPORTED_SOURCE: Final = 'const a = 1;\nconst b = `Saved.${x}`;\nf("Deshacer");\n'
    REPORTED: Final = (
        f"{REPORTED_FILE}:2: notice_settings_saved: {HIT}",
        f"{REPORTED_FILE}:3: banner_undo (es): {HIT}",
    )

    HEADING_FILE: Final = "src/core/kinds/ai.ts"
    HEADING_SOURCE: Final = f'const HEADING = "{HEADING}";\n'
    HEADING_COPY_FILE: Final = "src/core/ui/a.ts"
    HEADING_COPY_SOURCE: Final = f'const a = "{HEADING} (copy)";\n'

    COMMENTED_FILE: Final = "src/core/settings.ts"
    COMMENTED_SOURCE: Final = (
        '// Undo the change. Saved.\ntype Settings = { parseSettings: () => "kept" };\n'
    )

    SEEDED_SOURCE: Final = 'export const text = "Undo";\n'
    SKIPPED_FILES: Final = (
        "src/core/i18n/keys.gen.ts",
        "tests/locales/keys.gen.ts",
        "tests/locales/messages.ts",
        "tests/fixtures/page.ts",
        "docs/design/previews/a.ts",
    )
    SOURCE_CATALOG_FILE: Final = "src/locales/en/messages.json"
    SOURCE_CATALOG: Final = '{"banner_undo": {"message": "Undo"}}'

    EMPTY_MODULE: Final = "export {};\n"
    SCANNED_FILES: Final = ("src/a.ts", "src/deep/b.mts", "tests/c.test.ts", "tests/helpers/d.d.ts")
    UNSCANNED_FILE: Final = "src/notes.md"


class TsLiterals:
    """TypeScript sources and the literals ts_literals.py reads from them."""

    # (source, the parts of every literal, flat): quotes, escapes and empty strings.
    QUOTED: Final[tuple[tuple[str, list[str]], ...]] = (
        ("""a("one", 'two');""", ["one", "two"]),
        ("""x = "it's"; y = 'say "hi"';""", ["it's", 'say "hi"']),
        (
            r"""x = ["a\"b", 'c\'d', "e\nf", "\u00e1", "\u{1F600}", "\x41", "g\
h", "\q"];""",
            ['a"b', "c'd", "e\nf", "\u00e1", "\U0001f600", "A", "gh", "q"],
        ),
        ('const url = "https://example.test/a";', ["https://example.test/a"]),
        ("""a("", '');""", ["", ""]),
    )

    # (source, the parts of every literal, flat): comments, regex literals, division and names.
    SKIPPED: Final[tuple[tuple[str, list[str]], ...]] = (
        (
            """// it's "quoted"
/* 'block'
   "comment" */
const real = "kept";""",
            ["kept"],
        ),
        ("""const a = /["']/g; const b = x.replace(/`/, "ok"); if (/'/.test(s)) {}""", ["ok"]),
        ("""const a = /[/"]/; const b = "x";""", ["x"]),
        ("""const half = total / 2; const s = "after";""", ["after"]),
        ("""const r = (a + b) / 2 + "x" / 3;""", ["x"]),
        (
            """type Settings = { parseSettings: () => void };
function openSettingsDialog(): Settings { return create(); }""",
            [],
        ),
    )

    # (source, literals): a template is one literal with a part per static chunk.
    TEMPLATES: Final[tuple[tuple[str, list[Literal]], ...]] = (
        ("`Version ${version} of ${name}.`", [Literal(1, ("Version ", " of ", "."))]),
        ("`plain`", [Literal(1, ("plain",))]),
        (
            'x = `a${"b"}c${`d${e}f`}g`;',
            [Literal(1, ("b",)), Literal(1, ("d", "f")), Literal(1, ("a", "c", "g"))],
        ),
        (
            "x = `a${fn({ k: 1 })}b`; y = 'after';",
            [Literal(1, ("a", "b")), Literal(1, ("after",))],
        ),
        (r"x = `a\`b\${c}\n`;", [Literal(1, ("a`b${c}\n",))]),
    )

    LINES: Final = """const a = 1;
/* two
   lines */
const b = "here";
const c = `
  multi ${d} line
`;"""
    LINE_LITERALS: Final = [Literal(4, ("here",)), Literal(5, ("\n  multi ", " line\n"))]


class BundleKeys:
    """Catalog keys and bundle code for bundle_keys.py."""

    ENGLISH: Final = keyed_catalog(
        "banner_undo", "options_title", "notice_hidden_one", "notice_hidden_other"
    )
    NAMES: Final = {"banner_undo", "options_title", "notice_hidden"}
    PLURAL_BASES: Final = {"notice_hidden"}
    # (key, the name it goes by among PLURAL_BASES)
    NAMED: Final = (("notice_hidden_few", "notice_hidden"), ("banner_undo", "banner_undo"))

    @staticmethod
    def bundle(*code: str, entries: tuple[str, ...] = ()) -> str:
        """Bundle text as esbuild prints it: code lines, then an inlined catalog with `entries`."""
        lines = [*code, "  var CATALOGS = {", '    "en": {']
        lines += [f'      "{key}": {{ message: "Text for {key}" }},' for key in entries]
        lines += ["    }", "  };"]
        return "\n".join(lines)

    @classmethod
    def read(cls) -> tuple[tuple[str, set[str]], ...]:
        """(bundle, names read): key and plural base literals count; entries and comments not."""
        return (
            (
                cls.bundle('i18n.t("banner_undo");', "i18n.plural('notice_hidden', n);"),
                {"banner_undo", "notice_hidden"},
            ),
            (
                cls.bundle(
                    '// i18n.t("options_title")',
                    'el.className = "options_title_row";',
                    entries=("banner_undo", "options_title"),
                ),
                set(),
            ),
        )

    @classmethod
    def carried(cls) -> tuple[str, set[str]]:
        """A bundle with inlined catalog entries, and their keys."""
        entries = ("banner_undo", "notice_hidden_one")
        return cls.bundle('i18n.t("banner_undo");', entries=entries), set(entries)

    @classmethod
    def computed(cls) -> tuple[str, list[str]]:
        """A bundle with templates that start keys, and their shapes."""
        script = cls.bundle("i18n.t(`options_${part}`);", "i18n.t(`banner_${a}_${b}`);")
        return script, ["options_${}", "banner_${}_${}"]

    # Templates that start no key.
    UNKEYED_TEMPLATES: Final = ("`${base}_other`", "`sar-${name}`", "`options`", "`kind_${id}`")


class Cws:
    """Publisher, item and archive for cws.py."""

    PUBLISHER: Final = "pub"
    EXTENSION: Final = "ext"
    ITEM: Final = f"publishers/{PUBLISHER}/items/{EXTENSION}"
    ARCHIVE_NAME: Final = "chrome.zip"
    ARCHIVE: Final = b"zip-bytes"


class Notes:
    """Release notes for notes.py."""

    FOOTER: Final = "Full notes: https://example.test/releases/tag/1"
    SHORT: Final = "### Added\n- One."
    LONG_LINE_PREFIX: Final = "- Item "
    LONG: Final = "### Added\n" + "\n".join(f"- Item {n} " + "x" * 200 for n in range(40))
    TRAILING_HEADING: Final = "### Changed"
    WITH_TRAILING_HEADING: Final = "### Added\n- " + "a" * 40 + "\n### Changed\n- " + "b" * 3000
    TRAILING_HEADING_LIMIT: Final = 120
    ONE_LONG_LINE: Final = "### Added\n- " + "c" * 500
    ONE_LONG_LINE_LIMIT: Final = 200
    CUT_LINE_END: Final = "c...\n"
