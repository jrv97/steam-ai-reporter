"""Check the message catalogs (AGENTS.md rules 4 and 9).

Shipped catalogs (src/locales/<locale>/messages.json):
- keys are snake_case and start with a known prefix (`kind_` names a tag kind's words);
- every message has a description;
- the `$name$` tokens of a message match its declared placeholders, each `$1`-style content;
- every locale has the same keys and placeholders as English (other locales may add plural
  categories such as `_few` for a base that is plural in English);
- every English key is used: as a string in src/**/*.ts, as `__MSG_<key>__` in a manifest, or in
  scripts/build.py (the userscript header).

Every catalog, shipped or test-only (tests/locales/), must be valid and must not say "uses AI",
"AI-free" or "no AI": the product reports disclosures, it does not judge games.

No string literal under src/ or tests/ may repeat catalog text (rule 9): code and tests read copy
from the catalog. The detection constants (DETECTION_CONSTANTS) are the one exception. A literal is
catalog text when, trimmed, it either
- equals a whole message of any shipped locale, each `$name$` standing for any text; or
- shares MIN_SHARED or more characters with the text between a message's placeholders: it
  contains that text, or is a piece of it.
Shorter shared text is a word that also occurs inside identifiers and header names ("Settings" in
`parseSettings`), so only a whole-message match catches the short messages. tests/locales/ and
tests/fixtures/ hold their own catalogs and captured Steam pages, so they are not scanned.

The literal-flow rules (no hardcoded copy in code sinks) live in lint/restricted-syntax.mjs.

Usage: check_i18n.py
"""

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

from catalogs import (
    DEFAULT_LOCALE,
    Catalog,
    load,
    plural_base,
    plural_bases,
    static_parts,
    used_placeholders,
)
from repo import ROOT, fail
from ts_literals import string_literals

SHIPPED = ROOT / "src" / "locales"
TEST_CATALOGS = ROOT / "tests" / "locales"
PREFIXES = (
    "badge_",
    "banner_",
    "kind_",
    "options_",
    "error_",
    "warn_",
    "notice_",
    "ext_",
    "userscript_",
)
KEY = re.compile(r"^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")
CONTENT = re.compile(r"^\$[1-9]$")
FORBIDDEN = re.compile(r"\buses AI\b|\bAI-free\b|\bno AI\b", re.IGNORECASE)

# Steam's own words that detection matches on the store page. A catalog message may repeat one, as
# the AI heading does, without making the detection literal a copy of the message.
DETECTION_CONSTANTS = frozenset({"AI Generated Content Disclosure"})

MIN_SHARED = 12
MIN_WILDCARD_TEXT = 4
SOURCE_ROOTS = ("src", "tests")
SOURCE_SUFFIXES = {".ts", ".mts", ".js", ".mjs"}
UNSCANNED = ("tests/locales/", "tests/fixtures/")
GENERATED = ".gen.ts"
EXPRESSION = "\0"


@dataclass(frozen=True, order=True)
class Ref:
    """A catalog message: its locale and key."""

    locale: str
    key: str

    def label(self) -> str:
        return self.key if self.locale == DEFAULT_LOCALE else f"{self.key} ({self.locale})"


@dataclass(frozen=True)
class CopyIndex:
    """Every message of the shipped catalogs, ready to match against a literal."""

    whole: Mapping[str, tuple[Ref, ...]]
    patterns: tuple[tuple[re.Pattern[str], Ref], ...]
    shared: tuple[tuple[str, Ref], ...]

    def matches(self, parts: Sequence[str]) -> list[Ref]:
        """The messages a literal repeats: a string is one part, a template has one per chunk."""
        found: set[Ref] = set()
        for part in parts:
            text = part.strip()
            found.update(self.whole.get(text, ()))
            if len(text) >= MIN_SHARED:
                found.update(ref for shared, ref in self.shared if shared in text or text in shared)
        whole = EXPRESSION.join(parts).strip()
        found.update(ref for pattern, ref in self.patterns if pattern.fullmatch(whole))
        return sorted(found)


def copy_index(catalogs: Mapping[str, Catalog]) -> CopyIndex:
    whole: dict[str, list[Ref]] = {}
    patterns: list[tuple[re.Pattern[str], Ref]] = []
    shared: list[tuple[str, Ref]] = []
    for locale, catalog in catalogs.items():
        for key, entry in catalog.items():
            ref = Ref(locale, key)
            message = entry.message.strip()
            parts = static_parts(message)
            if len(parts) == 1:
                whole.setdefault(message, []).append(ref)
            elif len("".join(parts).strip()) >= MIN_WILDCARD_TEXT:
                wildcard = ".+".join(re.escape(part) for part in parts)
                patterns.append((re.compile(wildcard, re.DOTALL), ref))
            shared += [(part.strip(), ref) for part in parts if len(part.strip()) >= MIN_SHARED]
    return CopyIndex(
        {text: tuple(refs) for text, refs in whole.items()}, tuple(patterns), tuple(shared)
    )


