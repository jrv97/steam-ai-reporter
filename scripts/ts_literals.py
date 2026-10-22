"""List the string literals of a TypeScript or JavaScript source text.

A small scanner, not a parser: it skips comments and regular expression literals, reads single,
double and template literals, and decodes escapes. A template is one literal whose parts are the
static chunks around its `${}` expressions; the expressions are scanned too. Used by
check_i18n.py to find catalog text typed as a literal.
"""

import re
from collections.abc import Iterator
from dataclasses import dataclass

# What the scanner stops at: a comment, a quote, a possible regex, or a brace.
STOPS = re.compile(r"""//|/\*|["'`/{}]""")
QUOTED_END = {'"': re.compile(r'["\\\n]'), "'": re.compile(r"['\\\n]")}
TEMPLATE_END = re.compile(r"[`\\]|\$\{")
ESCAPES = {"n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f", "v": "\v", "0": "\0"}
HEX = re.compile(r"[0-9A-Fa-f]+")
CODE_POINT = re.compile(r"\{([0-9A-Fa-f]+)\}")
MAX_CODE_POINT = 0x10FFFF
# A `/` after one of these characters or keywords starts a regex; after anything else it divides.
REGEX_AFTER_CHARS = frozenset("(,=:[!&|?{};+-*%<>~^")
REGEX_AFTER_WORDS = frozenset(
    {
        "return",
        "typeof",
        "case",
        "do",
        "else",
        "in",
        "of",
        "void",
        "delete",
        "throw",
        "new",
        "yield",
        "await",
        "instanceof",
    }
)
LONGEST_KEYWORD = max(map(len, REGEX_AFTER_WORDS))
WORD_BEFORE = re.compile(r"[A-Za-z_$][\w$]*$")


@dataclass(frozen=True)
class Literal:
    """A string literal: one part, or the static chunks of a template between its expressions."""

    line: int
    parts: tuple[str, ...]


def string_literals(text: str) -> list[Literal]:
    """The decoded string literals of `text` with their 1-based start lines, in line order."""
    return sorted(_Scanner(text).code(until_brace=False), key=lambda literal: literal.line)


class _Scanner:
    def __init__(self, text: str) -> None:
        self.text = text
        self.pos = 0

    def line_at(self, index: int) -> int:
        return self.text.count("\n", 0, index) + 1

    def code(self, until_brace: bool) -> Iterator[Literal]:
        """Scan code until the end of the text, or the `}` that closes a template expression."""
        depth = 0
        text = self.text
        while (stop := STOPS.search(text, self.pos)) is not None:
            marker = stop.group()
            start = stop.start()
            self.pos = start + len(marker)
            if marker == "//":
                newline = text.find("\n", self.pos)
                self.pos = len(text) if newline < 0 else newline
            elif marker == "/*":
                close = text.find("*/", self.pos)
                self.pos = len(text) if close < 0 else close + 2
            elif marker == "/":
                if self.starts_regex(start):
                    self.skip_regex()
            elif marker == "{":
                depth += 1
            elif marker == "}":
                if until_brace and depth == 0:
                    return
                depth -= 1
            elif marker == "`":
                yield from self.template(start)
            else:
                yield self.quoted(marker, start)

    def starts_regex(self, slash: int) -> bool:
        end = slash
        while end > 0 and self.text[end - 1].isspace():
            end -= 1
        if end == 0 or self.text[end - 1] in REGEX_AFTER_CHARS:
            return True
        word = WORD_BEFORE.search(self.text[max(0, end - LONGEST_KEYWORD) : end])
        return word is not None and word.group() in REGEX_AFTER_WORDS

    def skip_regex(self) -> None:
        text = self.text
        in_class = False
        while self.pos < len(text):
            char = text[self.pos]
            self.pos += 1
            if char == "\\":
                self.pos += 1
            elif char == "\n":
                return
            elif char == "[":
                in_class = True
            elif char == "]":
                in_class = False
            elif char == "/" and not in_class:
                return

    def quoted(self, quote: str, start: int) -> Literal:
        text = self.text
        end = QUOTED_END[quote]
        chunks: list[str] = []
        while (stop := end.search(text, self.pos)) is not None:
            chunks.append(text[self.pos : stop.start()])
            self.pos = stop.end()
            if stop.group() == "\\":
                chunks.append(self.escape())
            else:
                break
        return Literal(self.line_at(start), ("".join(chunks),))

    def template(self, start: int) -> Iterator[Literal]:
        text = self.text
        chunks: list[str] = []
        parts: list[str] = []
        while (stop := TEMPLATE_END.search(text, self.pos)) is not None:
            chunks.append(text[self.pos : stop.start()])
            self.pos = stop.end()
            marker = stop.group()
            if marker == "\\":
                chunks.append(self.escape())
            elif marker == "`":
                break
            else:
                parts.append("".join(chunks))
                chunks = []
                yield from self.code(until_brace=True)
        parts.append("".join(chunks))
        yield Literal(self.line_at(start), tuple(parts))

    def escape(self) -> str:
        """Decode the escape after a backslash, leaving the position after it."""
        char = self.text[self.pos : self.pos + 1]
        self.pos += 1
        if char == "x":
            return self.hex_escape(2)
        if char == "u":
            return self.code_point_escape() or self.hex_escape(4)
        if char == "\r" and self.text.startswith("\n", self.pos):
            self.pos += 1
        if char in ("\r", "\n"):
            return ""
        return ESCAPES.get(char, char)

    def code_point_escape(self) -> str:
        """Decode the `{...}` of a `\\u{...}` escape, or return "" when there is none."""
        braced = CODE_POINT.match(self.text, self.pos)
        if braced is None:
            return ""
        self.pos = braced.end()
        code = int(braced.group(1), 16)
        return chr(code) if code <= MAX_CODE_POINT else ""

    def hex_escape(self, length: int) -> str:
        digits = self.text[self.pos : self.pos + length]
        if len(digits) != length or HEX.fullmatch(digits) is None:
            return ""
        self.pos += length
        return chr(int(digits, 16))
