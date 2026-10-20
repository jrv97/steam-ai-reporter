"""Check the message catalogs (AGENTS.md rules 4 and 9).

Shipped catalogs (src/locales/<locale>/messages.json):
- keys are snake_case and start with a known prefix;
- every message has a description;
- the `$name$` tokens of a message match its declared placeholders, each `$1`-style content;
- every locale has the same keys and placeholders as English (other locales may add plural
  categories such as `_few` for a base that is plural in English);
- every English key is used: as a string in src/**/*.ts, as `__MSG_<key>__` in a manifest, or in
  scripts/build.py (the userscript header).

Every catalog, shipped or test-only (tests/locales/), must be valid and must not say "uses AI",
"AI-free" or "no AI": the product reports disclosures, it does not judge games.

The literal-flow rules (no hardcoded copy in code) live in lint/restricted-syntax.mjs.

Usage: check_i18n.py
"""

import re
from pathlib import Path

from catalogs import (
    DEFAULT_LOCALE,
    Catalog,
    load,
    plural_base,
    plural_bases,
    used_placeholders,
)
from repo import ROOT, fail

SHIPPED = ROOT / "src" / "locales"
TEST_CATALOGS = ROOT / "tests" / "locales"
PREFIXES = (
    "badge_",
    "summary_",
    "banner_",
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


def main() -> None:
    problems: list[str] = []
    english = load(SHIPPED / DEFAULT_LOCALE / "messages.json")
    for path in sorted(SHIPPED.glob("*/messages.json")):
        catalog = load(path)
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
    if problems:
        print("\n".join(problems))
        fail(f"{len(problems)} catalog problem(s)")


if __name__ == "__main__":
    main()