def entry_problems(path: Path, catalog: Catalog) -> list[str]:
    problems: list[str] = []
    for key, entry in catalog.items():
        where = f"{path.relative_to(ROOT).as_posix()}: {key}"
        if not entry.description:
            problems.append(f"{where}: missing description")
        if used_placeholders(entry.message) != entry.placeholders:
            problems.append(f"{where}: $name$ tokens do not match the declared placeholders")
        if FORBIDDEN.search(entry.message):
            problems.append(f"{where}: forbidden wording (rule 4)")
    raw = path.read_text(encoding="utf-8")
    for content in re.findall(r'"content"\s*:\s*"([^"]*)"', raw):
        if not CONTENT.match(content):
            problems.append(f"{path.relative_to(ROOT).as_posix()}: placeholder content {content!r}")
    return problems


def parity_problems(locale: str, catalog: Catalog, english: Catalog) -> list[str]:
    bases = plural_bases(english)
    problems: list[str] = []
    for key in sorted(english.keys() - catalog.keys()):
        problems.append(f"{locale}: missing {key}")
    for key in sorted(catalog.keys() - english.keys()):
        if plural_base(key) not in bases:
            problems.append(f"{locale}: {key} is not in the English catalog")
    for key in sorted(english.keys() & catalog.keys()):
        if english[key].placeholders != catalog[key].placeholders:
            problems.append(f"{locale}: {key} placeholders differ from English")
    return problems


def corpus() -> str:
    sources = [
        path
        for path in sorted((ROOT / "src").rglob("*.ts"))
        if not path.name.endswith((".test.ts", ".gen.ts"))
    ]
    sources += sorted((ROOT / "src" / "platform").rglob("manifest.*.json"))
    sources.append(ROOT / "scripts" / "build.py")
    return "\n".join(path.read_text(encoding="utf-8") for path in sources)


def unused_problems(english: Catalog) -> list[str]:
    text = corpus()
    bases = plural_bases(english)
    names: set[str] = set()
    for key in english:
        base = plural_base(key)
        names.add(base if base is not None and base in bases else key)
    return [
        f"{DEFAULT_LOCALE}: {name} is not used in src/ or scripts/build.py"
        for name in sorted(names)
        if f'"{name}"' not in text and f"__MSG_{name}__" not in text
    ]


def scanned_sources(root: Path) -> list[Path]:
    """The source files whose string literals must not repeat catalog text."""
    paths: list[Path] = []
    for base in SOURCE_ROOTS:
        for path in sorted((root / base).rglob("*")):
            relative = path.relative_to(root).as_posix()
            if (
                path.suffix in SOURCE_SUFFIXES
                and not path.name.endswith(GENERATED)
                and not relative.startswith(UNSCANNED)
            ):
                paths.append(path)
    return paths


def copy_problems(root: Path, catalogs: Mapping[str, Catalog]) -> list[str]:
    index = copy_index(catalogs)
    problems: list[str] = []
    for path in scanned_sources(root):
        where = path.relative_to(root).as_posix()
        for literal in string_literals(path.read_text(encoding="utf-8")):
            if len(literal.parts) == 1 and literal.parts[0].strip() in DETECTION_CONSTANTS:
                continue
            refs = index.matches(literal.parts)
            if refs:
                keys = ", ".join(dict.fromkeys(ref.label() for ref in refs))
                problems.append(f"{where}:{literal.line}: {keys}: catalog text in a string literal")
    return problems


def main() -> None:
    problems: list[str] = []
    english = load(SHIPPED / DEFAULT_LOCALE / "messages.json")
    shipped: dict[str, Catalog] = {}
    for path in sorted(SHIPPED.glob("*/messages.json")):
        catalog = load(path)
        shipped[path.parent.name] = catalog
        problems += entry_problems(path, catalog)
        problems += [f"{path}: {key}: not snake_case" for key in catalog if not KEY.match(key)]
        problems += [
            f"{path}: {key}: needs a prefix from {', '.join(PREFIXES)}"
            for key in catalog
            if not key.startswith(PREFIXES)
        ]
        if path.parent.name != DEFAULT_LOCALE:
            problems += parity_problems(path.parent.name, catalog, english)
    for path in sorted(TEST_CATALOGS.glob("*/messages.json")):
        problems += entry_problems(path, load(path))
    problems += unused_problems(english)
    problems += copy_problems(ROOT, shipped)
    if problems:
        print("\n".join(problems))
        fail(f"{len(problems)} catalog problem(s)")


if __name__ == "__main__":
    main()
