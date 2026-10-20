"""Read Chrome messages.json catalogs: entries, placeholders and plural forms.

Shared by gen_i18n_keys.py and check_i18n.py, so both read catalogs the same way as the core
runtime (src/core/i18n/catalog.ts).
"""

import re
from dataclasses import dataclass
from pathlib import Path

from repo import json_object, json_string, read_json

DEFAULT_LOCALE = "en"
PLURAL_CATEGORIES = ("zero", "one", "two", "few", "many", "other")
PLACEHOLDER = re.compile(r"\$([A-Za-z0-9_@]+)\$")


@dataclass(frozen=True)
class Entry:
    key: str
    message: str
    description: str | None
    placeholders: tuple[str, ...]


Catalog = dict[str, Entry]


def load(path: Path) -> Catalog:
    raw = json_object(read_json(path), str(path))
    catalog: Catalog = {}
    for key, value in raw.items():
        where = f"{path} {key}"
        entry = json_object(value, where)
        description = entry.get("description")
        declared = json_object(entry.get("placeholders", {}), f"{where}.placeholders")
        catalog[key] = Entry(
            key=key,
            message=json_string(entry.get("message"), f"{where}.message"),
            description=description if isinstance(description, str) else None,
            placeholders=tuple(sorted(name.lower() for name in declared)),
        )
    return catalog


def used_placeholders(message: str) -> tuple[str, ...]:
    return tuple(sorted({name.lower() for name in PLACEHOLDER.findall(message)}))


def plural_base(key: str) -> str | None:
    """The base key if `key` is a plural form such as `items_one`, else None."""
    base, _, category = key.rpartition("_")
    return base if base and category in PLURAL_CATEGORIES else None


def plural_bases(catalog: Catalog) -> set[str]:
    """Bases with an `_other` form; their `_<category>` keys are plural forms, not messages."""
    return {key.removesuffix("_other") for key in catalog if key.endswith("_other")}
