"""Unit tests for ts_literals.py (run by `mise run release:test`)."""

import unittest

from ts_literals import Literal, string_literals


def values(text: str) -> list[str]:
    """The parts of every literal, flat."""
    return [part for literal in string_literals(text) for part in literal.parts]


class QuotedTest(unittest.TestCase):
    def test_reads_single_and_double_quotes(self) -> None:
        self.assertEqual(values("""a("one", 'two');"""), ["one", "two"])

    def test_keeps_the_other_quote_inside(self) -> None:
        self.assertEqual(values("""x = "it's"; y = 'say "hi"';"""), ["it's", 'say "hi"'])

    def test_decodes_escapes(self) -> None:
        text = r"""x = ["a\"b", 'c\'d', "e\nf", "\u00e1", "\u{1F600}", "\x41", "g\
h", "\q"];"""
        self.assertEqual(
            values(text), ['a"b', "c'd", "e\nf", "\u00e1", "\U0001f600", "A", "gh", "q"]
        )

    def test_keeps_a_comment_marker_inside_a_string(self) -> None:
        self.assertEqual(
            values('const url = "https://example.test/a";'), ["https://example.test/a"]
        )

    def test_reads_empty_strings(self) -> None:
        self.assertEqual(values("""a("", '');"""), ["", ""])


class SkippedTest(unittest.TestCase):
    def test_skips_comments(self) -> None:
        text = """// it's "quoted"
/* 'block'
   "comment" */
const real = "kept";"""
        self.assertEqual(values(text), ["kept"])

    def test_skips_regex_literals_with_quotes(self) -> None:
        text = """const a = /["']/g; const b = x.replace(/`/, "ok"); if (/'/.test(s)) {}"""
        self.assertEqual(values(text), ["ok"])

    def test_keeps_a_slash_inside_a_regex_class(self) -> None:
        self.assertEqual(values("""const a = /[/"]/; const b = "x";"""), ["x"])

    def test_reads_past_division(self) -> None:
        self.assertEqual(values("""const half = total / 2; const s = "after";"""), ["after"])
        self.assertEqual(values("""const r = (a + b) / 2 + "x" / 3;"""), ["x"])

    def test_ignores_identifiers_and_type_names(self) -> None:
        text = """type Settings = { parseSettings: () => void };
function openSettingsDialog(): Settings { return create(); }"""
        self.assertEqual(values(text), [])


class TemplateTest(unittest.TestCase):
    def test_is_one_literal_with_a_part_per_static_chunk(self) -> None:
        self.assertEqual(
            string_literals("`Version ${version} of ${name}.`"),
            [Literal(1, ("Version ", " of ", "."))],
        )
        self.assertEqual(string_literals("`plain`"), [Literal(1, ("plain",))])

    def test_scans_expressions_and_nested_templates(self) -> None:
        text = 'x = `a${"b"}c${`d${e}f`}g`;'
        self.assertEqual(
            string_literals(text),
            [Literal(1, ("b",)), Literal(1, ("d", "f")), Literal(1, ("a", "c", "g"))],
        )

    def test_survives_braces_in_an_expression(self) -> None:
        text = "x = `a${fn({ k: 1 })}b`; y = 'after';"
        self.assertEqual(string_literals(text), [Literal(1, ("a", "b")), Literal(1, ("after",))])

    def test_decodes_escapes_in_a_template(self) -> None:
        self.assertEqual(values(r"x = `a\`b\${c}\n`;"), ["a`b${c}\n"])


class LineTest(unittest.TestCase):
    def test_reports_the_line_where_a_literal_starts(self) -> None:
        text = """const a = 1;
/* two
   lines */
const b = "here";
const c = `
  multi ${d} line
`;"""
        self.assertEqual(
            string_literals(text),
            [Literal(4, ("here",)), Literal(5, ("\n  multi ", " line\n"))],
        )


if __name__ == "__main__":
    unittest.main()
